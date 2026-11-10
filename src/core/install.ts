import { WatcherStore } from './store';
import type { ApiRecord, BodyInfo, HeaderList, RequestKind, ResourceTimingInfo, WatcherOptions } from './types';
import {
  byteLength,
  captureInitiator,
  describeRequestBody,
  describeResponseText,
  getHeader,
  headersToList,
  isNextInternal,
  isTextual,
  matchesAny,
  parseRawHeaders,
  parseUrl,
} from './utils';

interface GlobalState {
  store: WatcherStore;
  options: Required<WatcherOptions>;
  /** The unpatched fetch, used for the watcher's own requests so they're never recorded. */
  originalFetch: typeof fetch;
}

const GLOBAL_KEY = '__NEXTJS_API_WATCHER__';
const XHR_KEY = Symbol.for('nextjs-api-watcher.xhr');

type Win = Window & { [GLOBAL_KEY]?: GlobalState };

/**
 * Patches fetch, XMLHttpRequest and the History API exactly once per page lifecycle.
 * Safe to call repeatedly (React Strict Mode, Fast Refresh re-evaluating modules, …).
 */
export function install(opts: WatcherOptions = {}): GlobalState {
  const win = window as Win;
  const existing = win[GLOBAL_KEY];
  if (existing) {
    applyOptions(existing, opts);
    return existing;
  }

  const state: GlobalState = {
    store: new WatcherStore(),
    options: { maxRecords: 1000, maxBodySize: 1024 * 1024, ignore: [], persist: true },
    originalFetch: window.fetch.bind(window),
  };
  applyOptions(state, opts);
  win[GLOBAL_KEY] = state;

  patchFetch(state);
  patchXhr(state);
  patchHistory(state.store);
  observeResourceTiming(state.store);
  return state;
}

function applyOptions(state: GlobalState, opts: WatcherOptions) {
  if (opts.maxRecords != null) state.options.maxRecords = state.store.maxRecords = opts.maxRecords;
  if (opts.maxBodySize != null) state.options.maxBodySize = opts.maxBodySize;
  if (opts.ignore) state.options.ignore = opts.ignore;
  if (opts.persist != null && opts.persist !== state.options.persist) {
    state.options.persist = opts.persist;
    state.store.setPersist(opts.persist);
  }
}

function createRecord(
  store: WatcherStore,
  kind: RequestKind,
  method: string,
  rawUrl: string,
  requestHeaders: HeaderList,
  requestBody: BodyInfo,
  options: Record<string, string>,
): ApiRecord {
  const { url, origin, pathname, query } = parseUrl(rawUrl);
  const upper = method.toUpperCase();
  return {
    id: store.newId(),
    kind,
    method: upper,
    url,
    origin,
    pathname,
    query,
    endpointKey: `${upper} ${origin}${pathname}`,
    pagePath: store.pagePath,
    pageVisit: store.pageVisit,
    startedAt: Date.now(),
    startTime: performance.now(),
    state: 'pending',
    requestHeaders,
    requestBody,
    responseHeaders: [],
    options,
    initiator: captureInitiator(),
    isNextInternal: isNextInternal(url, pathname, requestHeaders),
  };
}

function finish(store: WatcherStore, record: ApiRecord, state: ApiRecord['state'], error?: string) {
  if (record.state !== 'pending') return;
  record.state = state;
  record.error = error;
  record.endTime = performance.now();
  record.duration = record.endTime - record.startTime;
  store.update(record, true);
}

/* ------------------------------------------------------------------ fetch */

