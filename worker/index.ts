import { DOMAINS, type Question, type Letter } from '../src/shared/exam'
import notesJson from '../src/content/notes.json'
import bankJson from '../src/content/questions.json'
import blueprintJson from '../src/content/blueprint.json'

interface Env {
  ASSETS: Fetcher
  DB: D1Database
  APP_PASSPHRASE: string
  SESSION_SECRET: string
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_MODEL: string
  DEEPSEEK_CHECK_MODEL: string
  AI_DAILY_LIMIT: string
}

const bank = bankJson as Question[]
const notesText = notesJson.cheatSheet + '\n\n' + notesJson.notes
const COOKIE = 'ccdvf_s'
const SESSION_DAYS = 90
const LATE_GRACE_MS = 30_000

// ---------- helpers ----------

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

const enc = new TextEncoder()
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, enc.encode(data))
}

async function safeEqual(secret: string, a: string, b: string) {
  const [x, y] = await Promise.all([hmac(secret, a), hmac(secret, b)])
  return crypto.subtle.timingSafeEqual(x, y)
}

async function getSetting(env: Env, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value ?? fallback
}

async function makeSession(env: Env) {
  const gen = await getSetting(env, 'session_gen', '0')
  const exp = Date.now() + SESSION_DAYS * 864e5
  const payload = `${exp}.${gen}`
  return `${payload}.${b64url(await hmac(env.SESSION_SECRET, payload))}`
}

async function validSession(env: Env, req: Request) {
  const raw = req.headers.get('cookie')?.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1)
  if (!raw) return false
  const [exp, gen, sig] = raw.split('.')
  if (!exp || !gen || !sig || Number(exp) < Date.now()) return false
  const expected = b64url(await hmac(env.SESSION_SECRET, `${exp}.${gen}`))
  if (!(await safeEqual(env.SESSION_SECRET, sig, expected))) return false
  return gen === (await getSetting(env, 'session_gen', '0'))
}

const cookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`

const today = () => new Date().toISOString().slice(0, 10)

// ---------- auth ----------

async function login(req: Request, env: Env) {
  const ip = req.headers.get('cf-connecting-ip') ?? 'local'
  const since = Date.now() - 15 * 60_000
  const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND at > ?').bind(ip, since).first<{ n: number }>()
  if ((fails?.n ?? 0) >= 5) return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429)

  const body = await req.json<{ passphrase?: string }>().catch(() => ({}) as { passphrase?: string })
  if (!env.APP_PASSPHRASE || !(await safeEqual(env.SESSION_SECRET, String(body.passphrase ?? ''), env.APP_PASSPHRASE))) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO login_failures (ip, at) VALUES (?, ?)').bind(ip, Date.now()),
      env.DB.prepare('DELETE FROM login_failures WHERE at < ?').bind(since),
    ])
    return json({ error: 'Frase de acceso incorrecta.' }, 401)
  }
  return json({ ok: true }, 200, { 'set-cookie': cookie(await makeSession(env), SESSION_DAYS * 86400) })
}

// ---------- state + sync ----------

async function state(env: Env) {
  const [attempts, answers, reviews, aiq, settings, usage] = await Promise.all([
    env.DB.prepare('SELECT * FROM attempts ORDER BY started_at').all(),
    env.DB.prepare('SELECT * FROM answers').all(),
    env.DB.prepare('SELECT * FROM reviews ORDER BY reviewed_at').all(),
    env.DB.prepare('SELECT body, status FROM ai_questions ORDER BY created_at').all<{ body: string; status: string }>(),
    env.DB.prepare("SELECT key, value, updated_at FROM settings WHERE key NOT LIKE 'session_%'").all(),
    env.DB.prepare('SELECT requests FROM ai_usage WHERE day = ?').bind(today()).first<{ requests: number }>(),
  ])
  return json({
    serverNow: Date.now(),
    attempts: attempts.results,
    answers: answers.results,
    reviews: reviews.results,
    aiQuestions: aiq.results.map((r) => ({ ...JSON.parse(r.body), reported: r.status === 'reported' })),
    settings: settings.results,
    ai: { enabled: !!env.DEEPSEEK_API_KEY, usedToday: usage?.requests ?? 0, dailyLimit: Number(env.AI_DAILY_LIMIT) },
  })
}

type Op =
  | { opId: string; type: 'attempt.create'; attempt: { id: string; mode: string; label?: string; feedback: boolean; questionIds: string[]; seed: number; startedAt: number; deadline: number | null } }
  | { opId: string; type: 'answer'; attemptId: string; qid: string; choice: Letter[]; flagged: boolean; updatedAt: number }
  | { opId: string; type: 'attempt.lease'; attemptId: string }
  | { opId: string; type: 'attempt.discard'; attemptId: string }
  | { opId: string; type: 'attempt.submit'; attemptId: string; result: unknown; submittedAt: number }
  | { opId: string; type: 'review'; id: string; cardId: string; rating: number; reviewedAt: number }
  | { opId: string; type: 'setting'; key: string; value: string; updatedAt: number }
  | { opId: string; type: 'aiq.report'; id: string }

async function sync(req: Request, env: Env) {
  const { deviceId, ops } = await req.json<{ deviceId: string; ops: Op[] }>()
  if (typeof deviceId !== 'string' || !Array.isArray(ops) || ops.length > 500) return json({ error: 'bad request' }, 400)
  const now = Date.now()
  const rejected: { opId: string; reason: string }[] = []

  for (const op of ops) {
    switch (op.type) {
      case 'attempt.create': {
        const a = op.attempt
        await env.DB.prepare(
          `INSERT OR IGNORE INTO attempts (id, mode, label, feedback, question_ids, seed, started_at, deadline, status, lease_device, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        ).bind(a.id, a.mode, a.label ?? null, a.feedback ? 1 : 0, JSON.stringify(a.questionIds), a.seed, a.startedAt, a.deadline, deviceId, now).run()
        break
      }
      case 'attempt.lease':
        await env.DB.prepare("UPDATE attempts SET lease_device = ?, updated_at = ? WHERE id = ? AND status = 'active'").bind(deviceId, now, op.attemptId).run()
        break
      case 'answer': {
        const a = await env.DB.prepare('SELECT status, deadline, lease_device FROM attempts WHERE id = ?').bind(op.attemptId)
          .first<{ status: string; deadline: number | null; lease_device: string }>()
        if (!a) { rejected.push({ opId: op.opId, reason: 'missing' }); break }
        if (a.status !== 'active') { rejected.push({ opId: op.opId, reason: 'closed' }); break }
        if (a.lease_device !== deviceId) { rejected.push({ opId: op.opId, reason: 'lease' }); break }
        if (a.deadline && op.updatedAt > a.deadline + LATE_GRACE_MS) { rejected.push({ opId: op.opId, reason: 'late' }); break }
        await env.DB.prepare(
          `INSERT INTO answers (attempt_id, qid, choice, flagged, updated_at, device_id) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (attempt_id, qid) DO UPDATE SET choice = excluded.choice, flagged = excluded.flagged,
             updated_at = excluded.updated_at, device_id = excluded.device_id
           WHERE excluded.updated_at > answers.updated_at`,
        ).bind(op.attemptId, op.qid, JSON.stringify(op.choice), op.flagged ? 1 : 0, op.updatedAt, deviceId).run()
        break
      }
      case 'attempt.discard':
        await env.DB.prepare("UPDATE attempts SET status = 'discarded', updated_at = ? WHERE id = ? AND status = 'active'").bind(now, op.attemptId).run()
        break
      case 'attempt.submit':
        await env.DB.prepare("UPDATE attempts SET status = 'submitted', result = ?, submitted_at = ?, updated_at = ? WHERE id = ? AND status = 'active'")
          .bind(JSON.stringify(op.result), op.submittedAt, now, op.attemptId).run()
        break
      case 'review':
        await env.DB.prepare('INSERT OR IGNORE INTO reviews (id, card_id, rating, reviewed_at, device_id) VALUES (?, ?, ?, ?, ?)')
          .bind(op.id, op.cardId, op.rating, op.reviewedAt, deviceId).run()
        break
      case 'setting':
        if (op.key.startsWith('session_')) { rejected.push({ opId: op.opId, reason: 'reserved' }); break }
        await env.DB.prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE excluded.updated_at > settings.updated_at`,
        ).bind(op.key, op.value, op.updatedAt).run()
        break
      case 'aiq.report':
        await env.DB.prepare("UPDATE ai_questions SET status = 'reported' WHERE id = ?").bind(op.id).run()
        break
      default:
        rejected.push({ opId: (op as { opId: string }).opId, reason: 'unknown' })
    }
  }
  return json({ ok: true, rejected, serverNow: now })
}

// ---------- DeepSeek ----------

async function takeAiBudget(env: Env, calls: number) {
  const limit = Number(env.AI_DAILY_LIMIT) || 80
  const row = await env.DB.prepare(
    `INSERT INTO ai_usage (day, requests) VALUES (?, ?)
     ON CONFLICT (day) DO UPDATE SET requests = requests + excluded.requests
     WHERE ai_usage.requests + excluded.requests <= ?
     RETURNING requests`,
  ).bind(today(), calls, limit).first<{ requests: number }>()
  return !!row
}

async function addTokens(env: Env, tokens: number) {
  if (tokens) await env.DB.prepare('UPDATE ai_usage SET tokens = tokens + ? WHERE day = ?').bind(tokens, today()).run()
}

async function deepseek(env: Env, body: Record<string, unknown>) {
  return fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify(body),
  })
}

/** JSON-mode call with one retry. `why` collects the reason when nothing usable comes back. */
// DeepSeek thinks by default (effort high), and the reasoning eats max_tokens: each call says whether it should.
async function deepseekJson<T>(env: Env, model: string, system: string, user: string, maxTokens: number, why: string[] = [], think = false): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await deepseek(env, {
      model, max_tokens: maxTokens, temperature: attempt ? 0.4 : 0.8,
      thinking: { type: think ? 'enabled' : 'disabled' },
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    })
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json<{ choices: { message: { content: string }; finish_reason?: string }[]; usage?: { total_tokens: number } }>()
    await addTokens(env, data.usage?.total_tokens ?? 0)
    const choice = data.choices?.[0]
    const content = choice?.message?.content?.trim()
    if (!content) { why.push(`respuesta vacía (${choice?.finish_reason ?? '?'})`); continue } // the API can return empty content in JSON mode
    try { return JSON.parse(content) as T } catch {
      why.push(choice?.finish_reason === 'length' ? 'respuesta cortada por longitud' : 'JSON inválido')
    }
  }
  return null
}

const optionText = (q: Pick<Question, 'options'>) =>
  (Object.entries(q.options) as [Letter, string][]).map(([k, v]) => `${k}. ${v}`).join('\n')

async function tutor(req: Request, env: Env) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'IA no configurada' }, 503)
  const { question, choice, messages } = await req.json<{ question: Question; choice: Letter[]; messages: { role: 'user' | 'assistant'; content: string }[] }>()
  if (!question?.question || !Array.isArray(messages) || messages.length > 20) return json({ error: 'bad request' }, 400)
  if (!(await takeAiBudget(env, 1))) return json({ error: 'Límite diario de IA alcanzado.' }, 429)

  const system = `Eres tutor para el examen ${'Claude Certified Developer – Foundations'}. Responde en español, breve (máx. 150 palabras), directo y técnico.
