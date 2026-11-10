import type { ApiRecord, EndpointStats } from './types';

type Listener = () => void;

export type ServerSyncStatus = 'off' | 'connecting' | 'connected' | 'no-route' | 'not-registered' | 'error';

export interface Snapshot {
  records: ApiRecord[];
  endpoints: EndpointStats[];
  pageVisit: number;
  pagePath: string;
  /** Epoch ms when the current page visit started (used to attribute server-side fetches). */
  visitStartedAt: number;
  /** Epoch ms of the oldest data in "All time" (survives reloads when persistence is on). */
  sessionStartedAt: number;
  restoredCount: number;
  serverStatus: ServerSyncStatus;
  version: number;
}

interface Persisted {
  v: 1;
  records: ApiRecord[];
  endpoints: EndpointStats[];
  pageVisit: number;
  sessionStartedAt: number;
}

const STORAGE_KEY = 'nextjs-api-watcher:session';

/**
 * In-memory store for the recorded requests. Lives until a full page reload, or across reloads
 * (per browser tab) when persistence is on, which is what powers the "All time" view.
 */
export class WatcherStore {
  private records: ApiRecord[] = [];
  private endpoints = new Map<string, EndpointStats>();
  private listeners = new Set<Listener>();
  private snapshot: Snapshot;
  private scheduled = false;
  private nextId = 1;
  private persist = true;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  pageVisit = 0;
  pagePath = typeof location !== 'undefined' ? location.pathname : '/';
  visitStartedAt = typeof performance !== 'undefined' ? Math.round(performance.timeOrigin) : Date.now();
  sessionStartedAt = this.visitStartedAt;
  restoredCount = 0;
  serverStatus: ServerSyncStatus = 'off';
  maxRecords = 1000;

