// `npm run test:smoke [-- --ai] [-- --base https://…]`: checks a deployed Worker with a throwaway account that
// deletes itself. `--ai` also asks the tutor one real question (costs a DeepSeek call). No emails are sent.
const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'https://exam.jarsss8.es'
const withAi = args.includes('--ai')
let cookie = ''
let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++ }

async function call(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  for (const c of res.headers.getSetCookie()) {
    const kv = c.split(';')[0]; const k = kv.split('=')[0]
    const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0], x])); jar[k] = kv
    cookie = Object.values(jar).join('; ')
  }
  if (raw) return res
  const t = await res.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { status: res.status, json: j, headers: res.headers }
}

const html = await fetch(BASE + '/')
ok(html.ok && !!html.headers.get('content-security-policy'), 'home page with CSP')
const cfg = await call('/api/config')
ok(cfg.status === 200, `config: providers ${JSON.stringify(cfg.json.providers)}, email recovery ${cfg.json.recovery}`)

for (const provider of cfg.json.providers ?? []) {
  const r = await call('/api/auth/sign-in/social', { method: 'POST', body: { provider, callbackURL: '/' } })
  const u = r.json?.url ? new URL(r.json.url) : null
  ok(!!u && u.searchParams.get('redirect_uri') === `${BASE}/api/auth/callback/${provider}` && !!u.searchParams.get('client_id'), `${provider} sign-in starts with the right callback`)
}

const pw = 'smoke test password ' + Date.now()
let r = await call('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Smoke Test', email: `smoke-${Date.now()}@example.com`, password: pw } })
ok(r.status === 200, `sign-up (${r.status})`)
ok(/HttpOnly/i.test(r.headers.get('set-cookie') ?? '') && /Secure/i.test(r.headers.get('set-cookie') ?? ''), 'session cookie is HttpOnly and Secure')
r = await call('/api/state')
ok(r.status === 200, `state, AI enabled: ${r.json.ai?.enabled}`)
const uid = r.json.user?.id
const attemptId = crypto.randomUUID()
r = await call('/api/sync', { method: 'POST', body: { deviceId: 'smoke', userId: uid, ops: [{ opId: 'o1', type: 'attempt.create', attempt: { id: attemptId, mode: 'drill', label: 'Claude Code', lang: 'es', feedback: true, questionIds: ['developer-foundations-practice-1'], seed: 7, startedAt: Date.now(), deadline: null } }] } })
ok(r.status === 200 && r.json.rejected?.length === 0, 'sync')

if (withAi) {
  r = await call('/api/ai/consent', { method: 'POST', body: { consent: true } })
  const res = await call('/api/ai/tutor', { method: 'POST', raw: true, body: { qid: 'developer-foundations-practice-1', seed: 7, choice: ['A'], lang: 'es', messages: [{ role: 'user', content: '¿Qué pista decide la respuesta? Una frase.' }] } })
  const out = (await res.text()).split('\n').filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
    .map((l) => { try { return JSON.parse(l.slice(5)).choices?.[0]?.delta?.content ?? '' } catch { return '' } }).join('')
  ok(res.status === 200 && out.length > 10, `tutor: «${out.slice(0, 120).replace(/\n/g, ' ')}»`)
}

r = await call('/api/auth/delete-user', { method: 'POST', body: { password: pw } })
ok(r.status === 200, 'account deleted')
ok((await call('/api/state')).status === 401, 'session gone')
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
