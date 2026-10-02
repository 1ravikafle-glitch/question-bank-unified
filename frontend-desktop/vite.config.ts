import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vendor split: big third-party blobs get their own long-cached
        // chunks; route screens stay separate via React.lazy in App.tsx.
        // First paint downloads index + vendor in parallel instead of one
        // 576KB file, and vendor rarely re-downloads between releases.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          data: ['axios', 'react-hot-toast'],
          ui: [
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-icons',
            '@radix-ui/react-popover',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-select',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tooltip',
            'class-variance-authority',
            'clsx',
            'lucide-react',
          ],
        },
      },
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Dev-only: SPA route collides with backend API prefix (see /questions).
        bypass(req) {
          const accept = req.headers.accept || '';
          if (accept.includes('text/html')) return '/index.html';
        },
      },
      '/quiz': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Dev-only: SPA routes collide with backend API prefixes (see /questions).
        bypass(req) {
          const accept = req.headers.accept || '';
          if (accept.includes('text/html')) return '/index.html';
        },
      },
      '/questions': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Dev-only: the SPA route /questions collides with the backend API
        // prefix. Browser navigations (Accept: text/html) must serve the app;
        // only data requests (fetch/XHR) proxy to the backend.
        bypass(req) {
          const accept = req.headers.accept || '';
          if (accept.includes('text/html')) return '/index.html';
        },
      },
      // Remaining backend prefixes. /bookmarks, /notes and /uploads were never
      // listed, so those calls hit the Vite server and 404'd in dev — the app
      // reported "could not update bookmark" for a request production handles
      // fine. /bookmarks and /notes are also SPA routes, so they need the
      // HTML bypass below.
      '/bookmarks': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Dev-only: this path is BOTH an SPA route and a backend API prefix.
        // Browser navigations (Accept: text/html) must serve the app; only data
        // requests proxy to the backend. Without this, opening /bookmarks in a
        // dev browser returned the API's raw {"detail":"Not Found"}.
        bypass(req) {
          const accept = req.headers.accept || '';
          if (accept.includes('text/html')) return '/index.html';
        },
      },
      '/notes': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Dev-only: this path is BOTH an SPA route and a backend API prefix.
        // Browser navigations (Accept: text/html) must serve the app; only data
        // requests proxy to the backend. Without this, opening /bookmarks in a
        // dev browser returned the API's raw {"detail":"Not Found"}.
        bypass(req) {
          const accept = req.headers.accept || '';
          if (accept.includes('text/html')) return '/index.html';
        },
      },
      '/uploads': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
    },
  },

  preview: {
    port: 4173,
  },
})
