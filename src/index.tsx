import { Suspense, lazy, useSyncExternalStore, type ComponentType } from 'react';
import { install } from './core/install';
import type { WatcherOptions } from './core/types';

export type { ApiRecord, BodyInfo, EndpointStats, ResourceTimingInfo, WatcherOptions } from './core/types';
export { toHar } from './core/har';

export interface ApiWatcherProps extends WatcherOptions {
  /** Corner for the floating button. Default `bottom-right` (Next.js' own indicator lives bottom-left). */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Open the panel on first load. Default false. Open/closed state is remembered per tab session. */
  initialOpen?: boolean;
  /** Hide Next.js internal traffic (RSC payloads, prefetches, HMR) by default. Default true. */
  hideNextInternals?: boolean;
  /**
   * Route handler that serves server-side fetches recorded by `registerApiWatcher()` from
   * `nextjs-api-watcher/server`. Set to `false` to disable. Default `/api/api-watcher`, except in
   * automated browsers (`navigator.webdriver`), where it's off unless set explicitly because the
   * open long-poll request would block "network idle" waits.
   */
  serverEndpoint?: string | false;
}

/*
 * The `process.env.NODE_ENV === 'development'` checks below are written inline on purpose:
 * Next.js replaces them at build time, so in production the condition becomes `false`, the
 * dynamic import is removed as dead code, and none of the watcher ends up in your bundle.
 */

// Start recording synchronously when this module is evaluated (before hydration), so requests
// fired from the very first effects are captured. The UI chunk is preloaded in parallel.
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  install();
  void import('./ui/ApiWatcherImpl');
}

const Impl: ComponentType<ApiWatcherProps> | null =
  process.env.NODE_ENV === 'development' ? lazy(() => import('./ui/ApiWatcherImpl')) : null;

const noopSubscribe = () => () => {};

/**
 * Floating API/network inspector for development. Renders nothing in production.
 *
 * @example
 * // app/layout.tsx
 * import { ApiWatcher } from 'nextjs-api-watcher';
 * <body>{children}<ApiWatcher /></body>
 */
export function ApiWatcher(props: ApiWatcherProps) {
  // false during SSR and hydration, true afterwards — avoids a hydration mismatch without an effect.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  if (process.env.NODE_ENV !== 'development' || !Impl || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}

export default ApiWatcher;
