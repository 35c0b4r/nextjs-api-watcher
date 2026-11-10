import type { ApiRecord, HeaderList } from './types';
import { getHeader } from './utils';

declare const __VERSION__: string;

const nv = (list: HeaderList) => list.map(([name, value]) => ({ name, value }));

/** Builds a HAR 1.2 log (importable in Chrome/Firefox DevTools, Charles, etc.). */
export function toHar(records: ApiRecord[]) {
  const pages = new Map<string, { startedDateTime: string; id: string; title: string; pageTimings: object }>();
  const pageId = (r: ApiRecord) => {
    const key = r.kind === 'server' ? `server:${r.pagePath}` : `${r.pageVisit}:${r.pagePath}`;
    if (!pages.has(key)) {
      pages.set(key, {
        startedDateTime: new Date(r.startedAt).toISOString(),
        id: `page_${pages.size + 1}`,
        title: r.kind === 'server' ? `${r.pagePath} (server)` : r.pagePath,
        pageTimings: {},
      });
    }
    return pages.get(key)!.id;
  };

  const entries = records.map((r) => {
    const t = r.timing;
    const wait = t?.detailed ? t.waiting : r.headersTime != null ? r.headersTime - r.startTime : -1;
    const receive = t?.detailed ? t.download : r.headersTime != null && r.endTime != null ? r.endTime - r.headersTime : -1;
    const reqType = getHeader(r.requestHeaders, 'content-type') ?? '';
    const body = r.requestBody;
    const res = r.responseBody;
    const comments = [
      r.kind === 'server' ? `Server-side fetch while handling ${r.pagePath}${r.route ? ` (route ${r.route})` : ''}` : '',
      r.error ? `Error: ${r.error}` : '',
      r.state === 'pending' ? 'Request was still pending when exported' : '',
    ].filter(Boolean);

    return {
      pageref: pageId(r),
      startedDateTime: new Date(r.startedAt).toISOString(),
      time: r.duration ?? 0,
      request: {
        method: r.method,
        url: r.url,
        httpVersion: t?.protocol ?? 'HTTP/1.1',
        cookies: [],
        headers: nv(r.requestHeaders),
        queryString: nv(r.query),
        ...(body.type !== 'none' && {
          postData: {
            mimeType: reqType || (body.type === 'json' ? 'application/json' : 'text/plain'),
            text: body.text ?? '',
            ...(body.fields && { params: body.fields.map(([name, value]) => ({ name, value })) }),
          },
        }),
        headersSize: -1,
        bodySize: body.size ?? (body.type === 'none' ? 0 : -1),
      },
      response: {
        status: r.status ?? 0,
        statusText: r.statusText ?? '',
        httpVersion: t?.protocol ?? 'HTTP/1.1',
        cookies: [],
        headers: nv(r.responseHeaders),
        content: {
          size: t?.decodedBodySize ?? res?.size ?? 0,
          mimeType: r.contentType ?? 'x-unknown',
          ...(res?.text != null && res.type !== 'binary' && { text: res.text }),
          ...(res?.truncated && { comment: 'Truncated by nextjs-api-watcher (maxBodySize)' }),
        },
        redirectURL: getHeader(r.responseHeaders, 'location') ?? (r.redirected ? r.responseUrl ?? '' : ''),
        headersSize: -1,
        bodySize: t?.encodedBodySize ?? res?.size ?? -1,
        ...(r.state !== 'done' && { _error: r.error ?? r.state }),
      },
      cache: {},
      timings: {
        blocked: t?.detailed ? t.queueing : -1,
        dns: t?.detailed ? t.dns : -1,
        connect: t?.detailed ? t.connect : -1,
        ssl: t?.detailed && t.ssl ? t.ssl : -1,
        send: 0,
        wait: Math.max(wait, -1),
        receive: Math.max(receive, -1),
      },
      _resourceType: r.kind === 'xhr' ? 'xhr' : 'fetch',
      ...(r.initiator && { _initiator: { type: 'script', stack: r.initiator } }),
      ...(comments.length && { comment: comments.join('; ') }),
    };
  });

  return {
    log: {
      version: '1.2',
      creator: { name: 'nextjs-api-watcher', version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0' },
      pages: [...pages.values()],
      entries,
    },
  };
}

export function downloadHar(records: ApiRecord[], name: string) {
  const blob = new Blob([JSON.stringify(toHar(records), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.har`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
