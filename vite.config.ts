import path from "path"
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
        '/api': {
            target: 'http://localhost:3000',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/auth': {
            target: 'http://localhost:3000',
            changeOrigin: true
        },
        '/upload': {
            target: 'http://localhost:3000',
            changeOrigin: true
        },
        '/uploads': {
            target: 'http://localhost:3000',
            changeOrigin: true
        }
    }
  }
})
// Forced restart