  constructor() {
    this.restore();
    this.snapshot = this.buildSnapshot(0);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.save());
  }

  newId() {
    return this.nextId++;
  }

  add(record: ApiRecord) {
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }

    let stats = this.endpoints.get(record.endpointKey);
    if (!stats) {
      stats = {
        kind: record.kind === 'server' ? 'server' : 'client',
        key: record.endpointKey,
        method: record.method,
        origin: record.origin,
        pathname: record.pathname,
        count: 0,
        errors: 0,
        pending: 0,
        totalDuration: 0,
        completed: 0,
        firstSeen: record.startedAt,
        lastSeen: record.startedAt,
        pages: [],
        isNextInternal: record.isNextInternal,
      };
      this.endpoints.set(record.endpointKey, stats);
    }
    stats.count++;
    stats.pending++;
    stats.lastSeen = Math.max(stats.lastSeen, record.startedAt);
    if (!stats.pages.includes(record.pagePath)) stats.pages.push(record.pagePath);
    this.emit();
  }

  /** Adds a request that already completed (server-side fetches arrive finished). */
  addFinished(record: ApiRecord) {
    record.id = this.newId();
    this.add(record);
    this.update(record, true);
  }

  /** Call after mutating a record in place. Pass `finished` the first time it leaves 'pending'. */
  update(record: ApiRecord, finished = false) {
    if (finished) {
      const stats = this.endpoints.get(record.endpointKey);
      if (stats) {
        stats.pending = Math.max(0, stats.pending - 1);
        if (record.state !== 'done' || (record.status ?? 0) >= 400) stats.errors++;
        if (record.duration != null) {
          stats.totalDuration += record.duration;
          stats.completed++;
        }
        stats.lastStatus = record.status;
      }
    }
    this.emit();
  }

  navigate(pathname: string) {
    if (pathname === this.pagePath) return;
    this.pagePath = pathname;
    this.pageVisit++;
    // The App Router fetches the next page's RSC payload *before* the URL changes, and the server
    // renders it (and runs its fetches) at that moment. Start the visit there when we saw it.
    const rsc = this.findRecent(
      (r) => r.isNextInternal && r.pathname === pathname && r.startedAt > Date.now() - 30_000,
    );
    this.visitStartedAt = rsc ? rsc.startedAt : Date.now();
    this.emit();
  }

  setServerStatus(status: ServerSyncStatus) {
    if (status === this.serverStatus) return;
    this.serverStatus = status;
    this.emit();
  }

  remove(ids: Set<number>) {
    this.records = this.records.filter((r) => !ids.has(r.id));
    this.emit();
  }

  clearAll() {
    this.records = [];
    this.endpoints.clear();
    this.sessionStartedAt = Date.now();
    this.restoredCount = 0;
    this.emit();
  }

  findRecent(predicate: (r: ApiRecord) => boolean): ApiRecord | undefined {
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (predicate(this.records[i])) return this.records[i];
    }
    return undefined;
  }

  /**
   * Finds the request a Resource Timing entry belongs to. Identical requests can start within
   * the same millisecond (e.g. Strict Mode double effects), so prefer finished requests (timing
   * entries are only emitted once the response ends) and then the closest start time.
   */
  findTimingMatch(url: string, startTime: number): ApiRecord | undefined {
    let best: ApiRecord | undefined;
    let bestScore = Infinity;
    for (let i = this.records.length - 1; i >= 0 && i >= this.records.length - 200; i--) {
      const r = this.records[i];
      if (r.timing || r.kind === 'server' || r.url !== url) continue;
      const diff = Math.abs(r.startTime - startTime);
      if (diff > 250) continue;
      const score = diff + (r.state === 'pending' ? 1000 : 0);
      if (score < bestScore) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------ persistence */

  setPersist(persist: boolean) {
    this.persist = persist;
    if (!persist) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* storage unavailable */
      }
    } else {
      this.scheduleSave();
    }
  }

  private restore() {
    let data: Persisted | undefined;
    try {
      data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') ?? undefined;
    } catch {
      return;
    }
    if (!data || data.v !== 1) return;

    // performance.now() values from the previous document are meaningless now; rebase them so
    // durations still read correctly and the records sort before anything new.
    const now = performance.now();
    const nowEpoch = Date.now();
    for (const r of data.records) {
      const shift = now - (nowEpoch - r.startedAt) - r.startTime;
      r.startTime += shift;
      if (r.headersTime != null) r.headersTime += shift;
      if (r.endTime != null) r.endTime += shift;
      r.id = this.newId();
    }
    this.records = data.records;
    for (const e of data.endpoints) this.endpoints.set(e.key, { ...e, pending: 0 });
    this.pageVisit = data.pageVisit + 1;
    this.sessionStartedAt = data.sessionStartedAt;
    this.restoredCount = data.records.length;
  }

  private scheduleSave() {
    if (!this.persist || typeof window === 'undefined') return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 500);
  }

  private save() {
    if (!this.persist) return;
    clearTimeout(this.saveTimer);
    // Pending requests can't be resumed after a reload, so only finished ones are kept.
    let records = this.records.filter((r) => r.state !== 'pending');
    const write = () => {
      const data: Persisted = {
        v: 1,
        records,
        endpoints: [...this.endpoints.values()],
        pageVisit: this.pageVisit,
        sessionStartedAt: this.sessionStartedAt,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };
    // sessionStorage is ~5 MB: on quota errors, drop bodies of the older half, then older records.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        write();
        return;
      } catch {
        if (attempt % 2 === 0) {
          const half = Math.floor(records.length / 2);
          records = records.map((r, i) => (i < half || attempt > 2 ? stripBodies(r) : r));
        } else {
          records = records.slice(Math.floor(records.length / 2));
        }
      }
    }
  }

  /* ---------------------------------------------------------- subscription */

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    this.scheduleSave();
    // Batch bursts of updates into one render per frame.
    if (this.scheduled) return;
    this.scheduled = true;
    const flush = () => {
      this.scheduled = false;
      this.snapshot = this.buildSnapshot(this.snapshot.version + 1);
      this.listeners.forEach((l) => l());
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else setTimeout(flush, 16);
  }

  private buildSnapshot(version: number): Snapshot {
    return {
      // Shallow-copy records so React sees mutated records as new objects.
      records: this.records.map((r) => ({ ...r })),
      endpoints: Array.from(this.endpoints.values(), (e) => ({ ...e, pages: [...e.pages] })),
      pageVisit: this.pageVisit,
      pagePath: this.pagePath,
      visitStartedAt: this.visitStartedAt,
      sessionStartedAt: this.sessionStartedAt,
      restoredCount: this.restoredCount,
      serverStatus: this.serverStatus,
      version,
    };
  }
}

function stripBodies(r: ApiRecord): ApiRecord {
  const strip = <T extends { text?: string; size?: number; type: string } | undefined>(b: T): T =>
    b && b.text != null ? { ...b, text: '[Body dropped to fit sessionStorage]', fields: undefined } : b;
  return { ...r, requestBody: strip(r.requestBody), responseBody: strip(r.responseBody), initiator: undefined };
}
