import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The engine is a real, framework-free package (packages/rhyme-engine). We
// alias it to its TS source so Vite transpiles it directly — no separate build
// step in dev — while it stays independently versioned and extractable.
const engineSrc = fileURLToPath(new URL('../../packages/rhyme-engine/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rhyme/engine': engineSrc,
    },
  },
  server: { port: 5187 },
});
