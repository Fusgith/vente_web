import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import brand from '../../packages/shared/src/brand.json' with { type: 'json' };

// Application name fixed at build time (RG-APP-01, ADR-0006): `pnpm dist` checks the names
// with the shared rules and passes them here; without them, the default of brand.json.
const appName = process.env.VITE_APP_NAME?.trim() || brand.name;
const appShortName = process.env.VITE_APP_SHORT_NAME?.trim() || brand.shortName;

// The API behind the proxy: the dev one, or the end-to-end one (T-083, playwright.config.ts).
const apiTarget = process.env.API_PROXY_TARGET?.trim() || 'http://localhost:3000';

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** The page title before the app starts (install prompt, tab, task switcher). */
const appTitle: Plugin = {
  name: 'app-title',
  transformIndexHtml: (html) =>
    html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(appName)}</title>`),
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    appTitle,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: appName,
        short_name: appShortName,
        description: 'Gestion des ventes du magasin',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        // Lamba identity (ADR-0005): cotton splash, ink bar.
        background_color: '#F1F3F6',
        theme_color: '#1B1E3F',
        // TODO(T-010 follow-up): PNG 192/512 icons from the shop logo in Autres/.
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // API calls are never served from the cache: the server is the truth (ADR-0001).
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        // The owner's notifications, app closed (T-033e): `public/push-sw.js`, run first.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  // Read by `labels.appName`; the tests, without this, fall back to the shared default.
  define: {
    'import.meta.env.VITE_APP_NAME': JSON.stringify(appName),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});
