import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import type { ApiRecord, BodyInfo } from './core/types';
import {
  captureInitiator,
  describeRequestBody,
  describeResponseText,
  getHeader,
  headersToList,
  isNextInternal,
  isTextual,
  matchesAny,
  parseUrl,
} from './core/utils';

export type { ApiRecord } from './core/types';

export interface ServerWatcherOptions {
  /** URLs matching any of these are not recorded. */
  ignore?: Array<string | RegExp>;
  /** Max characters of each request/response body kept. Default 1 MB. */
  maxBodySize?: number;
  /** How many finished requests the server buffers for the browser to pick up. Default 500. */
  bufferSize?: number;
}

/** What the route handler sends to the browser. */
export interface ServerSyncResponse {
  instance: string;
  cursor: number;
  records: ApiRecord[];
}

interface ServerState {
  instance: string;
  seq: number;
  records: Array<{ seq: number; record: ApiRecord }>;
  waiters: Set<() => void>;
  options: Required<ServerWatcherOptions>;
  installed: boolean;
}

const STATE_KEY = Symbol.for('nextjs-api-watcher.server');
const POLL_TIMEOUT_MS = 50_000;

// Shared through globalThis: instrumentation.ts and the route handler are separate bundles.
function getState(): ServerState {
  const g = globalThis as typeof globalThis & { [STATE_KEY]?: ServerState };
  return (g[STATE_KEY] ??= {
    instance: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    seq: 0,
    records: [],
    waiters: new Set(),
    options: { ignore: [], maxBodySize: 1024 * 1024, bufferSize: 500 },
    installed: false,
  });
}

const isDev = () => process.env.NODE_ENV === 'development';

/**
 * Records every server-side `fetch()` (Server Components, Route Handlers, Server Actions,
 * getServerSideProps…) so it shows up in the API Watcher panel. Call it from `instrumentation.ts`.
 * Does nothing outside development.
 *
 * @example
 * // instrumentation.ts
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'development') {
 *     const { registerApiWatcher } = await import('nextjs-api-watcher/server');
 *     registerApiWatcher();
 *   }
 * }
 */
export function registerApiWatcher(options: ServerWatcherOptions = {}) {
  if (!isDev() || typeof globalThis.fetch !== 'function') return;
  const state = getState();
  Object.assign(state.options, options);
  if (state.installed) return;
  state.installed = true;
  installFetchAccessor(state);
}

/* ------------------------------------------------------------- fetch patch */

/**
 * Next.js swaps `globalThis.fetch` at runtime: it wraps it with its caching layer, and in dev it
 * resets it to the original on every server hot reload. A one-off monkey-patch would be lost, so
 * fetch becomes an accessor that always hands out a watched version of whatever was assigned.
 */
function installFetchAccessor(state: ServerState) {
  const insideWatcher = new AsyncLocalStorage<true>();
  const wrappers = new WeakMap<typeof fetch, typeof fetch>();
  let inner: typeof fetch = globalThis.fetch;

  const wrap = (target: typeof fetch): typeof fetch => {
    const cached = wrappers.get(target);
    if (cached) return cached;
    const watched = function fetch(input: RequestInfo | URL, init?: RequestInit) {
      // Next's caching fetch may call down into another watched layer; record only the outermost call.
      if (insideWatcher.getStore()) return target(input, init);
      return insideWatcher.run(true, () => watchedFetch(state, target, input, init));
    } as typeof fetch;
    // Keep markers like __nextPatched / _nextOriginalFetch visible to Next.js.
    for (const key of Reflect.ownKeys(target)) {
      if (key === 'length' || key === 'name' || key === 'prototype') continue;
      const desc = Object.getOwnPropertyDescriptor(target, key);
      if (desc) Object.defineProperty(watched, key, desc);
    }
    wrappers.set(target, watched);
    return watched;
  };

  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => wrap(inner),
    set: (value: typeof fetch) => {
      inner = value;
    },
  });
}

// Minimal shapes of Next.js' internal async stores (only the fields we read).
interface NextWorkStore { route?: string }
interface NextWorkUnitStore { url?: { pathname?: string } }

