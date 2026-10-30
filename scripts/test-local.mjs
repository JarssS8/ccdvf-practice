// `npm run test:e2e`: build, start the Worker locally on a throwaway D1, run the API and browser tests, stop.
// Browser tests need Chromium: set CHROMIUM_PATH if it is not at /usr/bin/chromium (they are skipped otherwise).
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, openSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.PORT ?? '8799'
const BASE = `http://localhost:${PORT}`
const persist = join(root, '.wrangler', 'test-state')
const devLog = join(persist, 'dev.log')

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

rmSync(persist, { recursive: true, force: true })
mkdirSync(persist, { recursive: true })
if (!process.argv.includes('--no-build')) run('npm', ['run', 'build'])
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'ccdvf-practice', '--local', '--persist-to', persist])

const log = openSync(devLog, 'w')
const dev = spawn('npx', ['wrangler', 'dev', '--port', PORT, '--local-upstream', `localhost:${PORT}`, '--persist-to', persist,
  '--var', `BETTER_AUTH_URL:${BASE}`, '--var', 'ACCOUNT_RECOVERY:on', '--var', `BETTER_AUTH_SECRET:${randomBytes(32).toString('base64')}`],
{ cwd: root, stdio: ['ignore', log, log], detached: true })
const stop = () => { try { process.kill(-dev.pid, 'SIGTERM') } catch { /* already gone */ } }
process.on('exit', stop)

let ready = false
for (let i = 0; i < 90 && !ready; i++) {
  ready = await fetch(`${BASE}/api/config`).then((r) => r.ok, () => false)
  if (!ready) await new Promise((r) => setTimeout(r, 1000))
}
if (!ready) { console.error(`Worker did not start; see ${devLog}`); process.exit(1) }

const tests = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/e2e/*.test.mjs'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, BASE, D1_PERSIST: persist, DEV_LOG: devLog },
})
stop()
process.exit(tests.status ?? 1)
