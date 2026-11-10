export type RequestKind = 'fetch' | 'xhr' | 'server';
export type RequestState = 'pending' | 'done' | 'error' | 'aborted';
export type HeaderList = Array<[string, string]>;

export interface BodyInfo {
  /** How the body was provided. */
  type: 'none' | 'text' | 'json' | 'form-data' | 'url-encoded' | 'binary' | 'stream' | 'unknown';
  /** Text form of the body, if it could be read. */
  text?: string;
  /** Parsed fields for form-data / url-encoded bodies. */
  fields?: HeaderList;
  /** Size in bytes, when known. */
  size?: number;
  truncated?: boolean;
}

/** Detailed timing from the browser's Resource Timing API (when available). */
export interface ResourceTimingInfo {
  queueing: number;
  dns: number;
  connect: number;
  ssl: number;
  /** Request sent → first byte. */
  waiting: number;
  /** Content download. */
  download: number;
  total: number;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  protocol?: string;
  /** False when the server did not send Timing-Allow-Origin for a cross-origin request. */
  detailed: boolean;
}

export interface ApiRecord {
  id: number;
  kind: RequestKind;
  method: string;
  url: string;
  origin: string;
  pathname: string;
  query: HeaderList;
  /** Grouping key for the "All time" view: METHOD + origin + pathname. */
  endpointKey: string;

  /**
   * Page (pathname) the request was started from. For server-side fetches this is the pathname
   * of the incoming request being handled (page render, route handler or server action).
   */
  pagePath: string;
  /** Server-side fetches only: the Next.js route pattern, e.g. `/blog/[slug]`. */
  route?: string;
  /** Increments on every client-side navigation; used for the "Current page" view. */
  pageVisit: number;

  startedAt: number; // epoch ms
  startTime: number; // performance.now()
  headersTime?: number; // performance.now() when response headers arrived
  endTime?: number; // performance.now() when the body finished
  duration?: number;

  state: RequestState;
  status?: number;
  statusText?: string;
  error?: string;
  redirected?: boolean;
  responseUrl?: string;
  responseType?: string;

  requestHeaders: HeaderList;
  requestBody: BodyInfo;
  responseHeaders: HeaderList;
  responseBody?: BodyInfo;
  contentType?: string;

  /** Extra fetch/XHR options (mode, credentials, cache, withCredentials, …). */
  options: Record<string, string>;
  timing?: ResourceTimingInfo;
  /** Call stack at the time the request was made. */
  initiator?: string;
  /** Next.js internal traffic (RSC payloads, HMR, dev overlay, …). */
  isNextInternal: boolean;
}

export interface EndpointStats {
  kind: 'client' | 'server';
  key: string;
  method: string;
  origin: string;
  pathname: string;
  count: number;
  errors: number;
  pending: number;
  totalDuration: number;
  completed: number;
  lastStatus?: number;
  firstSeen: number;
  lastSeen: number;
  pages: string[];
  isNextInternal: boolean;
}

export interface WatcherOptions {
  /** Max individual requests kept in memory (endpoint counts are never evicted). Default 1000. */
  maxRecords?: number;
  /** Max bytes of response/request body kept per request. Default 1 MB. */
  maxBodySize?: number;
  /** URLs matching any of these are not recorded at all. */
  ignore?: Array<string | RegExp>;
  /**
   * Keep recorded requests in sessionStorage so "All time" survives full page reloads
   * (per browser tab). Default true.
   */
  persist?: boolean;
}
