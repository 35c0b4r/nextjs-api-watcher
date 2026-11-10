import { useState, type ReactNode } from 'react';
import type { ApiRecord } from '../core/types';
import { getHeader } from '../core/utils';

export function statusClass(r: Pick<ApiRecord, 'state' | 'status'>) {
  if (r.state === 'error' || r.state === 'aborted') return 's-err';
  if (r.status == null) return 's-pending';
  return `s-${String(r.status)[0]}`;
}

export function statusLabel(r: ApiRecord) {
  if (r.state === 'aborted') return '(canceled)';
  if (r.state === 'error') return r.status ? String(r.status) : '(failed)';
  if (r.status == null) return '(pending)';
  if (r.status === 0) return r.responseType === 'opaque' ? '(opaque)' : '(failed)';
  return String(r.status);
}

export function isFailed(r: ApiRecord) {
  return r.state === 'error' || r.state === 'aborted' || (r.status ?? 0) >= 400;
}

/** Chrome-style "Type" column. */
export function typeLabel(r: ApiRecord) {
  const ct = (r.contentType ?? '').split(';')[0].trim();
  if (r.isNextInternal && /x-component/.test(ct)) return `${r.kind} · rsc`;
  if (!ct) return r.kind;
  const short = ct.replace(/^application\//, '').replace(/^text\//, '');
  return `${r.kind} · ${short}`;
}

export function kindLabel(r: Pick<ApiRecord, 'kind'>) {
  return r.kind === 'xhr' ? 'XMLHttpRequest' : r.kind === 'server' ? 'Server fetch() (Node.js)' : 'fetch()';
}

export function KindPill({ r }: { r: Pick<ApiRecord, 'kind' | 'isNextInternal'> }) {
  if (r.kind === 'server') return <span className="pill server">server</span>;
  if (r.isNextInternal) return <span className="pill">next</span>;
  return null;
}

export function responseSize(r: ApiRecord) {
  return r.timing?.encodedBodySize ?? r.responseBody?.size ?? (Number(getHeader(r.responseHeaders, 'content-length')) || undefined);
}

export function Method({ method }: { method: string }) {
  return <span className={`method m-${method}`}>{method}</span>;
}

export function Name({ r, showHost }: { r: ApiRecord; showHost: boolean }) {
  const qs = r.query.length ? '?' + r.query.map(([k, v]) => `${k}=${v}`).join('&') : '';
  return (
    <>
      <span className="path">{r.pathname}</span>
      <span className="q">{qs}</span>
      {showHost && r.origin !== location.origin && <span className="host">{r.origin}</span>}
    </>
  );
}

export function Section({ title, extra, children, defaultOpen = true }: {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-title" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        {title}
        {extra && <span className="extra" onClick={(e) => e.stopPropagation()}>{extra}</span>}
      </div>
      {open && children}
    </div>
  );
}

export function KeyValues({ items, empty = 'None' }: { items: Array<[string, ReactNode]>; empty?: string }) {
  if (!items.length) return <div className="muted mono">{empty}</div>;
  return (
    <div className="kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div className="k">{k}</div>
          <div className="v">{v}</div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- JSON tree */

export function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="json">
      <JsonNode value={value} depth={0} />
    </div>
  );
}

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const label = name != null ? <span className="key">{name}: </span> : null;

  if (value === null || typeof value !== 'object') {
    return (
      <div className="row">
        {label}
        <Primitive value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value as object);
  const summary = isArray ? `Array(${entries.length})` : `{${entries.length ? '…' : ''}}`;
  return (
    <div className="row">
      {entries.length > 0 && (
        <span className="toggle" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'}
        </span>
      )}
      {label}
      {!open || !entries.length ? (
        <span className="summary" onClick={() => setOpen(true)}>
          {isArray ? summary : preview(value as Record<string, unknown>)}
        </span>
      ) : (
        <>
          <span className="muted">{isArray ? summary : ''}</span>
          {entries.slice(0, 500).map(([k, v]) => (
            <JsonNode key={k} name={k} value={v} depth={depth + 1} />
          ))}
          {entries.length > 500 && <div className="row muted">… {entries.length - 500} more</div>}
        </>
      )}
    </div>
  );
}

function preview(obj: Record<string, unknown>) {
  const keys = Object.keys(obj);
  const shown = keys.slice(0, 4).map((k) => {
    const v = obj[k];
    const s = v === null ? 'null' : typeof v === 'object' ? (Array.isArray(v) ? `[…]` : '{…}') : JSON.stringify(v);
    return `${k}: ${s && s.length > 24 ? s.slice(0, 24) + '…' : s}`;
  });
  return `{${shown.join(', ')}${keys.length > 4 ? ', …' : ''}}`;
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="null">null</span>;
  if (typeof value === 'string') return <span className="str">"{value}"</span>;
  if (typeof value === 'number') return <span className="num">{value}</span>;
  if (typeof value === 'boolean') return <span className="bool">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

export function tryParseJson(text: string | undefined): { ok: true; value: unknown } | { ok: false } {
  if (!text) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/* ------------------------------------------------------------- Copy as… */

const SKIP_COPY_HEADERS = new Set(['content-length']);

export function toCurl(r: ApiRecord) {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const parts = [`curl ${q(r.url)}`];
  if (r.method !== 'GET') parts.push(`-X ${r.method}`);
  for (const [k, v] of r.requestHeaders) if (!SKIP_COPY_HEADERS.has(k)) parts.push(`-H ${q(`${k}: ${v}`)}`);
  if (r.requestBody.type === 'form-data' && r.requestBody.fields) {
    for (const [k, v] of r.requestBody.fields) parts.push(`-F ${q(`${k}=${v}`)}`);
  } else if (r.requestBody.text != null && r.requestBody.type !== 'none' && r.requestBody.type !== 'binary') {
    parts.push(`--data-raw ${q(r.requestBody.text)}`);
  }
  return parts.join(' \\\n  ');
}

export function toFetch(r: ApiRecord) {
  const init: Record<string, unknown> = { method: r.method };
  const headers = Object.fromEntries(r.requestHeaders.filter(([k]) => !SKIP_COPY_HEADERS.has(k)));
  if (Object.keys(headers).length) init.headers = headers;
  if (r.requestBody.text != null && !['none', 'binary', 'form-data'].includes(r.requestBody.type)) init.body = r.requestBody.text;
  for (const key of ['mode', 'credentials', 'cache']) if (r.options[key]) init[key] = r.options[key];
  return `fetch(${JSON.stringify(r.url)}, ${JSON.stringify(init, null, 2)});`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
