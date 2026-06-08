import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Faithful Vite lift of the 8077 plugin monolith. App logic lives in src/app.jsx
// (mechanically moved, not rewritten). Shared master scripts (window.NODE_TYPES,
// window.FI, …) load as plain scripts from public/ before the app module.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // /api is proxied to a running flow-inspector backend for the parity check.
  // Point this at whichever backend serves the data we verify against (8077 plugin).
  server: { port: 5180, proxy: { '/api': 'http://localhost:8077' } },
  preview: { port: 4180, proxy: { '/api': 'http://localhost:8077' } },
})
