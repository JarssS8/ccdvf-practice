// Account linking and eviction (security audit run-1): drives Better Auth's real Google callback through the test harness.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { BASE, client, clearRateLimits, sql, uniqueEmail } from './helpers.mjs'

const PW = 'correct horse battery'
const Q = 'developer-foundations-practice-1'

/** Completes the real Google flow as someone whose Google account has this email; `state` is verified|unverified. */
async function googleSignIn(email, state, sub) {
  clearRateLimits() // Better Auth allows only 3 sign-ins per 10 s per IP
  const c = client()
  const s = await c('/api/auth/sign-in/social', { method: 'POST', body: { provider: 'google', callbackURL: '/' } })
  assert.equal(s.status, 200, JSON.stringify(s.json))
  const st = new URL(s.json.url).searchParams.get('state')
  const cb = await c(`/api/auth/callback/google?code=${encodeURIComponent(`${email}|${state}|${sub}`)}&state=${encodeURIComponent(st)}`, { raw: true })
  assert.equal(cb.status, 302, 'callback redirects')
  return c
}
const rows = (email) => {
  const [user] = sql(`SELECT id, emailVerified, aiConsentAt FROM "user" WHERE email = '${email}'`)
  const accounts = user ? sql(`SELECT providerId, accountId FROM account WHERE userId = '${user.id}' ORDER BY providerId, accountId`) : []
  const sessions = user ? sql(`SELECT COUNT(*) AS n FROM session WHERE userId = '${user.id}'`)[0].n : 0
  return { user, accounts, sessions }
}

describe('OAuth linking', () => {
  before(() => clearRateLimits())

  it('a squatter\'s password, sessions and AI consent are removed when the real owner links a verified identity', async () => {
    const email = uniqueEmail('squat')
    const squatter = client()
    assert.equal((await squatter('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Squatter', email, password: PW } })).status, 200)
    assert.ok((await squatter('/api/ai/consent', { method: 'POST', body: { consent: true } })).json.aiConsentAt > 0)
    assert.equal(rows(email).user.emailVerified, 0)

    const owner = await googleSignIn(email, 'verified', 'sub-owner-' + Date.now())
    const after = rows(email)
    assert.deepEqual(after.accounts.map((a) => a.providerId), ['google'], 'the password identity is gone')
    assert.equal(after.user.emailVerified, 1)
    assert.equal(after.user.aiConsentAt, null, 'the squatter\'s consent does not carry over')
    assert.equal(after.sessions, 1, 'only the owner\'s session remains')
    assert.equal((await squatter('/api/state')).status, 401, 'the squatter is signed out')

    const me = (await owner('/api/state')).json
    assert.equal(me.user.aiConsentAt, null)
    const tutor = await owner('/api/ai/tutor', { method: 'POST', body: { qid: Q, seed: 1, choice: ['A'], lang: 'en', messages: [{ role: 'user', content: 'OWNER-PRIVATE-TEXT' }] } })
    assert.equal(tutor.json.error, 'ai_consent', 'the owner must consent for themselves')
    const calls = (await client()('/api/__test/deepseek-calls')).json
    assert.ok(!calls.some((c) => c.includes('OWNER-PRIVATE-TEXT')), 'nothing of the owner reached the AI provider')
  })

  it('a fresh registration with an unverified provider email is not marked verified, and a later verified identity evicts it', async () => {
    const email = uniqueEmail('unverified')
    await googleSignIn(email, 'unverified', 'sub-claimant-' + Date.now())
    const first = rows(email)
    assert.equal(first.user.emailVerified, 0, 'what the provider asserted is kept')
    assert.deepEqual(first.accounts.map((a) => a.providerId), ['google'])

    const claimantSub = first.accounts[0].accountId
    await googleSignIn(email, 'verified', 'sub-real-owner-' + Date.now())
    const second = rows(email)
    assert.equal(second.user.emailVerified, 1)
    assert.equal(second.accounts.length, 1, 'only the verified identity stays linked')
    assert.notEqual(second.accounts[0].accountId, claimantSub, 'the unverified claimant is evicted')
    assert.equal(second.sessions, 1)
  })

  it('a verified user linking a second sign-in method keeps everything', async () => {
    const email = uniqueEmail('plain')
    await googleSignIn(email, 'verified', 'sub-plain-' + Date.now())
    const before = rows(email)
    assert.equal(before.user.emailVerified, 1)
    await googleSignIn(email, 'verified', before.accounts[0].accountId) // same identity signing in again
    assert.equal(rows(email).accounts.length, 1)
  })
})
