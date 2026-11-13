import { asDisplayed, questionHash, stemPreview, type Question, type Letter } from '../src/shared/exam'
import { CERTS, DEFAULT_CERT, certById, certOfDomain, certOfExamDateKey, certOfQuestion, hasDomain, isCertId, type CertDef } from '../src/shared/certs'
import aoQuestions from '../src/content/associate-foundations/questions.json'
import aoNotes from '../src/content/associate-foundations/notes.json'
import aoBlueprint from '../src/content/associate-foundations/blueprint.json'
import aoEs from '../src/content/associate-foundations/es/questions.json'
import dvQuestions from '../src/content/developer-foundations/questions.json'
import dvNotes from '../src/content/developer-foundations/notes.json'
import dvBlueprint from '../src/content/developer-foundations/blueprint.json'
import dvEs from '../src/content/developer-foundations/es/questions.json'
import afQuestions from '../src/content/architect-foundations/questions.json'
import afNotes from '../src/content/architect-foundations/notes.json'
import afBlueprint from '../src/content/architect-foundations/blueprint.json'
import afEs from '../src/content/architect-foundations/es/questions.json'
import apQuestions from '../src/content/architect-professional/questions.json'
import apNotes from '../src/content/architect-professional/notes.json'
import apBlueprint from '../src/content/architect-professional/blueprint.json'
import apEs from '../src/content/architect-professional/es/questions.json'
import { createAuth, recoveryEnabled, type Auth, type Env } from './auth'

