import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the PRODUCTION build (vite preview), in the locally
 * installed Google Chrome (channel "chrome") — no browser download. Production is
 * the only mode where the service worker registers, so it's the only honest place
 * to test offline.
 *
 * `npm run test:e2e` builds first. To point at a deployed site instead:
 *   E2E_BASE_URL=https://example.vercel.app npx playwright test
 */
const PORT = 4199;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'allow',
  },
  webServer: external
    ? undefined
    : {
        command: `npx vite preview --port ${PORT} --strictPort`,
        port: PORT,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