Basa tus explicaciones en la explicación del banco y en los apuntes. Si algo no está en ellos y no estás seguro, dilo: no inventes funcionalidades de la API de Claude.
Señala la pista del enunciado que decide la respuesta.

PREGUNTA (${question.domain}):
${question.question}
${optionText(question)}
Correcta: ${question.answer.join(', ')}
Respuesta del alumno: ${choice?.length ? choice.join(', ') : 'en blanco'}
Explicación del banco: ${question.rationale}

APUNTES:
${notesText.slice(0, 16000)}`

  const upstream = await deepseek(env, {
    model: env.DEEPSEEK_MODEL, stream: true, max_tokens: 700, temperature: 0.3, thinking: { type: 'disabled' },
    messages: [{ role: 'system', content: system }, ...messages.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))],
  })
  if (!upstream.ok || !upstream.body) return json({ error: `DeepSeek ${upstream.status}` }, 502)
  return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
}

// Generation with guards: grounded quote, similar option lengths, blind second-model check, dedupe.
const norm = (s: string) => s.toLowerCase().replace(/[*_`>#\[\]()]/g, '').replace(/\s+/g, ' ').trim()
// Quotes may come from the notes or the official blueprint text
const notesNorm = norm(notesText + '\n' + Object.values(blueprintJson as Record<string, string>).join('\n'))
const tokenSet = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1) }