function patchFetch({ store, options }: GlobalState) {
  if (typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch;

  window.fetch = function watchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const rawUrl = isRequest ? (input as Request).url : input instanceof URL ? input.href : String(input);

    if (matchesAny(rawUrl, options.ignore)) return originalFetch.call(window, input, init);

    const method = init?.method ?? (isRequest ? (input as Request).method : 'GET');
    const headers = isRequest ? headersToList((input as Request).headers) : [];
    for (const [k, v] of headersToList(init?.headers)) {
      const i = headers.findIndex(([hk]) => hk === k);
      if (i >= 0) headers[i] = [k, v];
      else headers.push([k, v]);
    }

    const req = isRequest ? (input as Request) : undefined;
    const fetchOptions: Record<string, string> = {};
    for (const key of ['mode', 'credentials', 'cache', 'redirect', 'referrerPolicy', 'priority', 'keepalive'] as const) {
      const value = (init as Record<string, unknown> | undefined)?.[key] ?? (req as unknown as Record<string, unknown>)?.[key];
      if (value != null && value !== '') fetchOptions[key] = String(value);
    }

    // A Request's body can only be read once, so clone it before the real fetch consumes it.
    const requestClone = init?.body == null && req?.body ? req.clone() : undefined;
    const record = createRecord(
      store,
      'fetch',
      method,
      rawUrl,
      headers,
      requestClone ? { type: 'stream', text: '(reading…)' } : describeRequestBody(init?.body, options.maxBodySize),
      fetchOptions,
    );
    if (!getHeader(record.requestHeaders, 'content-type') && init?.body != null) {
      const implied = impliedContentType(init.body);
      if (implied) record.requestHeaders.push(['content-type', implied]);
    }
    store.add(record);

    if (requestClone) {
      requestClone
        .text()
        .then((text) => {
          record.requestBody = describeRequestBody(text, options.maxBodySize);
          store.update(record);
        })
        .catch(() => undefined);
    }

    let promise: Promise<Response>;
    try {
      promise = originalFetch.call(window, input, init);
    } catch (err) {
      finish(store, record, 'error', String(err));
      throw err;
    }

    promise.then(
      (res) => {
        record.headersTime = performance.now();
        record.status = res.status;
        record.statusText = res.statusText;
        record.redirected = res.redirected;
        record.responseUrl = res.url;
        record.responseType = res.type;
        record.responseHeaders = headersToList(res.headers);
        record.contentType = res.headers.get('content-type') ?? undefined;
        store.update(record);

        if (!res.body || res.type === 'opaque' || req?.method === 'HEAD' || method.toUpperCase() === 'HEAD') {
          record.responseBody = { type: 'none', size: 0 };
          finish(store, record, 'done');
          return;
        }
        readResponseBody(res.clone(), record.contentType, options.maxBodySize).then(
          (body) => {
            record.responseBody = body;
            finish(store, record, 'done');
          },
          (err) => finish(store, record, err?.name === 'AbortError' ? 'aborted' : 'error', String(err?.message ?? err)),
        );
      },
      (err) => {
        finish(store, record, err?.name === 'AbortError' ? 'aborted' : 'error', String(err?.message ?? err));
      },
    );

    return promise;
  };
}

function impliedContentType(body: unknown): string | undefined {
  if (typeof body === 'string') return 'text/plain;charset=UTF-8';
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
    return 'application/x-www-form-urlencoded;charset=UTF-8';
  if (typeof FormData !== 'undefined' && body instanceof FormData) return 'multipart/form-data';
  if (typeof Blob !== 'undefined' && body instanceof Blob && body.type) return body.type;
  return undefined;
}

async function readResponseBody(res: Response, contentType: string | undefined, max: number): Promise<BodyInfo> {
  const textual = isTextual(contentType);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (textual && !truncated) {
      text += decoder.decode(value, { stream: true });
      if (text.length > max) {
        text = text.slice(0, max);
        truncated = true;
      }
    }
  }
  if (!textual) return { type: 'binary', size, text: `[Binary data: ${contentType ?? 'unknown type'}]` };
  if (!truncated) text += decoder.decode();
  return { ...describeResponseText(text, contentType, size, max), truncated: truncated || undefined };
}

/* -------------------------------------------------------------------- XHR */

interface XhrMeta {
  method: string;
  url: string;
  headers: HeaderList;
  async: boolean;
}
type WatchedXhr = XMLHttpRequest & { [XHR_KEY]?: XhrMeta };