// Per certification: its bank, its study notes (tutor context and the generator's grounding) and its official blueprint
interface Material { bank: Question[]; notes: string; blueprint: Record<string, string>; grounding: string }
const norm = (s: string) => s.toLowerCase().replace(/[*_`>#\[\]()]/g, '').replace(/\s+/g, ' ').trim()
const material = (bank: unknown, notes: { cheatSheet: string; notes: string }, blueprint: Record<string, string>): Material => {
  const text = notes.cheatSheet + '\n\n' + notes.notes
  // Quotes may come from the notes or the official blueprint text
  return { bank: bank as Question[], notes: text, blueprint, grounding: norm(text + '\n' + Object.values(blueprint).join('\n')) }
}
const MATERIAL = new Map<string, Material>([
  ['associate-foundations', material(aoQuestions, aoNotes, aoBlueprint)],
  ['developer-foundations', material(dvQuestions, dvNotes, dvBlueprint)],
  ['architect-foundations', material(afQuestions, afNotes, afBlueprint)],
  ['architect-professional', material(apQuestions, apNotes, apBlueprint)],
])
const materialOf = (cert: CertDef) => MATERIAL.get(cert.id)!
const bankById = new Map(CERTS.flatMap((c) => materialOf(c).bank).map((q) => [q.id, q]))
// Spanish of every bank question, by id (ids are unique across certifications)
const bankEs = { ...aoEs, ...dvEs, ...afEs, ...apEs } as Record<string, { question: string; options: Record<string, string>; rationale: string; src?: string }>
const LATE_GRACE_MS = 30_000
const MAX_OPS = 100
const MAX_ATTEMPTS = 1000 // per user
const MAX_REVIEWS = 20_000 // per user
const DATE = /^\d{4}-\d{2}-\d{2}$/
const RESULT_MAX = 4000
const LETTERS = new Set(['A', 'B', 'C', 'D', 'E'])
const MODES = new Set(['full', 'quick', 'repo-mock-1', 'repo-mock-2', 'repo-mock-3', 'guide', 'drill', 'missed', 'ai', 'flagged'])

// ---------- helpers ----------

const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-store' }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...SECURITY_HEADERS } })

const withHeaders = (res: Response) => {
  const r = new Response(res.body, res)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v)
  return r
}

const today = () => new Date().toISOString().slice(0, 10)
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max
const int = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v)

interface User { id: string; name: string; email: string; image?: string | null; createdAt: Date; aiConsentAt?: number | null }

// ---------- state + sync ----------

async function state(env: Env, user: User) {
  const u = user.id
  const [attempts, answers, reviews, aiq, settings, usage] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM attempts WHERE user_id = ? ORDER BY started_at').bind(u),
    env.DB.prepare('SELECT attempt_id, qid, choice, flagged, updated_at FROM answers WHERE user_id = ?').bind(u),
    env.DB.prepare('SELECT id, card_id, rating, reviewed_at FROM reviews WHERE user_id = ? ORDER BY reviewed_at').bind(u),
    env.DB.prepare('SELECT body, status FROM ai_questions WHERE user_id = ? ORDER BY created_at').bind(u),
    env.DB.prepare('SELECT key, value, updated_at FROM settings WHERE user_id = ?').bind(u),
    env.DB.prepare('SELECT requests FROM ai_usage WHERE user_id = ? AND day = ?').bind(u, today()),
  ])
  return json({
    serverNow: Date.now(),
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null, createdAt: user.createdAt, aiConsentAt: user.aiConsentAt ?? null },
    attempts: attempts.results,
    answers: answers.results,
    reviews: reviews.results,
    aiQuestions: (aiq.results as { body: string; status: string }[]).map((r) => ({ ...JSON.parse(r.body), reported: r.status === 'reported' })),
    settings: settings.results,
    ai: { enabled: !!env.DEEPSEEK_API_KEY, usedToday: (usage.results[0] as { requests?: number } | undefined)?.requests ?? 0, dailyLimit: Number(env.AI_USER_DAILY_LIMIT) },
  })
}

type Op =
  | { opId: string; type: 'attempt.create'; attempt: { id: string; cert?: string; mode: string; label?: string; lang?: string; feedback: boolean; questionIds: string[]; seed: number; startedAt: number; deadline: number | null } }
  | { opId: string; type: 'answer'; attemptId: string; qid: string; choice: Letter[]; flagged: boolean; updatedAt: number }
  | { opId: string; type: 'attempt.lease'; attemptId: string }
  | { opId: string; type: 'attempt.discard'; attemptId: string }
  | { opId: string; type: 'attempt.submit'; attemptId: string; result: unknown; submittedAt: number }
  | { opId: string; type: 'review'; id: string; cardId: string; rating: number; reviewedAt: number }
  | { opId: string; type: 'setting'; key: string; value: string; updatedAt: number }
  | { opId: string; type: 'aiq.report'; id: string }

interface AttemptState { status: string; deadline: number | null; lease: string; qids: Set<string> }

async function sync(req: Request, env: Env, u: string) {
  const body = await req.json<{ deviceId?: unknown; userId?: unknown; ops?: unknown }>().catch(() => null)
  const deviceId = body?.deviceId
  const ops = body?.ops as Op[]
  if (!str(deviceId, 64) || !Array.isArray(ops) || ops.length > MAX_OPS) return json({ error: 'bad_request' }, 400)
  // The outbox was written by another account on this device: never apply it to this one
  if (body?.userId !== u) return json({ error: 'user_mismatch' }, 409)
  const dev = deviceId as string
  const now = Date.now()
  const rejected: { opId: string; reason: string }[] = []
  const reject = (op: Op, reason: string) => rejected.push({ opId: String((op as { opId?: unknown })?.opId ?? ''), reason })

  // Load the attempts these ops touch, then validate every op in memory so the writes go out as one batch
  // (one D1 round trip; the free plan caps queries per request).
  const ids = [...new Set(ops.map((o) => (o && 'attemptId' in o ? o.attemptId : o?.type === 'attempt.create' ? o.attempt?.id : null)).filter((x): x is string => str(x, 64)))]
  const attempts = new Map<string, AttemptState>()
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    const rows = await env.DB.prepare(`SELECT id, status, deadline, lease_device, question_ids FROM attempts WHERE user_id = ? AND id IN (${chunk.map(() => '?').join(',')})`)
      .bind(u, ...chunk).all<{ id: string; status: string; deadline: number | null; lease_device: string; question_ids: string }>()
    for (const r of rows.results) attempts.set(r.id, { status: r.status, deadline: r.deadline, lease: r.lease_device, qids: new Set(JSON.parse(r.question_ids) as string[]) })
  }

  // Per-user ceilings on what sync can create (the only other bound is ops per request)
  const needsCounts = ops.some((o) => o?.type === 'attempt.create' || o?.type === 'review')
  const counts = needsCounts
    ? await env.DB.prepare('SELECT (SELECT COUNT(*) FROM attempts WHERE user_id = ?) AS a, (SELECT COUNT(*) FROM reviews WHERE user_id = ?) AS r').bind(u, u).first<{ a: number; r: number }>()
    : { a: 0, r: 0 }
  let attemptCount = counts?.a ?? 0, reviewCount = counts?.r ?? 0

  const stmts: D1PreparedStatement[] = []
  for (const op of ops) {
    if (!op || typeof op !== 'object' || !str(op.opId, 64)) { reject(op, 'bad'); continue }
    switch (op.type) {
      case 'attempt.create': {
        const a = op.attempt
        // Clients from before certifications send none: those attempts are Developer's
        const cert = a?.cert ?? DEFAULT_CERT
        const valid = a && str(a.id, 64) && isCertId(cert) && MODES.has(a.mode) && (a.label == null || str(a.label, 120)) && Array.isArray(a.questionIds) && a.questionIds.length <= 100
          && a.questionIds.every((q) => str(q, 80)) && int(a.seed) && int(a.startedAt) && (a.deadline === null || int(a.deadline))
        if (!valid) { reject(op, 'bad'); break }
        if (attempts.has(a.id)) break
        if (attemptCount >= MAX_ATTEMPTS) { reject(op, 'quota'); break }
        attemptCount++
        const lang = a.lang === 'es' ? 'es' : 'en'
        attempts.set(a.id, { status: 'active', deadline: a.deadline, lease: dev, qids: new Set(a.questionIds) })
        stmts.push(env.DB.prepare(
          `INSERT OR IGNORE INTO attempts (user_id, id, cert, mode, label, lang, feedback, question_ids, seed, started_at, deadline, status, lease_device, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        ).bind(u, a.id, cert, a.mode, a.label ?? null, lang, a.feedback ? 1 : 0, JSON.stringify(a.questionIds), a.seed, a.startedAt, a.deadline, dev, now))
        break
      }
      case 'attempt.lease': {
        const a = attempts.get(op.attemptId)
        if (!a || a.status !== 'active') break
        a.lease = dev
        stmts.push(env.DB.prepare("UPDATE attempts SET lease_device = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'active'").bind(dev, now, u, op.attemptId))
        break
      }
      case 'answer': {
        const a = attempts.get(op.attemptId)
        if (!str(op.qid, 80) || !Array.isArray(op.choice) || op.choice.length > 5 || !op.choice.every((l) => LETTERS.has(l)) || !int(op.updatedAt)) { reject(op, 'bad'); break }
        if (!a) { reject(op, 'missing'); break }
        if (a.status !== 'active') { reject(op, 'closed'); break }
        if (!a.qids.has(op.qid)) { reject(op, 'bad'); break }
        if (a.lease !== dev) { reject(op, 'lease'); break }
        if (a.deadline && op.updatedAt > a.deadline + LATE_GRACE_MS) { reject(op, 'late'); break }
        stmts.push(env.DB.prepare(
          `INSERT INTO answers (user_id, attempt_id, qid, choice, flagged, updated_at, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, attempt_id, qid) DO UPDATE SET choice = excluded.choice, flagged = excluded.flagged,
             updated_at = excluded.updated_at, device_id = excluded.device_id
           WHERE excluded.updated_at > answers.updated_at`,
        ).bind(u, op.attemptId, op.qid, JSON.stringify(op.choice), op.flagged ? 1 : 0, op.updatedAt, dev))
        break
      }
      case 'attempt.discard': {
        const a = attempts.get(op.attemptId)
        if (!a || a.status !== 'active') break
        a.status = 'discarded'
        stmts.push(env.DB.prepare("UPDATE attempts SET status = 'discarded', updated_at = ? WHERE user_id = ? AND id = ? AND status = 'active'").bind(now, u, op.attemptId))
        break
      }
      case 'attempt.submit': {
        const a = attempts.get(op.attemptId)
        const result = JSON.stringify(op.result ?? null)
        if (!int(op.submittedAt) || result.length > RESULT_MAX) { reject(op, 'bad'); break }
        if (!a || a.status !== 'active') break
        a.status = 'submitted'
        stmts.push(env.DB.prepare("UPDATE attempts SET status = 'submitted', result = ?, submitted_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'active'")
          .bind(result, op.submittedAt, now, u, op.attemptId))
        break
      }
      case 'review':
        if (reviewCount >= MAX_REVIEWS) { reject(op, 'quota'); break }
        reviewCount++
        if (!str(op.id, 64) || !str(op.cardId, 100) || !int(op.rating) || op.rating < 0 || op.rating > 4 || !int(op.reviewedAt)) { reject(op, 'bad'); break }
        stmts.push(env.DB.prepare('INSERT OR IGNORE INTO reviews (user_id, id, card_id, rating, reviewed_at, device_id) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(u, op.id, op.cardId, op.rating, op.reviewedAt, dev))
        break
      case 'setting':
        if (!str(op.key, 40) || !settingValid(op.key, op.value) || !int(op.updatedAt)) { reject(op, 'bad'); break }
        stmts.push(env.DB.prepare(
          `INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE excluded.updated_at > settings.updated_at`,
        ).bind(u, op.key, op.value, op.updatedAt))
        break
      case 'aiq.report':
        if (!str(op.id, 64)) { reject(op, 'bad'); break }
        stmts.push(env.DB.prepare("UPDATE ai_questions SET status = 'reported' WHERE user_id = ? AND id = ?").bind(u, op.id))
        break
      default:
        reject(op, 'unknown')
    }
  }
  if (stmts.length) await env.DB.batch(stmts)
  return json({ ok: true, rejected, serverNow: now })
}

