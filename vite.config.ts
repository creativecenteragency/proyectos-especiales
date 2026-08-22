import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages project sites are served from /<repo-name>/, override via VITE_BASE_PATH at build time.
  base: process.env.VITE_BASE_PATH || '/',
})
