import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Each case study is its own static page, so it works on any plain web server
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        dispodex: resolve(import.meta.dirname, 'case-studies/dispodex/index.html'),
      },
    },
  },
})
