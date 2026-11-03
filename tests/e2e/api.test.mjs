// API end to end: accounts, isolation between users, sync validation, AI guards, password reset, deletion.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { client, clearRateLimits, devLog, lastResetToken, sql, uniqueEmail } from './helpers.mjs'

const PW = 'correct horse battery'
const Q = 'developer-foundations-practice-1'

describe('API', () => {
  const A = client(), B = client()
  let uidA, uidB
  const emailA = uniqueEmail('a')
  const attemptId = crypto.randomUUID()

  before(async () => {
    clearRateLimits()
    assert.equal((await A('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Alice', email: emailA, password: PW } })).status, 200)
    assert.equal((await B('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Bob', email: uniqueEmail('b'), password: PW } })).status, 200)
    uidA = (await A('/api/state')).json.user.id
    uidB = (await B('/api/state')).json.user.id
  })

  it('config is public and reports password reset', async () => {
    const r = await client()('/api/config')
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.json.providers))
    assert.equal(r.json.recovery, true)
  })

  it('needs a session for app data', async () => {
    assert.equal((await client()('/api/state')).status, 401)
  })

  it('rejects short passwords and server-only fields at sign-up', async () => {
    const c = client()
    const short = await c('/api/auth/sign-up/email', { method: 'POST', body: { name: 'S', email: uniqueEmail('s'), password: 'short' } })
    assert.equal(short.json.code, 'PASSWORD_TOO_SHORT')
    const forged = await c('/api/auth/sign-up/email', { method: 'POST', body: { name: 'E', email: uniqueEmail('e'), password: PW, aiConsentAt: 1 } })
    assert.equal(forged.status, 400)
  })

  it('stores passwords as PBKDF2 and keeps no OAuth tokens', () => {
    const [row] = sql(`SELECT password, accessToken FROM account WHERE userId = '${uidA}'`)
    assert.match(row.password, /^pbkdf2-sha256\$100000\$/)
    assert.equal(row.accessToken, null)
  })

  it('applies a user\'s own sync ops', async () => {
    const ops = [
      { opId: 'c1', type: 'attempt.create', attempt: { id: attemptId, mode: 'drill', label: 'Claude Code', lang: 'es', feedback: true, questionIds: [Q], seed: 42, startedAt: Date.now(), deadline: null } },
      { opId: 'c2', type: 'answer', attemptId, qid: Q, choice: ['B'], flagged: false, updatedAt: Date.now() },
      { opId: 'c3', type: 'setting', key: 'exam_date', value: '2026-12-01', updatedAt: Date.now() },
      { opId: 'c4', type: 'review', id: crypto.randomUUID(), cardId: 'fc-x', rating: 3, reviewedAt: Date.now() },
    ]
    const r = await A('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidA, ops } })
    assert.deepEqual(r.json.rejected, [])
    const s = (await A('/api/state')).json
    assert.equal(s.attempts.length, 1)
    assert.equal(s.attempts[0].lang, 'es')
    assert.equal(s.answers.length, 1)
    assert.equal(s.settings.length, 1)
    assert.equal(s.reviews.length, 1)
  })

  it('only forwards the auth routes the app uses, so junk paths cannot fill the rate-limit table', async () => {
    const before = sql('SELECT COUNT(*) AS n FROM "rateLimit"')[0].n
    for (const p of ['/api/auth/x1', '/api/auth/x2/' + 'a'.repeat(3000), '/api/auth/update-user', '/api/auth/change-password', '/api/auth/sign-in/email/']) {
      assert.equal((await client()(p)).status, 404, p)
    }
    assert.equal(sql('SELECT COUNT(*) AS n FROM "rateLimit"')[0].n, before)
    assert.equal((await client()('/api/auth/get-session')).status, 200)
  })

  it('keeps users isolated', async () => {
    const s = (await B('/api/state')).json
    assert.equal(s.attempts.length + s.answers.length + s.settings.length + s.reviews.length, 0)
    const mismatch = await B('/api/sync', { method: 'POST', body: { deviceId: 'x', userId: uidA, ops: [] } })
    assert.equal(mismatch.status, 409)
    const r = await B('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidB, ops: [
      { opId: 'x1', type: 'answer', attemptId, qid: Q, choice: ['A'], flagged: false, updatedAt: Date.now() },
      { opId: 'x2', type: 'attempt.discard', attemptId },
    ] } })
    assert.ok(r.json.rejected.some((x) => x.opId === 'x1' && x.reason === 'missing'))
    const a = (await A('/api/state')).json
    assert.equal(a.attempts[0].status, 'active')
    assert.equal(a.answers[0].choice, '["B"]')
  })

  it('validates sync input', async () => {
    const bad = await A('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidA, ops: [{ opId: 'b1', type: 'answer', attemptId, qid: Q, choice: ['Z'], flagged: false, updatedAt: 1 }] } })
    assert.equal(bad.json.rejected[0].reason, 'bad')
    const lease = await A('/api/sync', { method: 'POST', body: { deviceId: 'other', userId: uidA, ops: [{ opId: 'l1', type: 'answer', attemptId, qid: Q, choice: ['A'], flagged: false, updatedAt: Date.now() }] } })
    assert.equal(lease.json.rejected[0].reason, 'lease')
    const many = await A('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidA, ops: Array.from({ length: 101 }, () => ({})) } })
    assert.equal(many.status, 400)
    const foreign = await A('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidA, ops: [] }, origin: 'https://evil.example' })
    assert.equal(foreign.status, 403)
  })

  it('caps what sync can create', async () => {
    const setting = await A('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidA, ops: [{ opId: 's1', type: 'setting', key: 'anything-else', value: 'x', updatedAt: Date.now() }] } })
    assert.equal(setting.json.rejected[0]?.reason, 'bad', 'only exam_date is a setting')
    const stray = await A('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidA, ops: [{ opId: 's2', type: 'answer', attemptId, qid: 'not-in-this-attempt', choice: ['A'], flagged: false, updatedAt: Date.now() }] } })
    assert.equal(stray.json.rejected[0]?.reason, 'bad', 'answers must belong to the attempt')
    const big = await A('/api/sync', { method: 'POST', body: { deviceId: 'devA', userId: uidA, ops: [{ opId: 's3', type: 'attempt.submit', attemptId, result: { x: 'y'.repeat(5000) }, submittedAt: Date.now() }] } })
    assert.equal(big.json.rejected[0]?.reason, 'bad', 'result is capped')
  })

  it('guards the AI tutor: consent, known questions only', async () => {
    const r = await A('/api/ai/tutor', { method: 'POST', body: { qid: Q, seed: 1, choice: ['A'], lang: 'es', messages: [{ role: 'user', content: 'hola' }] } })
    // Locally there is no DeepSeek key; with one, the first refusal is the missing consent
    assert.ok((r.status === 503 && r.json.error === 'ai_disabled') || (r.status === 403 && r.json.error === 'ai_consent'))
    const g = await A('/api/ai/generate', { method: 'POST', body: { domain: 'Claude Code', count: 1 } })
    assert.ok((g.status === 503 && g.json.error === 'ai_disabled') || (g.status === 403 && g.json.error === 'ai_consent'), 'generate has the same consent gate as the tutor')
    const c = await A('/api/ai/consent', { method: 'POST', body: { consent: true } })
    assert.ok(c.json.aiConsentAt > 0)
    assert.ok((await A('/api/state')).json.user.aiConsentAt > 0)
    const off = await A('/api/ai/consent', { method: 'POST', body: { consent: false } })
    assert.equal(off.json.aiConsentAt, null)
  })

  it('resets a password by email link, signing every session out', async () => {
    clearRateLimits()
    const other = client()
    assert.equal((await other('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: PW } })).status, 200)
    const req = await client()('/api/auth/request-password-reset', { method: 'POST', body: { email: emailA, redirectTo: '/?lang=es' } })
    assert.equal(req.status, 200)
    // Same answer for an unknown address: nothing reveals which emails have accounts
    const unknown = await client()('/api/auth/request-password-reset', { method: 'POST', body: { email: uniqueEmail('nobody'), redirectTo: '/' } })
    assert.deepEqual(unknown.json, req.json)

    let token = null
    for (let i = 0; i < 20 && !token; i++) { token = lastResetToken(uidA); if (!token) await new Promise((r) => setTimeout(r, 250)) }
    assert.ok(token, 'reset token stored')

    const landing = await client()(`/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent('/?lang=es')}`)
    assert.equal(landing.status, 302)
    assert.match(landing.headers.get('location'), new RegExp(`lang=es.*token=${token}|token=${token}.*lang=es`))

    const NEW = 'a brand new password'
    assert.equal((await client()('/api/auth/reset-password', { method: 'POST', body: { newPassword: NEW, token } })).status, 200)
    assert.equal((await client()('/api/auth/reset-password', { method: 'POST', body: { newPassword: NEW, token } })).json.code, 'INVALID_TOKEN', 'token works once')
    assert.equal((await other('/api/state')).status, 401, 'other sessions revoked')
    assert.equal((await A('/api/state')).status, 401, 'this session revoked too')
    assert.equal(sql(`SELECT emailVerified FROM "user" WHERE id = '${uidA}'`)[0].emailVerified, 1, 'reset verifies the email')
    assert.equal((await A('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: PW } })).status, 401, 'old password gone')
    assert.equal((await A('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: NEW } })).status, 200)
    assert.doesNotMatch(devLog(), /reset email failed/)
  })

  it('rate-limits password guessing per IP', async () => {
    clearRateLimits()
    const c = client()
    const statuses = []
    for (let i = 0; i < 12; i++) statuses.push((await c('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: 'wrong password!' } })).status)
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401))
    assert.ok(statuses.slice(10).every((s) => s === 429))
    clearRateLimits()
  })

  it('deleting the account removes all of its data', async () => {
    const r = await A('/api/auth/delete-user', { method: 'POST', body: { password: 'a brand new password' } })
    assert.equal(r.status, 200)
    assert.equal((await A('/api/state')).status, 401)
    const [n] = sql(`SELECT (SELECT COUNT(*) FROM attempts WHERE user_id='${uidA}') + (SELECT COUNT(*) FROM answers WHERE user_id='${uidA}') + (SELECT COUNT(*) FROM settings WHERE user_id='${uidA}') + (SELECT COUNT(*) FROM reviews WHERE user_id='${uidA}') + (SELECT COUNT(*) FROM session WHERE userId='${uidA}') + (SELECT COUNT(*) FROM "user" WHERE id='${uidA}') AS n`)
    assert.equal(n.n, 0)
  })

  it('serves pages with security headers', async () => {
    const res = await fetch(new URL('/', process.env.BASE ?? 'http://localhost:8799'))
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  })
})

describe('API: certifications', () => {
  const C = client()
  let uid
  const sync = async (ops) => (await C('/api/sync', { method: 'POST', body: { deviceId: 'devC', userId: uid, ops } })).json
  const create = (opId, id, extra) => ({ opId, type: 'attempt.create', attempt: { id, mode: 'drill', feedback: true, questionIds: ['architect-foundations-practice-1'], seed: 1, startedAt: Date.now(), deadline: null, ...extra } })

  before(async () => {
    clearRateLimits()
    assert.equal((await C('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Cert', email: uniqueEmail('cert'), password: PW } })).status, 200)
    uid = (await C('/api/state')).json.user.id
  })

  it('stores the certification of each attempt; older clients that send none are Developer', async () => {
    const af = crypto.randomUUID(), legacy = crypto.randomUUID()
    const r = await sync([create('k1', af, { cert: 'architect-foundations' }), create('k2', legacy, { questionIds: [Q] })])
    assert.deepEqual(r.rejected, [])
    const rows = Object.fromEntries((await C('/api/state')).json.attempts.map((a) => [a.id, a.cert]))
    assert.equal(rows[af], 'architect-foundations')
    assert.equal(rows[legacy], 'developer-foundations')
  })

  it('rejects unknown certifications, including prototype names', async () => {
    const r = await sync(['nope', '__proto__', 'constructor', 42].map((cert, i) => create('u' + i, crypto.randomUUID(), { cert })))
    assert.deepEqual(r.rejected.map((x) => x.reason), ['bad', 'bad', 'bad', 'bad'])
  })

  it('accepts only the chosen certification and one well-formed exam date per certification', async () => {
    const at = Date.now()
    const set = (opId, key, value) => ({ opId, type: 'setting', key, value, updatedAt: at })
    const r = await sync([
      set('g1', 'cert', 'architect-professional'), set('g2', 'exam_date:architect-professional', '2027-02-01'), set('g3', 'exam_date', '2026-12-24'), set('g4', 'exam_date:associate-foundations', ''),
      set('b1', 'cert', '__proto__'), set('b2', 'exam_date:__proto__', '2027-01-01'), set('b3', 'exam_date:developer-foundations', '2027-01-01'), set('b4', 'exam_date:architect-foundations', 'next week'), set('b5', 'exam_date', '<script>'),
    ])
    assert.deepEqual(r.rejected.map((x) => x.opId).sort(), ['b1', 'b2', 'b3', 'b4', 'b5'])
    const s = Object.fromEntries((await C('/api/state')).json.settings.map((x) => [x.key, x.value]))
    assert.deepEqual(s, { cert: 'architect-professional', 'exam_date:architect-professional': '2027-02-01', exam_date: '2026-12-24', 'exam_date:associate-foundations': '' })
  })

  it('the tutor and the generator speak about the question\'s own certification', async () => {
    assert.ok((await C('/api/ai/consent', { method: 'POST', body: { consent: true } })).json.aiConsentAt > 0)
    const t = await C('/api/ai/tutor', { method: 'POST', raw: true, body: { qid: 'architect-professional-practice-1', seed: 3, choice: ['A'], lang: 'en', messages: [{ role: 'user', content: 'why?' }] } })
    assert.equal(t.status, 200)
    await t.text()
    let systems = (await client()('/api/__test/deepseek-systems')).json
    assert.match(systems.at(-1), /tutor for the Claude Certified Architect – Professional exam/)

    const g = await C('/api/ai/generate', { method: 'POST', body: { cert: 'associate-foundations', domain: 'Prompting and Task Execution', count: 1 } })
    assert.equal(g.status, 200, JSON.stringify(g.json))
    assert.equal(g.json.accepted.length, 1, JSON.stringify(g.json.rejected))
    assert.equal(g.json.accepted[0].cert, 'associate-foundations')
    systems = (await client()('/api/__test/deepseek-systems')).json
    const gen = systems.findLast((x) => x.startsWith('You write exam items'))
    assert.match(gen, /Claude Certified Associate – Foundations certification, domain "Prompting and Task Execution"/)
    assert.doesNotMatch(gen, /Developer – Foundations certification/)
    assert.match(systems.at(-1), /You are taking the Claude Certified Associate – Foundations exam/)

    // A domain of another certification, or none at all, is not accepted; an old tab that sends only a domain still works
    assert.equal((await C('/api/ai/generate', { method: 'POST', body: { cert: 'associate-foundations', domain: 'Claude Code', count: 1 } })).json.error, 'unknown_domain')
    assert.equal((await C('/api/ai/generate', { method: 'POST', body: { cert: '__proto__', domain: 'Integration', count: 1 } })).json.error, 'unknown_domain')
    const old = await C('/api/ai/generate', { method: 'POST', body: { domain: 'Claude Code', count: 1 } })
    assert.equal(old.status, 200)
    assert.match((await client()('/api/__test/deepseek-systems')).json.findLast((x) => x.startsWith('You write exam items')), /Developer – Foundations certification, domain "Claude Code"/)
  })
})