/** The only settings stored: the certification chosen, and one exam date per certification (empty clears it). */
function settingValid(key: string, value: unknown) {
  if (typeof value !== 'string') return false
  if (key === 'cert') return isCertId(value)
  return certOfExamDateKey(key) !== null && (value === '' || DATE.test(value))
}

// ---------- DeepSeek ----------

/** The caller's network identity for abuse limits: the IP Cloudflare saw, IPv6 reduced to its /64. */
function ipKey(req: Request) {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip
}

/** Reserves `calls` from the user's, the network's and the app's daily budget. Returns an error code when any is spent. */
async function takeAiBudget(env: Env, u: string, ip: string, calls: number): Promise<string | null> {
  const day = today()
  const mine = await env.DB.prepare(
    `INSERT INTO ai_usage (user_id, day, requests) VALUES (?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET requests = requests + excluded.requests
     WHERE ai_usage.requests + excluded.requests <= ?
     RETURNING requests`,
  ).bind(u, day, calls, Number(env.AI_USER_DAILY_LIMIT) || 15).first()
  if (!mine) return 'ai_limit'
  // Free accounts are cheap to mint, so one network cannot take more than its own share of the global pool
  const net = await env.DB.prepare(
    `INSERT INTO ai_usage_ip (ip, day, requests) VALUES (?, ?, ?)
     ON CONFLICT (ip, day) DO UPDATE SET requests = requests + excluded.requests
     WHERE ai_usage_ip.requests + excluded.requests <= ?
     RETURNING requests`,
  ).bind(ip, day, calls, Number(env.AI_IP_DAILY_LIMIT) || 60).first()
  if (!net) { await refundAi(env, u, ip, calls, { ip: false, global: false }); return 'ai_limit' }
  const all = await env.DB.prepare(
    `INSERT INTO ai_usage_global (day, requests) VALUES (?, ?)
     ON CONFLICT (day) DO UPDATE SET requests = requests + excluded.requests
     WHERE ai_usage_global.requests + excluded.requests <= ?
     RETURNING requests`,
  ).bind(day, calls, Number(env.AI_GLOBAL_DAILY_LIMIT) || 400).first()
  if (!all) { await refundAi(env, u, ip, calls, { global: false }); return 'ai_global_limit' }
  return null
}

