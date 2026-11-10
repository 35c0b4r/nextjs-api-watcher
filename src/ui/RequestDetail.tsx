import { useState, type ReactNode } from 'react';
import type { ApiRecord, HeaderList } from '../core/types';
import { formatBytes, formatMs } from '../core/utils';
import {
  JsonTree,
  KeyValues,
  kindLabel,
  Section,
  copyText,
  responseSize,
  statusClass,
  statusLabel,
  toCurl,
  toFetch,
  tryParseJson,
} from './shared';

type DetailTab = 'headers' | 'payload' | 'preview' | 'response' | 'timing' | 'initiator';

interface Props {
  record: ApiRecord;
  onClose: () => void;
  notify: (msg: string) => void;
}

export function RequestDetail({ record: r, onClose, notify }: Props) {
  const [tab, setTab] = useState<DetailTab>('headers');
  const hasPayload = r.query.length > 0 || r.requestBody.type !== 'none';
  const tabs: Array<[DetailTab, string]> = [
    ['headers', 'Headers'],
    ...(hasPayload ? ([['payload', 'Payload']] as Array<[DetailTab, string]>) : []),
    ['preview', 'Preview'],
    ['response', 'Response'],
    ['timing', 'Timing'],
    ['initiator', 'Initiator'],
  ];
  const active = tab === 'payload' && !hasPayload ? 'headers' : tab;

  const copy = (label: string, text: string) => copyText(text).then(() => notify(`Copied ${label}`));

  return (
    <div className="detail">
      <div className="detail-head">
        <button className="btn ghost icon-btn" title="Close" onClick={onClose}>
          ×
        </button>
        <div className="subtabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={`subtab ${active === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="detail-body">
        <div className="toolbar">
          <button className="btn" onClick={() => copy('URL', r.url)}>Copy URL</button>
          <button className="btn" onClick={() => copy('as cURL', toCurl(r))}>Copy as cURL</button>
          <button className="btn" onClick={() => copy('as fetch', toFetch(r))}>Copy as fetch</button>
          {r.responseBody?.text != null && (
            <button className="btn" onClick={() => copy('response', r.responseBody!.text!)}>Copy response</button>
          )}
        </div>
        {active === 'headers' && <HeadersTab r={r} />}
        {active === 'payload' && <PayloadTab r={r} />}
        {active === 'preview' && <PreviewTab r={r} />}
        {active === 'response' && <ResponseTab r={r} />}
        {active === 'timing' && <TimingTab r={r} />}
        {active === 'initiator' && <InitiatorTab r={r} />}
      </div>
    </div>
  );
}

function sortHeaders(list: HeaderList): Array<[string, string]> {
  return [...list].sort(([a], [b]) => a.localeCompare(b));
}

function HeadersTab({ r }: { r: ApiRecord }) {
  const general: Array<[string, ReactNode]> = [
    ['Request URL', r.url],
    ['Request Method', r.method],
    [
      'Status Code',
      <span className={`status ${statusClass(r)}`}>
        {statusLabel(r)} {r.statusText}
      </span>,
    ],
  ];
  if (r.error) general.push(['Error', <span className="s-err">{r.error}</span>]);
  if (r.redirected && r.responseUrl) general.push(['Redirected To', r.responseUrl]);
  if (r.timing?.protocol) general.push(['Protocol', r.timing.protocol]);
  general.push(['Initiator Type', kindLabel(r)]);
  if (r.responseType && r.responseType !== 'basic') general.push(['Response Type', r.responseType]);
  for (const [k, v] of Object.entries(r.options)) general.push([k, v]);
  general.push([r.kind === 'server' ? 'While handling' : 'Page', r.pagePath]);
  if (r.route && r.route !== r.pagePath) general.push(['Route', r.route]);

  return (
    <>
      <Section title="General">
        <KeyValues items={general} />
      </Section>
      <Section title={`Response Headers (${r.responseHeaders.length})`}>
        {r.state === 'pending' && !r.responseHeaders.length ? (
          <div className="muted">Waiting for response…</div>
        ) : (
          <>
            {r.kind !== 'server' && r.origin !== location.origin && (
              <div className="note">
                Cross-origin: only CORS-safelisted headers and those in Access-Control-Expose-Headers are visible.
              </div>
            )}
            <KeyValues items={sortHeaders(r.responseHeaders)} />
          </>
        )}
      </Section>
      <Section title={`Request Headers (${r.requestHeaders.length})`}>
        <div className="note">
          {r.kind === 'server'
            ? 'Only headers set by your code are shown. Node.js adds defaults (user-agent, accept, accept-encoding…).'
            : 'Only headers set by your code are shown. Headers the browser adds (cookie, user-agent, accept-encoding…) are not visible to JavaScript.'}
        </div>
        <KeyValues items={sortHeaders(r.requestHeaders)} empty="No custom headers" />
      </Section>
    </>
  );
}

