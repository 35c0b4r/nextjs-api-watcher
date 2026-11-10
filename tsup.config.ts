import { defineConfig } from 'tsup';
import pkg from './package.json';

const define = { __VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  {
    entry: { index: 'src/index.tsx' },
    format: ['esm'],
    dts: true,
    // Keep the dev-only implementation in its own chunk so production builds never load it.
    splitting: true,
    target: 'es2020',
    external: ['react', 'react-dom'],
    // Required so the component works when imported from a Server Component layout.
    banner: { js: '"use client";' },
    // Do NOT inline process.env.NODE_ENV: the consumer's bundler (Next.js) must replace it.
    env: {},
    define,
  },
  {
    // Server entry: instrumentation.ts + route handler. Must not carry "use client".
    entry: { server: 'src/server.ts' },
    format: ['esm'],
    dts: true,
    platform: 'node',
    target: 'node18',
    env: {},
    define,
  },
]);
