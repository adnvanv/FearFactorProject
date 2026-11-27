import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Built site uses relative asset paths, so it works from any folder or URL path.
  base: command === 'build' ? './' : '/',
  server: {
    port: 5173,
    // The Python API runs on port 8000; the dev server forwards /api to it.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
}))
