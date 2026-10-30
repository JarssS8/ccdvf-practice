import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // `npm run dev` serves the UI only; the API runs under `npm run dev:worker` (wrangler on :8787)
  server: { proxy: { '/api': 'http://localhost:8787' } },
  // `npm test`: pure logic only. API and browser tests run against a Worker: `npm run test:e2e`
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
})
