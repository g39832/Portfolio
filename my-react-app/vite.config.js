import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The blog is a separate small service (../blog). In development, run it with
    //   cd ../blog && .venv/Scripts/python -m blogapp serve   (port 5080)
    // and these paths are forwarded to it, like nginx does on the Pi.
    proxy: Object.fromEntries(
      ['/blog', '/admin/blog', '/media', '/sitemap.xml'].map((path) => [path, 'http://127.0.0.1:5080'])
    ),
  },
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