function PayloadTab({ r }: { r: ApiRecord }) {
  const [raw, setRaw] = useState(false);
  const body = r.requestBody;
  const parsed = body.type === 'json' ? tryParseJson(body.text) : { ok: false as const };
  return (
    <>
      {r.query.length > 0 && (
        <Section title={`Query String Parameters (${r.query.length})`}>
          <KeyValues items={r.query} />
        </Section>
      )}
      {body.type !== 'none' && (
        <Section
          title={body.type === 'form-data' ? 'Form Data' : body.type === 'url-encoded' ? 'Form Data (url-encoded)' : 'Request Payload'}
          extra={
            <span className="muted">
              {body.size != null && formatBytes(body.size)}
              {(parsed.ok || body.fields) && (
                <button className="btn ghost" onClick={() => setRaw(!raw)}>
                  {raw ? 'view parsed' : 'view source'}
                </button>
              )}
            </span>
          }
        >
          {body.fields && !raw ? (
            <KeyValues items={body.fields} />
          ) : parsed.ok && !raw ? (
            <JsonTree value={parsed.value} />
          ) : (
            <pre className="code">{body.text ?? `[${body.type}]`}</pre>
          )}
          {body.truncated && <div className="note">Payload truncated (maxBodySize).</div>}
        </Section>
      )}
    </>
  );
}

function PreviewTab({ r }: { r: ApiRecord }) {
  const body = r.responseBody;
  if (!body) return <div className="muted">{r.state === 'pending' ? 'Waiting for response body…' : 'No response body.'}</div>;
  if (body.type === 'none') return <div className="muted">This request has no response data available.</div>;
  if (body.type === 'binary') return <div className="muted">{body.text} — {formatBytes(body.size)}</div>;
  const parsed = tryParseJson(body.text);
  if (parsed.ok && typeof parsed.value === 'object' && parsed.value !== null) {
    return (
      <>
        {body.truncated && <div className="note">Response truncated (maxBodySize); preview may be incomplete.</div>}
        <JsonTree value={parsed.value} />
      </>
    );
  }
  return <pre className="code">{body.text || <span className="muted">(empty)</span>}</pre>;
}

function ResponseTab({ r }: { r: ApiRecord }) {
  const [pretty, setPretty] = useState(true);
  const body = r.responseBody;
  if (!body) return <div className="muted">{r.state === 'pending' ? 'Waiting for response body…' : 'No response body.'}</div>;
  if (body.type === 'none') return <div className="muted">This request has no response data available.</div>;
  const parsed = tryParseJson(body.text);
  const text = parsed.ok && pretty ? JSON.stringify(parsed.value, null, 2) : body.text;
  return (
    <>
      <div className="toolbar">
        <span className="muted">
          {formatBytes(body.size)}
          {r.contentType ? ` · ${r.contentType}` : ''}
        </span>
        {parsed.ok && (
          <label className="check">
            <input type="checkbox" checked={pretty} onChange={(e) => setPretty(e.target.checked)} /> Pretty print
          </label>
        )}
      </div>
      {body.truncated && <div className="note">Response truncated to maxBodySize.</div>}
      <pre className="code">{text || <span className="muted">(empty)</span>}</pre>
    </>
  );
}

