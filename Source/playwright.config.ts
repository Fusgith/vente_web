import { defineConfig } from '@playwright/test';

// End-to-end tests (T-083, CDC technique §11): the real API on a fresh `_e2e` database and the
// PWA served by Vite, on their own ports so a running `pnpm dev` is left alone.
//   DATABASE_URL=… pnpm e2e
const API_PORT = 3100;
const WEB_PORT = 5180;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Indian/Antananarivo',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/serve-api.mjs',
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      env: { E2E_API_PORT: String(API_PORT) },
      timeout: 180_000,
      stdout: 'pipe',
    },
    {
      command: `pnpm --filter @vente-web/web exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      timeout: 120_000,
    },
  ],
});