function patchXhr({ store, options }: GlobalState) {
  if (typeof XMLHttpRequest === 'undefined') return;
  const proto = XMLHttpRequest.prototype;
  const { open, send, setRequestHeader } = proto;

  proto.open = function (this: WatchedXhr, method: string, url: string | URL, ...rest: unknown[]) {
    this[XHR_KEY] = { method, url: String(url), headers: [], async: rest[0] !== false };
    // eslint-disable-next-line prefer-rest-params
    return (open as (...args: unknown[]) => void).apply(this, arguments as unknown as unknown[]);
  } as typeof proto.open;

  proto.setRequestHeader = function (this: WatchedXhr, name: string, value: string) {
    this[XHR_KEY]?.headers.push([name.toLowerCase(), value]);
    return setRequestHeader.call(this, name, value);
  };

  proto.send = function (this: WatchedXhr, body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = this[XHR_KEY];
    if (!meta || matchesAny(meta.url, options.ignore)) return send.call(this, body);

    const xhrOptions: Record<string, string> = { async: String(meta.async) };
    if (this.withCredentials) xhrOptions.withCredentials = 'true';
    if (this.timeout) xhrOptions.timeout = `${this.timeout} ms`;
    if (this.responseType) xhrOptions.responseType = this.responseType;

    const record = createRecord(
      store,
      'xhr',
      meta.method,
      meta.url,
      [...meta.headers],
      describeRequestBody(body, options.maxBodySize),
      xhrOptions,
    );
    store.add(record);

    let outcome: 'error' | 'aborted' | 'timeout' | undefined;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- readable name for the patched XHR
    const xhr = this;

    const captureHeaders = () => {
      if (record.status != null) return;
      record.headersTime = performance.now();
      record.status = xhr.status;
      record.statusText = xhr.statusText;
      record.responseUrl = xhr.responseURL;
      record.redirected = !!xhr.responseURL && xhr.responseURL !== record.url;
      record.responseHeaders = parseRawHeaders(xhr.getAllResponseHeaders());
      record.contentType = xhr.getResponseHeader('content-type') ?? undefined;
      store.update(record);
    };

    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) captureHeaders();
    });
    xhr.addEventListener('error', () => (outcome = 'error'));
    xhr.addEventListener('abort', () => (outcome = 'aborted'));
    xhr.addEventListener('timeout', () => (outcome = 'timeout'));
    xhr.addEventListener('loadend', () => {
      if (xhr.status !== 0) captureHeaders();
      if (outcome) {
        if (outcome === 'aborted') finish(store, record, 'aborted');
        else finish(store, record, 'error', outcome === 'timeout' ? 'Request timed out' : 'Network error');
        return;
      }
      record.responseBody = readXhrBody(xhr, record.contentType, options.maxBodySize);
      finish(store, record, 'done');
    });

    try {
      return send.call(this, body);
    } catch (err) {
      finish(store, record, 'error', String(err));
      throw err;
    }
  };
}

function readXhrBody(xhr: XMLHttpRequest, contentType: string | undefined, max: number): BodyInfo {
  try {
    switch (xhr.responseType) {
      case '':
      case 'text': {
        const text = xhr.responseText;
        return describeResponseText(text, contentType, byteLength(text), max);
      }
      case 'json': {
        const text = xhr.response == null ? '' : JSON.stringify(xhr.response);
        return { ...describeResponseText(text, contentType, byteLength(text), max), type: 'json' };
      }
      case 'document': {
        const text = xhr.responseXML ? new XMLSerializer().serializeToString(xhr.responseXML) : '';
        return describeResponseText(text, contentType, byteLength(text), max);
      }
      case 'arraybuffer':
        return { type: 'binary', size: (xhr.response as ArrayBuffer | null)?.byteLength ?? 0, text: '[ArrayBuffer]' };
      case 'blob':
        return { type: 'binary', size: (xhr.response as Blob | null)?.size ?? 0, text: '[Blob]' };
      default:
        return { type: 'unknown' };
    }
  } catch {
    return { type: 'unknown' };
  }
}

/* ---------------------------------------------------------------- History */

function patchHistory(store: WatcherStore) {
  const sync = () => store.navigate(location.pathname);
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      sync();
      return result;
    };
  }
  window.addEventListener('popstate', sync);
}

/* --------------------------------------------------------- Resource Timing */

function observeResourceTiming(store: WatcherStore) {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (entry.initiatorType !== 'fetch' && entry.initiatorType !== 'xmlhttprequest') continue;
        const record = store.findTimingMatch(entry.name, entry.startTime);
        if (!record) continue;
        record.timing = toTiming(entry);
        store.update(record);
      }
    });
    observer.observe({ type: 'resource', buffered: false });
  } catch {
    // Resource timing not supported — the UI falls back to our own measurements.
  }
}

function toTiming(e: PerformanceResourceTiming): ResourceTimingInfo {
  const detailed = e.requestStart > 0;
  const span = (a: number, b: number) => (a > 0 && b > 0 ? Math.max(0, b - a) : 0);
  return {
    detailed,
    queueing: detailed ? span(e.startTime, e.domainLookupStart || e.fetchStart) : 0,
    dns: span(e.domainLookupStart, e.domainLookupEnd),
    connect: span(e.connectStart, e.connectEnd),
    ssl: e.secureConnectionStart > 0 ? span(e.secureConnectionStart, e.connectEnd) : 0,
    waiting: span(e.requestStart, e.responseStart),
    download: span(e.responseStart, e.responseEnd),
    total: e.duration,
    transferSize: e.transferSize || undefined,
    encodedBodySize: e.encodedBodySize || undefined,
    decodedBodySize: e.decodedBodySize || undefined,
    protocol: e.nextHopProtocol || undefined,
  };
}