let nextStores:
  | { workAsyncStorage?: AsyncLocalStorage<NextWorkStore>; workUnitAsyncStorage?: AsyncLocalStorage<NextWorkUnitStore> }
  | undefined;

/** Best-effort access to Next.js' request context, to know which page/route made the fetch. */
function getRequestContext(): { pagePath?: string; route?: string } {
  if (!nextStores) {
    nextStores = {};
    try {
      // Resolve from the app's own copy of Next so we share the same AsyncLocalStorage instances.
      const req = createRequire(`${process.cwd()}/package.json`);
      nextStores.workAsyncStorage = req('next/dist/server/app-render/work-async-storage.external.js').workAsyncStorage;
      nextStores.workUnitAsyncStorage = req('next/dist/server/app-render/work-unit-async-storage.external.js').workUnitAsyncStorage;
    } catch {
      // Older Next.js or Pages Router only — fall back to no context.
    }
  }
  try {
    const work = nextStores.workAsyncStorage?.getStore();
    const unit = nextStores.workUnitAsyncStorage?.getStore();
    return { pagePath: unit?.url?.pathname ?? work?.route, route: work?.route };
  } catch {
    return {};
  }
}

async function watchedFetch(
  state: ServerState,
  target: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const { options } = state;
  const isRequest = input instanceof Request;
  const rawUrl = isRequest ? input.url : input instanceof URL ? input.href : String(input);
  if (matchesAny(rawUrl, options.ignore)) return target(input, init);

  const method = (init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase();
  const requestHeaders = isRequest ? headersToList(input.headers) : [];
  for (const [k, v] of headersToList(init?.headers)) {
    const i = requestHeaders.findIndex(([hk]) => hk === k);
    if (i >= 0) requestHeaders[i] = [k, v];
    else requestHeaders.push([k, v]);
  }

  const fetchOptions: Record<string, string> = {};
  for (const key of ['cache', 'credentials', 'redirect', 'mode'] as const) {
    const value = init?.[key];
    if (value) fetchOptions[key] = String(value);
  }
  const next = (init as { next?: { revalidate?: unknown; tags?: unknown } } | undefined)?.next;
  if (next?.revalidate != null) fetchOptions['next.revalidate'] = String(next.revalidate);
  if (Array.isArray(next?.tags) && next.tags.length) fetchOptions['next.tags'] = next.tags.join(', ');

  const { url, origin, pathname, query } = parseUrl(rawUrl);
  const ctx = getRequestContext();
  const requestClone = init?.body == null && isRequest && input.body ? input.clone() : undefined;
  const record: ApiRecord = {
    id: 0,
    kind: 'server',
    method,
    url,
    origin,
    pathname,
    query,
    endpointKey: `server ${method} ${origin}${pathname}`,
    pagePath: ctx.pagePath ?? '(server)',
    route: ctx.route,
    pageVisit: -1,
    startedAt: Date.now(),
    startTime: performance.now(),
    state: 'pending',
    requestHeaders,
    requestBody: describeRequestBody(init?.body, options.maxBodySize),
    responseHeaders: [],
    options: fetchOptions,
    initiator: captureInitiator(),
    isNextInternal: isNextInternal(url, pathname, requestHeaders),
  };
  if (requestClone) {
    requestClone.text().then(
      (text) => (record.requestBody = describeRequestBody(text, options.maxBodySize)),
      () => undefined,
    );
  }

  let res: Response;
  try {
    res = await target(input, init);
  } catch (err) {
    finish(state, record, (err as Error)?.name === 'AbortError' ? 'aborted' : 'error', String((err as Error)?.message ?? err));
    throw err;
  }

  record.headersTime = performance.now();
  record.status = res.status;
  record.statusText = res.statusText;
  record.redirected = res.redirected;
  record.responseUrl = res.url;
  record.responseHeaders = headersToList(res.headers);
  record.contentType = res.headers.get('content-type') ?? undefined;

  if (!res.body || method === 'HEAD') {
    record.responseBody = { type: 'none', size: 0 };
    finish(state, record, 'done');
  } else {
    readBody(res.clone(), record.contentType, options.maxBodySize).then(
      (body) => {
        record.responseBody = body;
        finish(state, record, 'done');
      },
      (err) => finish(state, record, 'error', String(err?.message ?? err)),
    );
  }
  return res;
}

async function readBody(res: Response, contentType: string | undefined, max: number): Promise<BodyInfo> {
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!isTextual(contentType)) return { type: 'binary', size: buf.byteLength, text: `[Binary data: ${contentType ?? 'unknown type'}]` };
  const text = new TextDecoder().decode(buf);
  return describeResponseText(text, contentType, buf.byteLength, max);
}

