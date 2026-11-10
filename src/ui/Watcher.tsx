import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { downloadHar } from '../core/har';
import type { ServerSyncStatus, WatcherStore } from '../core/store';
import type { ApiRecord } from '../core/types';
import { formatBytes, formatMs } from '../core/utils';
import { EndpointTable } from './EndpointTable';
import { RequestDetail } from './RequestDetail';
import { RequestTable } from './RequestTable';
import { Method, isFailed, responseSize } from './shared';

export type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
type Tab = 'current' | 'all';
type AllMode = 'endpoints' | 'requests';
type StatusFilter = 'all' | 'failed' | 'browser' | 'server' | 'fetch' | 'xhr';

interface Props {
  store: WatcherStore;
  position: Position;
  initialOpen: boolean;
  hideNextInternals: boolean;
}

const UI_KEY = 'nextjs-api-watcher:ui';

function loadUi(): { open?: boolean; tab?: Tab } {
  try {
    return JSON.parse(sessionStorage.getItem(UI_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function Watcher({ store, position, initialOpen, hideNextInternals }: Props) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const saved = useMemo(() => loadUi(), []);

  const [open, setOpen] = useState(saved.open ?? initialOpen);
  const [tab, setTab] = useState<Tab>(saved.tab ?? 'current');
  const [allMode, setAllMode] = useState<AllMode>('endpoints');
  const [endpointKey, setEndpointKey] = useState<string>();
  const [selectedId, setSelectedId] = useState<number>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [hideInternal, setHideInternal] = useState(hideNextInternals);
  const [toast, setToast] = useState<string>();

  useEffect(() => {
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify({ open, tab }));
    } catch {
      /* storage disabled */
    }
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedId != null) setSelectedId(undefined);
        else setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selectedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = (r: ApiRecord) => {
    if (hideInternal && r.isNextInternal) return false;
    if (statusFilter === 'failed' && !isFailed(r)) return false;
    if (statusFilter === 'fetch' && r.kind !== 'fetch') return false;
    if (statusFilter === 'xhr' && r.kind !== 'xhr') return false;
    if (statusFilter === 'browser' && r.kind === 'server') return false;
    if (statusFilter === 'server' && r.kind !== 'server') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase() === q ||
        String(r.status ?? '').startsWith(q)
      );
    }
    return true;
  };

  // Browser requests belong to the page visit they started in. Server-side fetches belong to the
  // current page when they ran after the visit started while rendering this page, or while handling
  // an API route this page called.
  const pageClientPaths = new Set(
    snap.records.filter((r) => r.kind !== 'server' && r.pageVisit === snap.pageVisit).map((r) => r.pathname),
  );
  const onCurrentPage = (r: ApiRecord) =>
    r.kind === 'server'
      ? r.startedAt >= snap.visitStartedAt - 100 &&
        (r.pagePath === snap.pagePath || r.pagePath === '(server)' || pageClientPaths.has(r.pagePath))
      : r.pageVisit === snap.pageVisit;
  const pageRecords = snap.records.filter(onCurrentPage);
  const pageVisible = pageRecords.filter(visible);
  const allVisible = snap.records.filter(visible);
  const endpoints = snap.endpoints.filter(
    (e) =>
      (!hideInternal || !e.isNextInternal) &&
      (statusFilter !== 'failed' || e.errors > 0) &&
      (statusFilter !== 'server' || e.kind === 'server') &&
      (statusFilter !== 'browser' || e.kind === 'client') &&
      (!search || `${e.method} ${e.origin}${e.pathname}`.toLowerCase().includes(search.toLowerCase())),
  );
  const endpoint = endpointKey ? snap.endpoints.find((e) => e.key === endpointKey) : undefined;

  let list: ApiRecord[];
  if (tab === 'current') list = pageVisible;
  else if (endpoint) list = allVisible.filter((r) => r.endpointKey === endpoint.key);
  else list = allVisible;

  const selected = selectedId != null ? list.find((r) => r.id === selectedId) : undefined;
  const showingEndpoints = tab === 'all' && allMode === 'endpoints' && !endpoint;

  // Floating-button badge reflects the current page.
  const badgeRecords = pageRecords.filter((r) => !hideInternal || !r.isNextInternal);
  const hasErrors = badgeRecords.some(isFailed);
  const hasPending = badgeRecords.some((r) => r.state === 'pending');
  const totalCalls = snap.endpoints
    .filter((e) => !hideInternal || !e.isNextInternal)
    .reduce((sum, e) => sum + e.count, 0);

  const switchTab = (t: Tab) => {
    setTab(t);
    setSelectedId(undefined);
    setEndpointKey(undefined);
  };

  return (
    <div className="aw">
      <button
        className={`fab pos-${position}`}
        onClick={() => setOpen(!open)}
        title="API Watcher (dev only)"
        aria-label="Toggle API Watcher"
      >
        <NetworkIcon />
        <span className="count">{badgeRecords.length}</span>
        {hasPending ? <span className="dot pending" /> : hasErrors ? <span className="dot" /> : null}
      </button>

      {open && (
        <div className={`panel pos-${position}`} role="dialog" aria-label="API Watcher">
          <div className="header">
            <div className="title">
              <NetworkIcon /> API Watcher
            </div>
            <div className="tabs">
              <button className={`tab ${tab === 'current' ? 'active' : ''}`} onClick={() => switchTab('current')}>
                Current page <span className="n">{pageVisible.length}</span>
              </button>
              <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => switchTab('all')}>
                All time <span className="n">{totalCalls}</span>
              </button>
            </div>
            <div className="spacer" />
            <input
              className="search"
              placeholder="Filter URL, method, status"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="failed">Failed</option>
              <option value="browser">Browser</option>
              <option value="server">Server</option>
              <option value="fetch">Fetch</option>
              <option value="xhr">XHR</option>
            </select>
            <label className="check" title="RSC payloads, prefetches, HMR and dev overlay requests">
              <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} />
              Hide Next.js internals
            </label>
            <button
              className="btn"
              disabled={!list.length}
              onClick={() => downloadHar(list, tab === 'current' ? 'api-watcher-current-page' : 'api-watcher-all-time')}
              title="Download the requests shown as a HAR file (import into Chrome DevTools, Charles, …)"
            >
              Export HAR
            </button>
            <button
              className="btn"
              onClick={() => {
                if (tab === 'current') store.remove(new Set(pageRecords.map((r) => r.id)));
                else store.clearAll();
                setSelectedId(undefined);
                setEndpointKey(undefined);
              }}
              title={tab === 'current' ? 'Clear requests for this page' : 'Clear all recorded requests and counts'}
            >
              Clear
            </button>
            <button className="btn ghost icon-btn" onClick={() => setOpen(false)} title="Close (Esc)">
              ×
            </button>
          </div>

          {tab === 'all' && !endpoint && (
            <div className="subtabs">
              <button
                className={`subtab ${allMode === 'endpoints' ? 'active' : ''}`}
                onClick={() => {
                  setAllMode('endpoints');
                  setSelectedId(undefined);
                }}
              >
                By endpoint ({endpoints.length})
              </button>
              <button
                className={`subtab ${allMode === 'requests' ? 'active' : ''}`}
                onClick={() => setAllMode('requests')}
              >
                All requests ({allVisible.length})
              </button>
            </div>
          )}

          {tab === 'all' && endpoint && (
            <div className="breadcrumb">
              <button
                className="btn"
                onClick={() => {
                  setEndpointKey(undefined);
                  setSelectedId(undefined);
                }}
              >
                ← Endpoints
              </button>
              <Method method={endpoint.method} />
              <span className="mono">
                {endpoint.origin !== location.origin ? endpoint.origin : ''}
                {endpoint.pathname}
              </span>
              <span className="count-pill">{endpoint.count} calls</span>
              {endpoint.errors > 0 && <span className="s-err">{endpoint.errors} failed</span>}
              <span className="muted">from {endpoint.pages.join(', ')}</span>
            </div>
          )}

          <div className="body">
            {showingEndpoints ? (
              <div className="list">
                <EndpointTable endpoints={endpoints} onSelect={setEndpointKey} />
              </div>
            ) : (
              <>
                <div className={`list ${selected ? 'narrow' : ''}`}>
                  <RequestTable
                    records={list}
                    selectedId={selected?.id}
                    onSelect={(id) => setSelectedId(id === selectedId ? undefined : id)}
                    narrow={!!selected}
                    showPage={tab === 'all'}
                  />
                </div>
                {selected && (
                  <RequestDetail
                    key={selected.id}
                    record={selected}
                    onClose={() => setSelectedId(undefined)}
                    notify={setToast}
                  />
                )}
              </>
            )}
          </div>

          <Footer
            tab={tab}
            list={list}
            pagePath={snap.pagePath}
            totalCalls={totalCalls}
            endpointCount={endpoints.length}
            sessionStartedAt={snap.sessionStartedAt}
            restoredCount={snap.restoredCount}
            serverStatus={snap.serverStatus}
          />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const SERVER_STATUS: Record<ServerSyncStatus, { label: string; className: string; title: string }> = {
  off: { label: 'off', className: 'muted', title: 'serverEndpoint is disabled (or this is an automated browser)' },
  connecting: { label: 'connecting…', className: 's-pending', title: 'Connecting to the API Watcher route handler' },
  connected: { label: 'live', className: 's-2', title: 'Server-side fetches are being recorded' },
  'no-route': {
    label: 'not set up',
    className: 'muted',
    title: 'No route handler found. Add app/api/api-watcher/route.ts exporting GET from nextjs-api-watcher/server.',
  },
  'not-registered': {
    label: 'not registered',
    className: 's-4',
    title: 'Route handler found, but registerApiWatcher() was not called from instrumentation.ts.',
  },
  error: { label: 'reconnecting…', className: 's-4', title: 'Lost connection to the dev server; retrying' },
};

function Footer({ tab, list, pagePath, totalCalls, endpointCount, sessionStartedAt, restoredCount, serverStatus }: {
  tab: Tab;
  list: ApiRecord[];
  pagePath: string;
  totalCalls: number;
  endpointCount: number;
  sessionStartedAt: number;
  restoredCount: number;
  serverStatus: ServerSyncStatus;
}) {
  const server = SERVER_STATUS[serverStatus];
  const size = list.reduce((s, r) => s + (r.timing?.transferSize ?? responseSize(r) ?? 0), 0);
  const failed = list.filter(isFailed).length;
  const finished = list.filter((r) => r.endTime != null);
  const span = finished.length
    ? Math.max(...finished.map((r) => r.endTime!)) - Math.min(...list.map((r) => r.startTime))
    : undefined;
  return (
    <div className="footer">
      {tab === 'current' ? (
        <span>
          Page <b className="mono">{pagePath}</b>
        </span>
      ) : (
        <span title={restoredCount ? `${restoredCount} requests restored from before the last reload` : undefined}>
          <b>{totalCalls}</b> calls to <b>{endpointCount}</b> endpoints since{' '}
          <b>{new Date(sessionStartedAt).toLocaleTimeString([], { hour12: false })}</b>
          {restoredCount > 0 && ' (kept across reloads)'}
        </span>
      )}
      <span>
        <b>{list.length}</b> requests shown
      </span>
      {failed > 0 && (
        <span className="s-err">
          <b className="s-err">{failed}</b> failed
        </span>
      )}
      <span>
        <b>{formatBytes(size)}</b> transferred
      </span>
      {tab === 'current' && span != null && (
        <span>
          Finished: <b>{formatMs(span)}</b>
        </span>
      )}
      <span style={{ marginLeft: 'auto' }} title={server.title}>
        Server fetches: <b className={server.className}>{server.label}</b>
      </span>
    </div>
  );
}

function NetworkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v16M7 4 3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4" />
    </svg>
  );
}
