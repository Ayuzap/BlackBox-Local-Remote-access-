import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.BACKEND_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    // tunnel hostnames (scripts/tunnel.sh); a leading dot allows every subdomain
    allowedHosts: ['.pinggy.net', '.pinggy.link', '.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.ngrok.dev'],
    proxy: {
      '/api': { target: backend, changeOrigin: true, ws: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
