import type { WatcherStore } from './store';
import type { ApiRecord } from './types';

interface SyncResponse {
  instance: string;
  cursor: number;
  records: ApiRecord[];
}

const CURSOR_KEY = 'nextjs-api-watcher:server-cursor';

/**
 * Long-polls the dev route handler (`nextjs-api-watcher/server`) for server-side fetches and merges
 * them into the store. Returns a stop function.
 */
export function startServerSync(store: WatcherStore, endpoint: string, originalFetch: typeof fetch) {
  let stopped = false;
  let controller: AbortController | undefined;
  let { instance, cursor } = loadCursor();

  const loop = async () => {
    let failures = 0;
    // The first request answers immediately (a handshake), so the status is known right away
    // instead of after the first long-poll times out.
    let handshake = true;
    store.setServerStatus('connecting');
    while (!stopped) {
      controller = new AbortController();
      try {
        const params = new URLSearchParams({
          since: String(cursor),
          instance: instance ?? '',
          // Without a valid cursor, only take fetches made since this "All time" session began.
          after: String(store.sessionStartedAt),
          ...(handshake && { wait: '0' }),
        });
        const res = await originalFetch(`${endpoint}?${params}`, { signal: controller.signal, cache: 'no-store' });
        if (res.status === 404) {
          // The route handler isn't set up — stop quietly instead of spamming 404s.
          store.setServerStatus('no-route');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SyncResponse;
        failures = 0;
        handshake = false;
        store.setServerStatus(res.headers.get('x-api-watcher-installed') === 'false' ? 'not-registered' : 'connected');

        instance = data.instance;
        cursor = data.cursor;
        saveCursor(instance, cursor);
        for (const record of data.records) store.addFinished(toLocalRecord(record));
      } catch {
        if (stopped) return;
        // Usually the dev server restarting; back off and retry.
        failures++;
        handshake = true;
        store.setServerStatus('error');
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** failures, 15_000)));
      }
    }
  };
  void loop();

  return () => {
    stopped = true;
    controller?.abort();
  };
}

/** Server timestamps come from another clock; rebase them onto this page's performance.now(). */
function toLocalRecord(r: ApiRecord): ApiRecord {
  const shift = performance.now() - (Date.now() - r.startedAt) - r.startTime;
  return {
    ...r,
    startTime: r.startTime + shift,
    headersTime: r.headersTime != null ? r.headersTime + shift : undefined,
    endTime: r.endTime != null ? r.endTime + shift : undefined,
    pageVisit: -1,
  };
}

function loadCursor(): { instance: string | null; cursor: number } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CURSOR_KEY) ?? 'null');
    if (saved && typeof saved.cursor === 'number') return saved;
  } catch {
    /* storage unavailable */
  }
  return { instance: null, cursor: 0 };
}

function saveCursor(instance: string, cursor: number) {
  try {
    sessionStorage.setItem(CURSOR_KEY, JSON.stringify({ instance, cursor }));
  } catch {
    /* storage unavailable */
  }
}

export function resetServerCursor() {
  try {
    sessionStorage.removeItem(CURSOR_KEY);
  } catch {
    /* storage unavailable */
  }
}
