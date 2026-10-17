import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /trip-journal/; override with BASE_PATH for other hosts.
const base = process.env.BASE_PATH || '/trip-journal/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'photos/*.jpg'],
      manifest: {
        name: 'Trip Journal',
        short_name: 'Trip Journal',
        description: 'A family travel journal: trips, memories, a real map, albums and a trip story.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#EFE7D8',
        theme_color: '#EFE7D8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // app shell, fonts, sample photos and the world map geometry all work offline
        globPatterns: ['**/*.{js,css,html,woff2,png,jpg,svg}'],
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,vietnamese}-*']
      }
    })
  ]
});
