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
      '/admin/upload-docx': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/admin/categories': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/admin/questions': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/quiz/random': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/quiz/submit': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/quiz/progress': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/quiz/attempt': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/quiz/wrong-queue': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/quiz/question-history': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/questions/count': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/questions/categories': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/questions/by-ids': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
    },
  },

  preview: {
    port: 4173,
  },
})
