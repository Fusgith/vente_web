import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// The application's logo (T-010c): a folder with icon-192.png and icon-512.png, made by the
// distribution tool (T-102); without it, the Lamba mark (icons/icon.svg).
const iconsDir = process.env.VITE_APP_ICONS?.trim() || null;
const ICON_SIZES = [192, 512] as const;

const appIcons: Plugin = {
  name: 'app-icons',
  generateBundle() {
    if (iconsDir === null) return;
    for (const size of ICON_SIZES) {
      const source = readFileSync(join(iconsDir, `icon-${size}.png`));
      this.emitFile({ type: 'asset', fileName: `icons/icon-${size}.png`, source });
    }
  },
  transformIndexHtml: (html) =>
    iconsDir === null
      ? html
      : html.replace(
          '<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />',
          '<link rel="icon" href="/icons/icon-192.png" type="image/png" />',
        ),
};

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
    appIcons,
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
        icons:
          iconsDir === null
            ? [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
            : ICON_SIZES.map((size) => ({
                src: `icons/icon-${size}.png`,
                sizes: `${size}x${size}`,
                type: 'image/png',
                purpose: 'any',
              })),
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
