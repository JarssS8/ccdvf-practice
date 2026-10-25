import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // `npm run dev` serves the UI only; the API runs under `npm run dev:worker` (wrangler on :8787)
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
