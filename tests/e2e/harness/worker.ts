// Test-only entry (`wrangler dev tests/e2e/harness/worker.ts`, see scripts/test-local.mjs): wraps the real Worker and answers
// the two external hosts in-process, so Better Auth's real Google OAuth callback and the AI tutor run end to end with no network.
// The "code" a test passes to /api/auth/callback/google is `<email>|<verified|unverified>|<google-sub>`.
import app from '../../../worker/index'
import type { Env } from '../../../worker/auth'

const deepseekCalls: string[] = []
const b64u = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const realFetch = globalThis.fetch

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('https://api.deepseek.com/')) {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] }
    deepseekCalls.push(body.messages.filter((m) => m.role === 'user').map((m) => m.content).join(' | '))
    return new Response('data: {"choices":[{"delta":{"content":"mock tutor reply"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : String(init?.body))
    const [email, state, sub] = (form.get('code') ?? '').split('|')
    const now = Math.floor(Date.now() / 1000)
    const idToken = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u({ iss: 'https://accounts.google.com', aud: 'dummy-google-client', sub, email, email_verified: state === 'verified', name: 'Google User', iat: now, exp: now + 3600 })}.c2ln`
    return new Response(JSON.stringify({ access_token: 'dummy', id_token: idToken, token_type: 'Bearer', expires_in: 3600, scope: 'openid email profile' }), { headers: { 'content-type': 'application/json' } })
  }
  if (/^https?:\/\/(?!localhost)/.test(url)) throw new Error('test harness: blocked external fetch ' + url)
  return realFetch(input as RequestInfo, init)
}) as typeof fetch

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(req.url).pathname === '/api/__test/deepseek-calls') return Response.json(deepseekCalls)
    return app.fetch(req, env, ctx as never)
  },
  scheduled: app.scheduled,
} satisfies ExportedHandler<Env>