interface Draft { question: string; options: Record<string, string>; answer: string[]; select: number; rationale: string; evidence: string }

function validate(d: Draft, multi: boolean): string | null {
  if (!d || typeof d.question !== 'string' || d.question.length < 40) return 'enunciado'
  const keys = Object.keys(d.options ?? {})
  if (keys.join('') !== 'ABCD' || keys.some((k) => typeof d.options[k] !== 'string' || d.options[k].length < 8)) return 'opciones'
  const ans = Array.isArray(d.answer) ? [...new Set(d.answer)] : []
  if (!ans.length || ans.some((l) => !keys.includes(l))) return 'clave'
  if (ans.length !== d.select || d.select > (multi ? 2 : 1)) return 'select'
  const lens = keys.map((k) => d.options[k].length)
  if (Math.max(...lens) / Math.min(...lens) > 2.2) return 'longitudes'
  if (ans.length === 1) {
    const sorted = [...lens].sort((a, b) => b - a)
    const correctLen = d.options[ans[0]].length
    if (correctLen === sorted[0] && correctLen > sorted[1] * 1.15) return 'la correcta es la más larga'
  }
  if (typeof d.rationale !== 'string' || d.rationale.length < 60) return 'explicación'
  if (typeof d.evidence !== 'string' || norm(d.evidence).length < 20 || !notesNorm.includes(norm(d.evidence))) return `cita no encontrada en apuntes ni temario: «${String(d.evidence).slice(0, 120)}»`
  return null
}