async function refundAi(env: Env, u: string, ip: string, calls: number, only: { ip?: boolean; global?: boolean } = {}) {
  const day = today()
  const stmts = [env.DB.prepare('UPDATE ai_usage SET requests = MAX(0, requests - ?) WHERE user_id = ? AND day = ?').bind(calls, u, day)]
  if (only.ip !== false) stmts.push(env.DB.prepare('UPDATE ai_usage_ip SET requests = MAX(0, requests - ?) WHERE ip = ? AND day = ?').bind(calls, ip, day))
  if (only.global !== false) stmts.push(env.DB.prepare('UPDATE ai_usage_global SET requests = MAX(0, requests - ?) WHERE day = ?').bind(calls, day))
  await env.DB.batch(stmts)
}

async function addTokens(env: Env, tokens: number) {
  if (tokens) await env.DB.prepare('UPDATE ai_usage_global SET tokens = tokens + ? WHERE day = ?').bind(tokens, today()).run()
}

// No user identifier is ever sent to DeepSeek.
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
    if (!res.ok) { console.error('DeepSeek', res.status, (await res.text()).slice(0, 200)); throw new Error(`DeepSeek ${res.status}`) }
    const data = await res.json<{ choices: { message: { content: string }; finish_reason?: string }[]; usage?: { total_tokens: number } }>()
    await addTokens(env, data.usage?.total_tokens ?? 0)
    const choice = data.choices?.[0]
    const content = choice?.message?.content?.trim()
    if (!content) { why.push(`empty response (${choice?.finish_reason ?? '?'})`); continue } // the API can return empty content in JSON mode
    try { return JSON.parse(content) as T } catch {
      why.push(choice?.finish_reason === 'length' ? 'response cut by length' : 'invalid JSON')
    }
  }
  return null
}

