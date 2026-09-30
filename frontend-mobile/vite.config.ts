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