const COLORS = {
  queueing: '#9ca3af',
  dns: '#14b8a6',
  connect: '#f97316',
  ssl: '#c084fc',
  waiting: '#22c55e',
  download: '#3b82f6',
};

function TimingTab({ r }: { r: ApiRecord }) {
  const t = r.timing;
  // Our own measurements: always available, even when Resource Timing is restricted.
  const ttfb = r.headersTime != null ? r.headersTime - r.startTime : undefined;
  const download = r.headersTime != null && r.endTime != null ? r.endTime - r.headersTime : undefined;

  const rows: Array<{ label: string; value: number | undefined; color: string; group?: string }> = [];
  if (t?.detailed) {
    rows.push(
      { group: 'Resource Scheduling', label: 'Queueing', value: t.queueing, color: COLORS.queueing },
      { group: 'Connection Start', label: 'DNS Lookup', value: t.dns, color: COLORS.dns },
      { label: 'Initial connection', value: t.connect, color: COLORS.connect },
      { label: 'SSL', value: t.ssl, color: COLORS.ssl },
      { group: 'Request / Response', label: 'Waiting for server (TTFB)', value: t.waiting, color: COLORS.waiting },
      { label: 'Content Download', value: t.download, color: COLORS.download },
    );
  } else {
    rows.push(
      { group: 'Request / Response', label: 'Waiting for server (TTFB)', value: ttfb, color: COLORS.waiting },
      { label: 'Content Download', value: download, color: COLORS.download },
    );
  }

  const total = (t?.detailed ? t.total : r.duration) ?? rows.reduce((s, x) => s + (x.value ?? 0), 0);
  let offset = 0;

  return (
    <>
      <Section title="Timing">
        <div className="timing">
          {rows.map((row, i) => {
            const left = total ? (offset / total) * 100 : 0;
            const width = total && row.value ? (row.value / total) * 100 : 0;
            offset += row.value ?? 0;
            return (
              <div key={i} style={{ display: 'contents' }}>
                {row.group && <div className="group">{row.group}</div>}
                <div className="label">{row.label}</div>
                <div className="track">
                  <div className="bar" style={{ left: `${left}%`, width: `${width}%`, background: row.color }} />
                </div>
                <div className="val">{formatMs(row.value)}</div>
              </div>
            );
          })}
          <div className="label total">Total</div>
          <div />
          <div className="val total">{r.state === 'pending' ? 'pending…' : formatMs(r.duration)}</div>
        </div>
        {t && !t.detailed && (
          <div className="note">
            Detailed timing is unavailable for this cross-origin request (the server didn't send Timing-Allow-Origin).
            Showing timings measured by the watcher instead.
          </div>
        )}
      </Section>
      <Section title="Size">
        <KeyValues
          items={[
            ['Transferred (over network)', formatBytes(t?.transferSize)],
            ['Resource size (encoded)', formatBytes(t?.encodedBodySize ?? responseSize(r))],
            ['Resource size (decoded)', formatBytes(t?.decodedBodySize ?? r.responseBody?.size)],
            ['Started at', new Date(r.startedAt).toLocaleString()],
          ]}
        />
      </Section>
    </>
  );
}

function InitiatorTab({ r }: { r: ApiRecord }) {
  return (
    <>
      <Section title="Request initiator">
        <KeyValues
          items={[
            ['Type', kindLabel(r)],
            [r.kind === 'server' ? 'While handling' : 'Page', r.pagePath],
            ...(r.route ? ([['Route', r.route]] as Array<[string, string]>) : []),
          ]}
        />
      </Section>
      <Section title="Call stack">
        <pre className="code">{r.initiator || 'Stack trace unavailable.'}</pre>
      </Section>
    </>
  );
}
