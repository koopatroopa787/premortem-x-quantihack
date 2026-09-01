import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app talks to the API at a same-origin /api prefix so the production
// build works behind any reverse proxy. In dev, forward /api to uvicorn.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
