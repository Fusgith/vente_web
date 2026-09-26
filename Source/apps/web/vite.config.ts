import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Vente Web',
        short_name: 'Vente',
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
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
