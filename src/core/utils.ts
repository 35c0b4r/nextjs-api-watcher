import type { BodyInfo, HeaderList } from './types';

export function headersToList(headers: HeadersInit | Headers | undefined | null): HeaderList {
  if (!headers) return [];
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const list: HeaderList = [];
    headers.forEach((value, key) => list.push([key, value]));
    return list;
  }
  if (Array.isArray(headers)) return headers.map(([k, v]) => [String(k).toLowerCase(), String(v)]);
  return Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]);
}

/** Parses the raw string returned by XMLHttpRequest#getAllResponseHeaders. */
export function parseRawHeaders(raw: string): HeaderList {
  return raw
    .trim()
    .split(/[\r\n]+/)
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()] as [string, string];
    });
}

export function getHeader(list: HeaderList, name: string) {
  const lower = name.toLowerCase();
  return list.find(([k]) => k.toLowerCase() === lower)?.[1];
}

export function parseUrl(url: string) {
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
    return {
      url: u.href,
      origin: u.origin,
      pathname: u.pathname,
      query: Array.from(u.searchParams.entries()) as HeaderList,
    };
  } catch {
    return { url, origin: '', pathname: url, query: [] as HeaderList };
  }
}

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined;
export const byteLength = (s: string) => (textEncoder ? textEncoder.encode(s).length : s.length);

function clip(text: string, max: number): Pick<BodyInfo, 'text' | 'truncated'> {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text };
}

function looksLikeJson(text: string) {
  const t = text.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** Describes a request body synchronously (bodies we can't read synchronously are summarized). */
export function describeRequestBody(body: unknown, max: number): BodyInfo {
  if (body == null) return { type: 'none' };
  if (typeof body === 'string') {
    if (looksLikeJson(body)) return { type: 'json', size: byteLength(body), ...clip(body, max) };
    if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body)) {
      return {
        type: 'url-encoded',
        size: byteLength(body),
        fields: Array.from(new URLSearchParams(body).entries()),
        ...clip(body, max),
      };
    }
    return { type: 'text', size: byteLength(body), ...clip(body, max) };
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    const text = body.toString();
    return { type: 'url-encoded', size: byteLength(text), text, fields: Array.from(body.entries()) };
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const fields: HeaderList = [];
    body.forEach((value, key) => {
      fields.push([
        key,
        typeof value === 'string'
          ? value
          : `[File: ${(value as File).name || 'blob'}, ${(value as File).type || 'unknown'}, ${formatBytes(value.size)}]`,
      ]);
    });
    return { type: 'form-data', fields };
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { type: 'binary', size: body.size, text: `[Blob ${body.type || 'unknown type'}]` };
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return { type: 'binary', size: (body as ArrayBuffer).byteLength, text: '[Binary data]' };
  }
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return { type: 'stream', text: '[ReadableStream]' };
  }
  if (typeof Document !== 'undefined' && body instanceof Document) {
    const text = new XMLSerializer().serializeToString(body);
    return { type: 'text', size: byteLength(text), ...clip(text, max) };
  }
  return { type: 'unknown', text: String(body) };
}

const TEXTUAL = /^(text\/|application\/(json|.*\+json|javascript|ecmascript|xml|.*\+xml|x-www-form-urlencoded|graphql|x-ndjson))|^application\/x-component|^text\/x-component/i;

export function isTextual(contentType: string | undefined) {
  if (!contentType) return true;
  return TEXTUAL.test(contentType.split(';')[0].trim());
}

export function describeResponseText(text: string, contentType: string | undefined, size: number, max: number): BodyInfo {
  const isJson = /json/i.test(contentType ?? '') || looksLikeJson(text);
  return { type: isJson ? 'json' : 'text', size, ...clip(text, max) };
}

export function formatBytes(bytes: number | undefined) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatMs(ms: number | undefined) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function matchesAny(url: string, patterns: Array<string | RegExp>) {
  return patterns.some((p) => (typeof p === 'string' ? url.includes(p) : p.test(url)));
}

/** Requests Next.js makes for itself in dev — hidden by default in the UI. */
export function isNextInternal(url: string, pathname: string, headers: HeaderList) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/__nextjs') ||
    pathname.startsWith('/__next') ||
    url.includes('_rsc=') ||
    getHeader(headers, 'rsc') === '1' ||
    getHeader(headers, 'next-router-prefetch') != null ||
    getHeader(headers, 'next-action') != null ||
    // Next.js' own server-side traffic in dev (telemetry, "new version available" check).
    url.startsWith('https://telemetry.nextjs.org/') ||
    url.startsWith('https://registry.npmjs.org/-/package/next/')
  );
}

/** Clean up an Error stack so it points at user code, not the watcher. */
export function captureInitiator(): string | undefined {
  const stack = new Error().stack;
  if (!stack) return undefined;
  return stack
    .split('\n')
    .slice(1)
    .filter((line) => !/nextjs-api-watcher|nextjs_api_watcher|node:internal|new Promise \(<anonymous>\)/.test(line))
    .map((l) => l.trim())
    .slice(0, 15)
    .join('\n');
}
