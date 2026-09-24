import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The engine is a real, framework-free package (packages/rhyme-engine). We
// alias it to its TS source so Vite transpiles it directly — no separate build
// step in dev — while it stays independently versioned and extractable.
const engineSrc = fileURLToPath(new URL('../../packages/rhyme-engine/src/index.ts', import.meta.url));

const version = (rel: string): string =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')).version;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rhyme/engine': engineSrc,
    },
  },
  // Shown in the Data & about dialog; the service worker's cache name is stamped
  // from the same app version (scripts/inject-sw-precache.mjs).
  define: {
    __APP_VERSION__: JSON.stringify(version('./package.json')),
    __ENGINE_VERSION__: JSON.stringify(version('../../packages/rhyme-engine/package.json')),
  },
  build: {
    // Off for a public build; turn on temporarily when debugging a production issue.
    sourcemap: false,
  },
  server: { port: 5187 },
});