async function generate(req: Request, env: Env) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'IA no configurada' }, 503)
  const body = await req.json<{ domain: string; count?: number; multi?: boolean }>()
  const domain = DOMAINS.find((d) => d.name === body.domain)?.name
  if (!domain) return json({ error: 'dominio desconocido' }, 400)
  const count = Math.min(Math.max(body.count ?? 3, 1), 5)
  const multi = !!body.multi
  if (!(await takeAiBudget(env, 1 + count))) return json({ error: 'Límite diario de IA alcanzado.' }, 429)

  const examples = bank.filter((q) => q.domain === domain).sort(() => Math.random() - 0.5).slice(0, 2)
  const existing = await env.DB.prepare('SELECT body FROM ai_questions').all<{ body: string }>()
  const known = [...bank, ...existing.results.map((r) => JSON.parse(r.body) as Question)].map((q) => tokenSet(q.question))

  const blueprint = (blueprintJson as Record<string, string>)[domain] ?? ''
  const system = `You write exam items for the Claude Certified Developer – Foundations certification, domain "${domain}".
Official blueprint for this domain (every item must test one of these task statements; if the deciding skill belongs to another domain, such as security, MCP or prompting, do not write that item):
${blueprint}

Output json only, shaped exactly like:
{"questions":[{"question":"scenario + question","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":["C"],"select":1,"rationale":"why the key is right and why each distractor is wrong","evidence":"verbatim quote copied from the NOTES that supports the key"}]}
Rules:
- Scenario-based, one best answer, decided by a specific detail in the stem. English.
- All four options must be plausible and of SIMILAR LENGTH; the correct one must not be the longest.
- Vary which letter is correct.
- ${multi ? 'Make about half of the items multiple-response with "select":2 and two keys; say "(Select TWO.)" at the end of the stem.' : 'Every item has "select":1.'}
- Only test facts stated in the NOTES or the blueprint above. "evidence" must be copied character-for-character from one of them (20-200 chars), and must support the key, not just name the topic.
- Do not reuse any scenario from the "already in the bank" list, even reworded: pick a different situation and a different deciding detail.

NOTES:
${notesText}`

  const covered = [...bank, ...existing.results.map((r) => JSON.parse(r.body) as Question)].map((q) => `- ${q.question.slice(0, 170)}`).join('\n')
  const user = `Write ${count} new items. Style examples (do not copy):\n\n${examples.map((q) => `${q.question}\n${optionText(q)}\nKey: ${q.answer.join(',')}`).join('\n\n')}\n\nAlready in the bank (do not reuse these scenarios):\n${covered}`

  let drafts: Draft[] = []
  const why: string[] = []
  try {
    const out = await deepseekJson<{ questions: Draft[] }>(env, env.DEEPSEEK_MODEL, system, user, 8000, why)
    drafts = Array.isArray(out?.questions) ? out.questions : []
    if (out && !drafts.length) why.push('el JSON no traía "questions"')
  } catch (e) {
    return json({ error: String(e) }, 502)
  }

  const accepted: Question[] = []
  const rejected: { question: string; reason: string }[] = why.map((reason) => ({ question: '', reason: `DeepSeek: ${reason}` }))
  const candidates: Draft[] = []
  for (const d of drafts.slice(0, count)) {
    const reason = validate(d, multi)
    if (reason) { rejected.push({ question: d?.question?.slice(0, 80) ?? '', reason }); continue }
    const t = tokenSet(d.question)
    if (known.some((k) => jaccard(k, t) >= 0.5) || candidates.some((c) => jaccard(tokenSet(c.question), t) >= 0.5)) {
      rejected.push({ question: d.question.slice(0, 80), reason: 'repetida' }); continue
    }
    candidates.push(d)
  }

  // Blind check, in parallel: another model answers without the key and judges whether the item fits the domain
  const checks = await Promise.all(candidates.map(async (d) => {
    const reasons: string[] = []
    try {
      const r = await deepseekJson<{ answer: string[]; fits_domain: boolean }>(env, env.DEEPSEEK_CHECK_MODEL,
        `You are taking a certification exam about building with Claude. Answer the item. Then judge whether the skill that decides it is covered by this blueprint for the domain "${domain}":
${blueprint}
Reply in json: {"answer":["<letter>"],"fits_domain":true} with exactly the number of letters the item asks for.`,
        `${d.question}\n${optionText(d as unknown as Question)}\nSelect ${d.select}.`, 6000, reasons, true)
      return { r, reasons }
    } catch (e) { return { r: null, reasons: [String((e as Error).message)] } }
  }))

  for (const [i, d] of candidates.entries()) {
    const { r: check, reasons } = checks[i]
    const a = [...(check?.answer ?? [])].map(String).sort().join('')
    if (!check) { rejected.push({ question: d.question.slice(0, 80), reason: `verificación fallida (${reasons.join(', ') || 'sin respuesta'})` }); continue }
    if (a !== [...d.answer].sort().join('')) { rejected.push({ question: d.question.slice(0, 80), reason: `verificación ciega respondió ${a || 'nada'}` }); continue }
    if (check.fits_domain === false) { rejected.push({ question: d.question.slice(0, 80), reason: 'no encaja en el temario del dominio' }); continue }
    const t = tokenSet(d.question)

    const q: Question = {
      id: 'ai-' + crypto.randomUUID().slice(0, 12), source: 'ai', domain,
      question: d.question, options: d.options, answer: d.answer as Letter[], rationale: d.rationale, evidence: d.evidence,
    }
    await env.DB.prepare('INSERT INTO ai_questions (id, domain, body, created_at) VALUES (?, ?, ?, ?)').bind(q.id, domain, JSON.stringify(q), Date.now()).run()
    known.push(t)
    accepted.push(q)
  }
  return json({ accepted, rejected })
}

// ---------- router ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    if (req.method !== 'GET') {
      const origin = req.headers.get('origin')
      if (origin !== url.origin) return json({ error: 'origin' }, 403)
    }

    try {
      if (url.pathname === '/api/login' && req.method === 'POST') return await login(req, env)
      if (!(await validSession(env, req))) return json({ error: 'auth' }, 401)

      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/session': return json({ ok: true })
        case 'GET /api/state': return await state(env)
        case 'POST /api/sync': return await sync(req, env)
        case 'POST /api/ai/tutor': return await tutor(req, env)
        case 'POST /api/ai/generate': return await generate(req, env)
        case 'POST /api/logout': return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) })
        case 'POST /api/logout-all': {
          const gen = String(Number(await getSetting(env, 'session_gen', '0')) + 1)
          await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
            .bind('session_gen', gen, Date.now()).run()
          return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) })
        }
      }
      return json({ error: 'not found' }, 404)
    } catch (e) {
      console.error(e)
      return json({ error: 'server' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
