import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Playwright écrit traces, vidéos et rapports dans le dossier du
      // frontend pendant les tests : sans cette exclusion, Vite rechargeait la
      // page à chaque fichier écrit et vidait les formulaires en cours de test.
      ignored: ['**/e2e/**', '**/test-results/**', '**/playwright-report/**'],
    },
    proxy: {
      // Le proxy évite tout CORS en développement et fait voyager le cookie de
      // refresh sur la même origine que l'application.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // La carte et ses dépendances ne sont chargées que sur les écrans
        // cartographiques : les isoler évite de les embarquer dans le bundle
        // initial.
        manualChunks: {
          leaflet: ['leaflet', 'react-leaflet'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