const optionText = (q: Pick<Question, 'options'>) =>
  (Object.entries(q.options) as [Letter, string][]).map(([k, v]) => `${k}. ${v}`).join('\n')

/** The question as the client shows it: bank or the user's own AI questions, in its language when the translation is current. */
async function findQuestion(env: Env, u: string, qid: string, lang: string): Promise<Question | null> {
  let q = bankById.get(qid) ?? null
  if (!q) {
    const row = await env.DB.prepare('SELECT body FROM ai_questions WHERE user_id = ? AND id = ?').bind(u, qid).first<{ body: string }>()
    q = row ? (JSON.parse(row.body) as Question) : null
  }
  const t = q && lang === 'es' && Object.hasOwn(bankEs, q.id) ? bankEs[q.id] : undefined
  if (q && t && t.src === questionHash(q)) {
    const options: Question['options'] = {}
    for (const k of Object.keys(q.options) as Letter[]) options[k] = t.options[k] ?? q.options[k]
    q = { ...q, question: t.question, options, rationale: t.rationale }
  }
  return q
}

async function tutor(req: Request, env: Env, user: User) {
  const ip = ipKey(req)
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'ai_disabled' }, 503)
  if (!user.aiConsentAt) return json({ error: 'ai_consent' }, 403)
  const body = await req.json<{ qid?: unknown; seed?: unknown; choice?: unknown; lang?: unknown; messages?: unknown }>().catch(() => null)
  const messages = body?.messages as { role: string; content: unknown }[]
  const choice = Array.isArray(body?.choice) ? (body.choice as unknown[]).filter((l): l is Letter => typeof l === 'string' && LETTERS.has(l)) : []
  if (!body || !str(body.qid, 80) || !int(body.seed) || !Array.isArray(messages) || !messages.length || messages.length > 20) return json({ error: 'bad_request' }, 400)
  const lang = body.lang === 'es' ? 'es' : 'en'
  const found = await findQuestion(env, user.id, body.qid as string, lang)
  if (!found) return json({ error: 'unknown_question' }, 404)
  const budget = await takeAiBudget(env, user.id, ip, 1)
  if (budget) return json({ error: budget }, 429)

  const { question, choice: shown } = asDisplayed(found, body.seed as number, choice)
  const cert = certById(certOfQuestion(found))
  const intro = lang === 'es'
    ? `Eres tutor para el examen ${cert.name}. Responde en español, breve (máx. 150 palabras), directo y técnico.\nBasa tus explicaciones en la explicación del banco y en los apuntes. Si algo no está en ellos y no estás seguro, dilo: no inventes funcionalidades de Claude.\nSeñala la pista del enunciado que decide la respuesta. Habla solo de esta pregunta y del temario del examen; si te piden otra cosa, recondúcelo.`
    : `You are a tutor for the ${cert.name} exam. Answer in English, briefly (max 150 words), directly and technically.\nBase your explanations on the bank rationale and the notes. If something is not in them and you are not sure, say so: do not invent Claude features.\nPoint out the clue in the stem that decides the answer. Only discuss this question and the exam syllabus; if asked for anything else, steer back.`
  const system = `${intro}

QUESTION (${question.domain}):
${question.question}
${optionText(question)}
Key: ${question.answer.join(', ')}
Student answer: ${shown.length ? shown.join(', ') : 'blank'}
Bank rationale: ${question.rationale}${found.ref ? `\nSource note: ${found.evidence ?? ''}\nOfficial source: ${found.ref}` : ''}

NOTES:
${materialOf(cert).notes.slice(0, 16000)}`

  const upstream = await deepseek(env, {
    model: env.DEEPSEEK_MODEL, stream: true, max_tokens: 700, temperature: 0.3, thinking: { type: 'disabled' },
    messages: [
      { role: 'system', content: system },
      ...messages.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) })),
    ],
  })
  if (!upstream.ok || !upstream.body) { await refundAi(env, user.id, ip, 1); return json({ error: 'ai_upstream' }, 502) }
  return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream', ...SECURITY_HEADERS } })
}

