'use client';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Other() {
  useEffect(() => { fetch('/api/hello?from=other'); }, []);
  return (<main><h1>Other page</h1><Link href="/">Back home</Link></main>);
}
