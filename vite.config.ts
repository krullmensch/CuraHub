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
  build: {
    rollupOptions: {
      output: {
        // LOAD-01: long-term-cacheable vendor chunks, split so Home/Login only load
        // the React runtime, while three/drei/rapier/xyflow/markdown stay in lazy chunks.
        //
        // This project runs rolldown-vite 7.2.5. With `manualChunks`, rolldown captured
        // shared dependencies into the first group that imported them (verified in the
        // build output: React itself ended up in vendor-markdown via react-markdown and
        // the React scheduler in vendor-r3f via react-reconciler), which made both heavy
        // chunks eager on every route. `advancedChunks` with
        // `includeDependenciesRecursively: false` only places modules whose id matches a
        // group's `test`; everything else follows its importers. The React runtime group
        // has the highest priority so nested copies (e.g. under @react-three/fiber) also
        // land there instead of pulling a heavy chunk into the entry graph.
        advancedChunks: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'vendor-react',
              priority: 50,
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|zustand|use-sync-external-store)[\\/]/,
            },
            {
              name: 'vendor-rapier',
              priority: 40,
              test: /node_modules[\\/](@react-three[\\/]rapier|@dimforge)[\\/]/,
            },
            {
              name: 'vendor-xyflow',
              priority: 40,
              test: /node_modules[\\/](@xyflow|d3-[^\\/]+|classcat)[\\/]/,
            },
            {
              name: 'vendor-markdown',
              priority: 40,
              test: /node_modules[\\/](react-markdown|remark-[^\\/]+|rehype-[^\\/]+|micromark[^\\/]*|mdast-[^\\/]+|unist-[^\\/]+|unified|hast-[^\\/]+|hastscript|vfile[^\\/]*|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities[^\\/]*|trim-lines|devlop|bail|trough|is-plain-obj|ccount|escape-string-regexp|markdown-table|zwitch|longest-streak|html-url-attributes|estree-util-[^\\/]+|style-to-js|style-to-object|inline-style-parser)[\\/]/,
            },
            {
              name: 'vendor-three',
              priority: 30,
              test: /node_modules[\\/](three|three-stdlib)[\\/]/,
            },
            {
              name: 'vendor-r3f',
              priority: 30,
              test: /node_modules[\\/](@react-three[\\/](fiber|drei)|troika-[^\\/]+|three-mesh-bvh|camera-controls|maath|@use-gesture|its-fine|react-reconciler|suspend-react|react-use-measure|tunnel-rat|stats-gl|detect-gpu|hls\.js|@monogrid|@mediapipe|meshline|glsl-noise|@pmndrs)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    host: true,
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
        '/admin': {
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
        },
        '/public': {
            target: 'http://localhost:3000',
            changeOrigin: true
        }
    }
  }
})
// Forced restart
