import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/jw-token': {
        target: 'https://b.jw-cdn.org',
        changeOrigin: true,
        rewrite: () => '/tokens/jworg.jwt',
      },
      '/api/jw-search': {
        target: 'https://b.jw-cdn.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jw-search/, '/apis/search'),
      },
      '/api/jw-media': {
        target: 'https://b.jw-cdn.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jw-media/, '/apis/mediator/v1'),
      },
      '/api/ai': {
        target: 'https://text.pollinations.ai',
        changeOrigin: true,
        rewrite: () => '/',
      },
    },
  },
})
