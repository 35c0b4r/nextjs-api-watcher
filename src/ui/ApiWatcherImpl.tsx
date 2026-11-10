import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { install } from '../core/install';
import { startServerSync } from '../core/server-sync';
import type { ApiWatcherProps } from '../index';
import { css } from './styles';
import { Watcher } from './Watcher';

const DEFAULT_SERVER_ENDPOINT = '/api/api-watcher';

// Start recording as soon as this chunk loads, before the UI mounts, to catch early requests.
if (typeof window !== 'undefined') install();

export default function ApiWatcherImpl({
  position = 'bottom-right',
  initialOpen = false,
  hideNextInternals = true,
  serverEndpoint,
  maxRecords,
  maxBodySize,
  ignore,
  persist,
}: ApiWatcherProps) {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const { store, originalFetch } = install({ maxRecords, maxBodySize, ignore, persist });

  useEffect(() => {
    // Render inside a Shadow DOM so the app's CSS (Tailwind preflight, resets, …) can't leak in.
    const host = document.createElement('nextjs-api-watcher');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    const container = document.createElement('div');
    shadow.append(style, container);
    // Syncing with a DOM node we just created is a legitimate reason to set state here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMount(container);
    return () => {
      host.remove();
      setMount(null);
    };
  }, []);

  useEffect(() => {
    // The sync keeps one long-poll request open, which would stall "network idle" waits in
    // Playwright/Puppeteer/Cypress runs against `next dev`. Skip it there unless asked for explicitly.
    const endpoint = serverEndpoint ?? (navigator.webdriver ? false : DEFAULT_SERVER_ENDPOINT);
    if (!endpoint) {
      store.setServerStatus('off');
      return;
    }
    return startServerSync(store, endpoint, originalFetch);
  }, [store, serverEndpoint, originalFetch]);

  if (!mount) return null;
  return createPortal(
    <Watcher
      store={store}
      position={position}
      initialOpen={initialOpen}
      hideNextInternals={hideNextInternals}
    />,
    mount,
  );
}
