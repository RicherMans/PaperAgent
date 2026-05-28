import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8686',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../internal/server/frontend-dist',
    emptyOutDir: true,
  },
})
