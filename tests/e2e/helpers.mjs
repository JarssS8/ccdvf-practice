// Shared by the end-to-end tests. They run against BASE (a local Worker started by scripts/test-local.mjs).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const BASE = process.env.BASE ?? 'http://localhost:8799'

/** A cookie-keeping API client: one per simulated browser. */
export function client(base = BASE) {
  let cookie = ''
  return async (path, { method = 'GET', body, origin = base, raw = false } = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(';')[0]
      const k = kv.split('=')[0]
      const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0], x]))
      if (/Max-Age=0/i.test(c)) delete jar[k]; else jar[k] = kv
      cookie = Object.values(jar).join('; ')
    }
    if (raw) return res
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch { json = text }
    return { status: res.status, json, headers: res.headers }
  }
}

export const uniqueEmail = (tag) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`

/** Runs SQL on the local test database (only available when the tests were started by test-local.mjs). */
export function sql(command) {
  if (!process.env.D1_PERSIST) throw new Error('sql() needs D1_PERSIST (run through `npm run test:e2e`)')
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'ccdvf-practice', '--local', '--persist-to', process.env.D1_PERSIST, '--json', '--command', command],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return JSON.parse(out)[0].results
}

/** The newest password-reset token for a user, read straight from D1 (the email itself is simulated locally). */
export function lastResetToken(userId) {
  const rows = sql(`SELECT identifier FROM verification WHERE value = '${userId.replace(/'/g, '')}' AND identifier LIKE 'reset-password:%' ORDER BY createdAt DESC LIMIT 1`)
  return rows[0]?.identifier.slice('reset-password:'.length) ?? null
}

export const devLog = () => (process.env.DEV_LOG ? readFileSync(process.env.DEV_LOG, 'utf8') : '')
export const clearRateLimits = () => sql('DELETE FROM "rateLimit"')