// Generation with guards: grounded quote, similar option lengths, blind second-model check, dedupe.
const tokenSet = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1) }

interface Draft { question: string; options: Record<string, string>; answer: string[]; select: number; rationale: string; evidence: string }

function validate(d: Draft, multi: boolean, grounding: string, longestMargin = 1.15): string | null {
  if (!d || typeof d.question !== 'string' || d.question.length < 40) return 'stem'
  const keys = Object.keys(d.options ?? {})
  if (keys.join('') !== 'ABCD' || keys.some((k) => typeof d.options[k] !== 'string' || d.options[k].length < 8)) return 'options'
  const ans = Array.isArray(d.answer) ? [...new Set(d.answer)] : []
  if (!ans.length || ans.some((l) => !keys.includes(l))) return 'key'
  if (ans.length !== d.select || d.select > (multi ? 2 : 1)) return 'select'
  const lens = keys.map((k) => d.options[k].length)
  if (Math.max(...lens) / Math.min(...lens) > 2.2) return 'option lengths'
  if (ans.length === 1) {
    const sorted = [...lens].sort((a, b) => b - a)
    const correctLen = d.options[ans[0]].length
    if (correctLen === sorted[0] && correctLen > sorted[1] * longestMargin) return 'the key is the longest option'
  }
  if (typeof d.rationale !== 'string' || d.rationale.length < 60) return 'rationale'
  if (typeof d.evidence !== 'string' || norm(d.evidence).length < 20 || !grounding.includes(norm(d.evidence))) return `quote not found in notes or blueprint: “${String(d.evidence).slice(0, 120)}”`
  return null
}

async function generate(req: Request, env: Env, user: User) {
  const u = user.id, ip = ipKey(req)
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'ai_disabled' }, 503)
  if (!user.aiConsentAt) return json({ error: 'ai_consent' }, 403)
  const body = await req.json<{ cert?: unknown; domain?: unknown; count?: number; multi?: boolean }>().catch(() => null)
  // Tabs opened before certifications send only the domain, which names its certification
  const certId = body?.cert === undefined ? certOfDomain(typeof body?.domain === 'string' ? body.domain : '') : body.cert
  if (!isCertId(certId)) return json({ error: 'unknown_domain' }, 400)
  const cert = certById(certId)
  if (!hasDomain(cert, body?.domain)) return json({ error: 'unknown_domain' }, 400)
  const domain = body!.domain as string
  const { bank, notes: notesText, blueprint: blueprints, grounding } = materialOf(cert)
  const count = Math.min(Math.max(Number(body?.count) || 3, 1), 4)
  const multi = !!body?.multi
  // Two calls whatever the count: one generation and one blind check for the whole batch (see below)
  const budget = await takeAiBudget(env, u, ip, 2)
  if (budget) return json({ error: budget }, 429)

  // Style examples from the calibrated items when there are any: the older ones teach the longest-key cue
  const inDomain = bank.filter((q) => q.domain === domain)
  const calibrated = inDomain.filter((q) => q.calibrated && q.source !== 'guide')
  const examples = (calibrated.length >= 2 ? calibrated : inDomain).sort(() => Math.random() - 0.5).slice(0, 2)
  // Only this certification's own questions: they are what a new item must not repeat
  const existing = await env.DB.prepare('SELECT body FROM ai_questions WHERE user_id = ?').bind(u).all<{ body: string }>()
  const mine = existing.results.map((r) => JSON.parse(r.body) as Question).filter((q) => certOfQuestion(q) === cert.id)
  const known = [...bank, ...mine].map((q) => tokenSet(q.question))

  const blueprint = Object.hasOwn(blueprints, domain) ? blueprints[domain] : ''
  const others = cert.domains.filter((d) => d.name !== domain).map((d) => d.name).join('; ')
  const system = `You write exam items for the ${cert.name} certification, domain "${domain}".
Official blueprint for this domain (every item must test one of these task statements; if the deciding skill belongs to another domain of this exam (${others}), do not write that item):
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

  // Only this domain's scenarios go into the prompt (a different domain tests a different skill); the token check below still compares with everything
  const covered = [...bank, ...mine].filter((q) => q.domain === domain).map((q) => `- ${stemPreview(q.question).slice(0, 170)}`).join('\n')
  const userPrompt = `Write ${count} new items. Style examples (do not copy):\n\n${examples.map((q) => `${q.question}\n${optionText(q)}\nKey: ${q.answer.join(',')}`).join('\n\n')}\n\nAlready in the bank (do not reuse these scenarios):\n${covered}`

  let drafts: Draft[] = []
  const why: string[] = []
  try {
    const out = await deepseekJson<{ questions: Draft[] }>(env, env.DEEPSEEK_MODEL, system, userPrompt, 8000, why)
    drafts = Array.isArray(out?.questions) ? out.questions : []
    if (out && !drafts.length) why.push('the JSON had no "questions"')
  } catch (e) {
    console.error(e)
    await refundAi(env, u, ip, 2)
    return json({ error: 'ai_upstream' }, 502)
  }

  const accepted: Question[] = []
  const rejected: { question: string; reason: string }[] = why.map((reason) => ({ question: '', reason: `DeepSeek: ${reason}` }))
  const candidates: Draft[] = []
  for (const d of drafts.slice(0, count)) {
    const reason = validate(d, multi, grounding, calibrated.length >= 2 ? 1.05 : 1.15)
    if (reason) { rejected.push({ question: d?.question?.slice(0, 80) ?? '', reason }); continue }
    const t = tokenSet(d.question)
    if (known.some((k) => jaccard(k, t) >= 0.5) || candidates.some((c) => jaccard(tokenSet(c.question), t) >= 0.5)) {
      rejected.push({ question: d.question.slice(0, 80), reason: 'duplicate' }); continue
    }
    candidates.push(d)
  }

  // Blind check in ONE call for the whole batch: another model answers every item without the keys and judges whether each fits the domain.
  // If that answer comes back cut or incomplete, the missing items are checked one by one, and each extra call is charged.
  type Check = { answer: string[]; fits_domain: boolean }
  const checks: (Check | null)[] = candidates.map(() => null)
  const checkWhy: string[] = []
  const checkSystem = `You are taking the ${cert.name} exam. Answer every item. Then judge, for each item, whether the skill that decides it is covered by this blueprint for the domain "${domain}":
