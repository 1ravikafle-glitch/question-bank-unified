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
      '/admin': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/quiz': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
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
    },
  },

  preview: {
    port: 4173,
  },
})
