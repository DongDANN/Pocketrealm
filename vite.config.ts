import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Pocketrealm',
        short_name: 'Pocketrealm',
        description: 'A calm, offline budgeting companion with a lantern-lit dungeon.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#0e0d17',
        background_color: '#0e0d17',
        orientation: 'portrait',
        categories: ['finance', 'productivity', 'games'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Add expense', short_name: 'Add', url: '/add', description: 'Log an expense' },
          { name: 'Today', short_name: 'Today', url: '/', description: 'Open today' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff2,json}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