function finish(state: ServerState, record: ApiRecord, status: ApiRecord['state'], error?: string) {
  record.state = status;
  record.error = error;
  record.endTime = performance.now();
  record.duration = record.endTime - record.startTime;
  // Browser can't see the transfer size; content-length is the closest we have.
  if (record.responseBody?.size == null) {
    const len = Number(getHeader(record.responseHeaders, 'content-length'));
    if (len) record.responseBody = { ...(record.responseBody ?? { type: 'unknown' }), size: len };
  }

  state.records.push({ seq: ++state.seq, record });
  if (state.records.length > state.options.bufferSize) state.records.splice(0, state.records.length - state.options.bufferSize);
  const waiters = [...state.waiters];
  state.waiters.clear();
  waiters.forEach((wake) => wake());
}

/* ------------------------------------------------------------ route handler */

async function collect(
  since: number,
  instance: string | null,
  after: number,
  wait: boolean,
  signal?: AbortSignal,
): Promise<ServerSyncResponse> {
  const state = getState();
  // Unknown or restarted server instance: the browser's cursor is meaningless, so fall back to
  // "everything since the browser session started".
  const known = instance === state.instance;
  const cursor = known ? since : 0;
  const pending = () => state.records.filter((r) => r.seq > cursor && (known || r.record.startedAt >= after));

  if (wait && !pending().length && !signal?.aborted) {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        state.waiters.delete(done);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, POLL_TIMEOUT_MS);
      state.waiters.add(done);
      signal?.addEventListener('abort', done);
    });
  }

  const batch = pending();
  return {
    instance: state.instance,
    cursor: batch.length ? batch[batch.length - 1].seq : known ? cursor : state.seq,
    records: batch.map((b) => b.record),
  };
}

const notFound = () => new Response('Not Found', { status: 404 });

/**
 * App Router route handler that streams server-side fetches to the browser (long polling).
 * Responds 404 outside development.
 *
 * @example
 * // app/api/api-watcher/route.ts
 * export { GET } from 'nextjs-api-watcher/server';
 */
export async function GET(request: Request): Promise<Response> {
  if (!isDev()) return notFound();
  const params = new URL(request.url).searchParams;
  const body = await collect(
    Number(params.get('since')) || 0,
    params.get('instance'),
    Number(params.get('after')) || 0,
    params.get('wait') !== '0',
    request.signal,
  );
  return Response.json(body, {
    headers: { 'cache-control': 'no-store', 'x-api-watcher-installed': String(getState().installed) },
  });
}

interface PagesReq {
  query: Record<string, string | string[] | undefined>;
  on(event: 'close', cb: () => void): void;
}
interface PagesRes {
  status(code: number): PagesRes;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(body?: string): void;
}

/**
 * Pages Router API route equivalent of {@link GET}.
 *
 * @example
 * // pages/api/api-watcher.ts
 * export { pagesApiHandler as default } from 'nextjs-api-watcher/server';
 */
export async function pagesApiHandler(req: PagesReq, res: PagesRes) {
  if (!isDev()) return res.status(404).end('Not Found');
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const body = await collect(
    Number(one(req.query.since)) || 0,
    one(req.query.instance),
    Number(one(req.query.after)) || 0,
    one(req.query.wait) !== '0',
    controller.signal,
  );
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-api-watcher-installed', String(getState().installed));
  res.status(200).json(body);
}