${blueprint}
Reply in json: {"results":[{"item":1,"answer":["<letter>"],"fits_domain":true}]} with one entry per item, in order, and exactly the number of letters each item asks for.`
  const runCheck = async (idx: number[]) => {
    const out = await deepseekJson<{ results: (Check & { item: number })[] }>(env, env.DEEPSEEK_CHECK_MODEL, checkSystem,
      idx.map((i, n) => `ITEM ${n + 1}\n${candidates[i].question}\n${optionText(candidates[i] as unknown as Question)}\nSelect ${candidates[i].select}.`).join('\n\n'),
      Math.min(4000 + 3000 * idx.length, 16000), checkWhy, true)
    for (const r of out?.results ?? []) {
      const i = idx[Number(r?.item) - 1]
      if (i !== undefined && Array.isArray(r.answer)) checks[i] = { answer: r.answer, fits_domain: r.fits_domain }
    }
  }
  if (!candidates.length) await refundAi(env, u, ip, 1) // nothing to check: the second call was never made
  else {
    let upstreamFailed = false
    try { await runCheck(candidates.map((_, i) => i)) } catch (e) {
      upstreamFailed = true
      checkWhy.push(String((e as Error).message))
      await refundAi(env, u, ip, 1)
    }
    const missing = checks.flatMap((c, i) => (c ? [] : [i]))
    if (missing.length && !upstreamFailed && !(await takeAiBudget(env, u, ip, missing.length))) {
      await Promise.all(missing.map((i) => runCheck([i]).catch((e) => { checkWhy.push(String((e as Error).message)) })))
    }
  }

  const inserts: D1PreparedStatement[] = []
  for (const [i, d] of candidates.entries()) {
    const check = checks[i]
    const a = [...(check?.answer ?? [])].map(String).sort().join('')
    if (!check) { rejected.push({ question: d.question.slice(0, 80), reason: `check failed (${[...new Set(checkWhy)].join(', ') || 'no answer'})` }); continue }
    if (a !== [...d.answer].sort().join('')) { rejected.push({ question: d.question.slice(0, 80), reason: `blind check answered ${a || 'nothing'}` }); continue }
    if (check.fits_domain === false) { rejected.push({ question: d.question.slice(0, 80), reason: 'does not fit the domain blueprint' }); continue }

    const q: Question = {
      id: 'ai-' + crypto.randomUUID().slice(0, 12), source: 'ai', cert: cert.id, domain,
      question: d.question, options: d.options, answer: d.answer as Letter[], rationale: d.rationale, evidence: d.evidence,
    }
    inserts.push(env.DB.prepare('INSERT INTO ai_questions (user_id, id, domain, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(u, q.id, domain, JSON.stringify(q), Date.now()))
    known.push(tokenSet(d.question))
    accepted.push(q)
  }
  if (inserts.length) await env.DB.batch(inserts)
  return json({ accepted, rejected })
}

async function consent(req: Request, env: Env, u: string) {
  const body = await req.json<{ consent?: unknown }>().catch(() => null)
  if (typeof body?.consent !== 'boolean') return json({ error: 'bad_request' }, 400)
  const at = body.consent ? Date.now() : null
  await env.DB.prepare('UPDATE "user" SET "aiConsentAt" = ? WHERE id = ?').bind(at, u).run()
  return json({ ok: true, aiConsentAt: at })
}

// ---------- router ----------

// Building Better Auth costs ~25 ms of CPU: do it once per isolate (env is stable within one)
const auths = new WeakMap<Env, Auth>()
function getAuth(env: Env) {
  let a = auths.get(env)
  if (!a) { a = createAuth(env); auths.set(env, a) }
  return a
}

async function currentUser(auth: Auth, req: Request) {
  const s = await auth.api.getSession({ headers: req.headers })
  return (s?.user as User | undefined) ?? null
}

const AUTH_PATHS = new Set(['sign-up/email', 'sign-in/email', 'sign-in/social', 'sign-out', 'get-session', 'revoke-sessions', 'delete-user',
  'callback/google', 'callback/github', 'error'])
const RESET_PATHS = new Set(['request-password-reset', 'reset-password'])

function authPathAllowed(path: string, env: Env) {
  if (AUTH_PATHS.has(path)) return true
  if (!recoveryEnabled(env)) return false
  return RESET_PATHS.has(path) || /^reset-password\/[A-Za-z0-9]{16,64}$/.test(path)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    try {
      if (url.pathname === '/api/config' && req.method === 'GET') {
        const providers = [env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && 'google', env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && 'github'].filter(Boolean)
        return json({ providers, recovery: recoveryEnabled(env) })
      }
      const auth = getAuth(env)
      // Better Auth checks Origin against trustedOrigins on its own mutating routes
      if (url.pathname.startsWith('/api/auth/')) {
        // Better Auth rate-limits before it resolves routes, one stored row per distinct path: only forward the routes the app uses
        if (!authPathAllowed(url.pathname.slice('/api/auth/'.length), env)) return json({ error: 'not_found' }, 404)
        return withHeaders(await auth.handler(req))
      }

      if (req.method !== 'GET' && req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403)
      const user = await currentUser(auth, req)
      if (!user) return json({ error: 'auth' }, 401)

      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/state': return await state(env, user)
        case 'POST /api/sync': return await sync(req, env, user.id)
        case 'POST /api/ai/consent': return await consent(req, env, user.id)
        case 'POST /api/ai/tutor': return await tutor(req, env, user)
        case 'POST /api/ai/generate': return await generate(req, env, user)
      }
      return json({ error: 'not_found' }, 404)
    } catch (e) {
      console.error(e)
      return json({ error: 'server' }, 500)
    }
  },

  // Daily housekeeping: expired auth rows, per-IP rate-limit counters older than a day, old AI counters
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
    await env.DB.batch([
      env.DB.prepare('DELETE FROM "rateLimit" WHERE "lastRequest" < ?').bind(Date.now() - 864e5),
      env.DB.prepare('DELETE FROM "session" WHERE "expiresAt" < ?').bind(new Date().toISOString()),
      env.DB.prepare('DELETE FROM "verification" WHERE "expiresAt" < ?').bind(new Date().toISOString()),
      env.DB.prepare('DELETE FROM ai_usage WHERE day < ?').bind(cutoff),
      env.DB.prepare('DELETE FROM ai_usage_ip WHERE day < ?').bind(cutoff),
      env.DB.prepare('DELETE FROM ai_usage_global WHERE day < ?').bind(new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)),
    ])
  },
} satisfies ExportedHandler<Env>
