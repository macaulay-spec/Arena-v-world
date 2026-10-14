import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500, assetsInlineLimit: 0, rollupOptions: { input: { main: 'index.html', characters: 'characters.html' } } },
  assetsInclude: ['**/*.json'],
});
