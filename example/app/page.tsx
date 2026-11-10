'use client';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    fetch('/api/hello?name=watcher&lang=en');
  }, []);

  return (
    <main>
      <h1>API Watcher example</h1>
      <p><Link href="/other">Go to /other</Link> · <Link href="/server-page">Go to /server-page</Link></p>
      <button id="get" onClick={() => fetch('/api/hello?name=again')}>GET /api/hello</button>{' '}
      <button id="post" onClick={() => fetch('/api/echo', { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo': '1' }, body: JSON.stringify({ user: { id: 42, name: 'Ada' }, tags: ['a', 'b'] }) })}>POST /api/echo</button>{' '}
      <button id="xhr" onClick={() => { const x = new XMLHttpRequest(); x.open('PUT', '/api/echo?via=xhr'); x.setRequestHeader('content-type', 'text/plain'); x.send('hello from xhr'); }}>XHR PUT</button>{' '}
      <button id="fail" onClick={() => fetch('/api/missing')}>404</button>{' '}
      <button id="proxy" onClick={() => fetch('/api/proxy')}>Proxy (server fetch)</button>{' '}
      <button id="ext" onClick={() => fetch('https://jsonplaceholder.typicode.com/todos/1').catch(() => {})}>External</button>
    </main>
  );
}
