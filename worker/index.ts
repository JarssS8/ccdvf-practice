import { DOMAINS, asDisplayed, questionHash, type Question, type Letter } from '../src/shared/exam'
import notesJson from '../src/content/notes.json'
import bankJson from '../src/content/questions.json'
import bankEsJson from '../src/content/es/questions.json'
import blueprintJson from '../src/content/blueprint.json'
import { createAuth, type Auth, type Env } from './auth'

const bank = bankJson as Question[]
const bankById = new Map(bank.map((q) => [q.id, q]))
const bankEs = bankEsJson as Record<string, { question: string; options: Record<string, string>; rationale: string; src?: string }>
const notesText = notesJson.cheatSheet + '\n\n' + notesJson.notes
const LATE_GRACE_MS = 30_000
const MAX_OPS = 100
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
  | { opId: string; type: 'attempt.create'; attempt: { id: string; mode: string; label?: string; lang?: string; feedback: boolean; questionIds: string[]; seed: number; startedAt: number; deadline: number | null } }
  | { opId: string; type: 'answer'; attemptId: string; qid: string; choice: Letter[]; flagged: boolean; updatedAt: number }
  | { opId: string; type: 'attempt.lease'; attemptId: string }
  | { opId: string; type: 'attempt.discard'; attemptId: string }
  | { opId: string; type: 'attempt.submit'; attemptId: string; result: unknown; submittedAt: number }
  | { opId: string; type: 'review'; id: string; cardId: string; rating: number; reviewedAt: number }
  | { opId: string; type: 'setting'; key: string; value: string; updatedAt: number }
  | { opId: string; type: 'aiq.report'; id: string }

interface AttemptState { status: string; deadline: number | null; lease: string }

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
    const rows = await env.DB.prepare(`SELECT id, status, deadline, lease_device FROM attempts WHERE user_id = ? AND id IN (${chunk.map(() => '?').join(',')})`)
      .bind(u, ...chunk).all<{ id: string; status: string; deadline: number | null; lease_device: string }>()
    for (const r of rows.results) attempts.set(r.id, { status: r.status, deadline: r.deadline, lease: r.lease_device })
  }

  const stmts: D1PreparedStatement[] = []
  for (const op of ops) {
    if (!op || typeof op !== 'object' || !str(op.opId, 64)) { reject(op, 'bad'); continue }
    switch (op.type) {
      case 'attempt.create': {
        const a = op.attempt
        const valid = a && str(a.id, 64) && MODES.has(a.mode) && (a.label == null || str(a.label, 120)) && Array.isArray(a.questionIds) && a.questionIds.length <= 100
          && a.questionIds.every((q) => str(q, 80)) && int(a.seed) && int(a.startedAt) && (a.deadline === null || int(a.deadline))
        if (!valid) { reject(op, 'bad'); break }
        if (attempts.has(a.id)) break
        const lang = a.lang === 'es' ? 'es' : 'en'
        attempts.set(a.id, { status: 'active', deadline: a.deadline, lease: dev })
        stmts.push(env.DB.prepare(
          `INSERT OR IGNORE INTO attempts (user_id, id, mode, label, lang, feedback, question_ids, seed, started_at, deadline, status, lease_device, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        ).bind(u, a.id, a.mode, a.label ?? null, lang, a.feedback ? 1 : 0, JSON.stringify(a.questionIds), a.seed, a.startedAt, a.deadline, dev, now))
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
        if (!int(op.submittedAt) || result.length > 20_000) { reject(op, 'bad'); break }
        if (!a || a.status !== 'active') break
        a.status = 'submitted'
        stmts.push(env.DB.prepare("UPDATE attempts SET status = 'submitted', result = ?, submitted_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'active'")
          .bind(result, op.submittedAt, now, u, op.attemptId))
        break
      }
      case 'review':
        if (!str(op.id, 64) || !str(op.cardId, 100) || !int(op.rating) || op.rating < 0 || op.rating > 4 || !int(op.reviewedAt)) { reject(op, 'bad'); break }
        stmts.push(env.DB.prepare('INSERT OR IGNORE INTO reviews (user_id, id, card_id, rating, reviewed_at, device_id) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(u, op.id, op.cardId, op.rating, op.reviewedAt, dev))
        break
      case 'setting':
        if (!str(op.key, 40) || typeof op.value !== 'string' || op.value.length > 500 || !int(op.updatedAt)) { reject(op, 'bad'); break }
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

// ---------- DeepSeek ----------

/** Reserves `calls` from the user's and the app's daily budget. Returns an error code when either is spent. */
async function takeAiBudget(env: Env, u: string, calls: number): Promise<string | null> {
  const day = today()
  const mine = await env.DB.prepare(
    `INSERT INTO ai_usage (user_id, day, requests) VALUES (?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET requests = requests + excluded.requests
     WHERE ai_usage.requests + excluded.requests <= ?
     RETURNING requests`,
  ).bind(u, day, calls, Number(env.AI_USER_DAILY_LIMIT) || 15).first()
  if (!mine) return 'ai_limit'
  const all = await env.DB.prepare(
    `INSERT INTO ai_usage_global (day, requests) VALUES (?, ?)
     ON CONFLICT (day) DO UPDATE SET requests = requests + excluded.requests
     WHERE ai_usage_global.requests + excluded.requests <= ?
     RETURNING requests`,
  ).bind(day, calls, Number(env.AI_GLOBAL_DAILY_LIMIT) || 400).first()
  if (!all) { await refundAi(env, u, calls, false); return 'ai_global_limit' }
  return null
}

async function refundAi(env: Env, u: string, calls: number, global = true) {
  const day = today()
  const stmts = [env.DB.prepare('UPDATE ai_usage SET requests = MAX(0, requests - ?) WHERE user_id = ? AND day = ?').bind(calls, u, day)]
  if (global) stmts.push(env.DB.prepare('UPDATE ai_usage_global SET requests = MAX(0, requests - ?) WHERE day = ?').bind(calls, day))
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
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`)
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
  const t = q && lang === 'es' ? bankEs[q.id] : undefined
  if (q && t && t.src === questionHash(q)) {
    const options: Question['options'] = {}
    for (const k of Object.keys(q.options) as Letter[]) options[k] = t.options[k] ?? q.options[k]
    q = { ...q, question: t.question, options, rationale: t.rationale }
  }
  return q
}

async function tutor(req: Request, env: Env, user: User) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'ai_disabled' }, 503)
  if (!user.aiConsentAt) return json({ error: 'ai_consent' }, 403)
  const body = await req.json<{ qid?: unknown; seed?: unknown; choice?: unknown; lang?: unknown; messages?: unknown }>().catch(() => null)
  const messages = body?.messages as { role: string; content: unknown }[]
  const choice = Array.isArray(body?.choice) ? (body.choice as unknown[]).filter((l): l is Letter => typeof l === 'string' && LETTERS.has(l)) : []
  if (!body || !str(body.qid, 80) || !int(body.seed) || !Array.isArray(messages) || !messages.length || messages.length > 20) return json({ error: 'bad_request' }, 400)
  const lang = body.lang === 'es' ? 'es' : 'en'
  const found = await findQuestion(env, user.id, body.qid as string, lang)
  if (!found) return json({ error: 'unknown_question' }, 404)
  const budget = await takeAiBudget(env, user.id, 1)
  if (budget) return json({ error: budget }, 429)

  const { question, choice: shown } = asDisplayed(found, body.seed as number, choice)
  const intro = lang === 'es'
    ? 'Eres tutor para el examen Claude Certified Developer – Foundations. Responde en español, breve (máx. 150 palabras), directo y técnico.\nBasa tus explicaciones en la explicación del banco y en los apuntes. Si algo no está en ellos y no estás seguro, dilo: no inventes funcionalidades de la API de Claude.\nSeñala la pista del enunciado que decide la respuesta. Habla solo de esta pregunta y del temario del examen; si te piden otra cosa, recondúcelo.'
    : 'You are a tutor for the Claude Certified Developer – Foundations exam. Answer in English, briefly (max 150 words), directly and technically.\nBase your explanations on the bank rationale and the notes. If something is not in them and you are not sure, say so: do not invent Claude API features.\nPoint out the clue in the stem that decides the answer. Only discuss this question and the exam syllabus; if asked for anything else, steer back.'
  const system = `${intro}

QUESTION (${question.domain}):
${question.question}
${optionText(question)}
Key: ${question.answer.join(', ')}
Student answer: ${shown.length ? shown.join(', ') : 'blank'}
Bank rationale: ${question.rationale}

NOTES:
${notesText.slice(0, 16000)}`

  const upstream = await deepseek(env, {
    model: env.DEEPSEEK_MODEL, stream: true, max_tokens: 700, temperature: 0.3, thinking: { type: 'disabled' },
    messages: [
      { role: 'system', content: system },
      ...messages.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) })),
    ],
  })
  if (!upstream.ok || !upstream.body) { await refundAi(env, user.id, 1); return json({ error: 'ai_upstream' }, 502) }
  return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream', ...SECURITY_HEADERS } })
}

// Generation with guards: grounded quote, similar option lengths, blind second-model check, dedupe.
const norm = (s: string) => s.toLowerCase().replace(/[*_`>#\[\]()]/g, '').replace(/\s+/g, ' ').trim()
// Quotes may come from the notes or the official blueprint text
const notesNorm = norm(notesText + '\n' + Object.values(blueprintJson as Record<string, string>).join('\n'))
const tokenSet = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1) }

interface Draft { question: string; options: Record<string, string>; answer: string[]; select: number; rationale: string; evidence: string }

function validate(d: Draft, multi: boolean): string | null {
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
    if (correctLen === sorted[0] && correctLen > sorted[1] * 1.15) return 'the key is the longest option'
  }
  if (typeof d.rationale !== 'string' || d.rationale.length < 60) return 'rationale'
  if (typeof d.evidence !== 'string' || norm(d.evidence).length < 20 || !notesNorm.includes(norm(d.evidence))) return `quote not found in notes or blueprint: “${String(d.evidence).slice(0, 120)}”`
  return null
}

async function generate(req: Request, env: Env, u: string) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'ai_disabled' }, 503)
  const body = await req.json<{ domain?: string; count?: number; multi?: boolean }>().catch(() => null)
  const domain = DOMAINS.find((d) => d.name === body?.domain)?.name
  if (!domain) return json({ error: 'unknown_domain' }, 400)
  const count = Math.min(Math.max(Number(body?.count) || 3, 1), 4)
  const multi = !!body?.multi
  const budget = await takeAiBudget(env, u, 1 + count)
  if (budget) return json({ error: budget }, 429)

  const examples = bank.filter((q) => q.domain === domain).sort(() => Math.random() - 0.5).slice(0, 2)
  const existing = await env.DB.prepare('SELECT body FROM ai_questions WHERE user_id = ?').bind(u).all<{ body: string }>()
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
    if (out && !drafts.length) why.push('the JSON had no "questions"')
  } catch (e) {
    console.error(e)
    await refundAi(env, u, 1 + count)
    return json({ error: 'ai_upstream' }, 502)
  }

  const accepted: Question[] = []
  const rejected: { question: string; reason: string }[] = why.map((reason) => ({ question: '', reason: `DeepSeek: ${reason}` }))
  const candidates: Draft[] = []
  for (const d of drafts.slice(0, count)) {
    const reason = validate(d, multi)
    if (reason) { rejected.push({ question: d?.question?.slice(0, 80) ?? '', reason }); continue }
    const t = tokenSet(d.question)
    if (known.some((k) => jaccard(k, t) >= 0.5) || candidates.some((c) => jaccard(tokenSet(c.question), t) >= 0.5)) {
      rejected.push({ question: d.question.slice(0, 80), reason: 'duplicate' }); continue
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

  const inserts: D1PreparedStatement[] = []
  for (const [i, d] of candidates.entries()) {
    const { r: check, reasons } = checks[i]
    const a = [...(check?.answer ?? [])].map(String).sort().join('')
    if (!check) { rejected.push({ question: d.question.slice(0, 80), reason: `check failed (${reasons.join(', ') || 'no answer'})` }); continue }
    if (a !== [...d.answer].sort().join('')) { rejected.push({ question: d.question.slice(0, 80), reason: `blind check answered ${a || 'nothing'}` }); continue }
    if (check.fits_domain === false) { rejected.push({ question: d.question.slice(0, 80), reason: 'does not fit the domain blueprint' }); continue }

    const q: Question = {
      id: 'ai-' + crypto.randomUUID().slice(0, 12), source: 'ai', domain,
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    try {
      if (url.pathname === '/api/config' && req.method === 'GET') {
        const providers = [env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && 'google', env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && 'github'].filter(Boolean)
        return json({ providers })
      }
      const auth = getAuth(env)
      // Better Auth checks Origin against trustedOrigins on its own mutating routes
      if (url.pathname.startsWith('/api/auth/')) return withHeaders(await auth.handler(req))

      if (req.method !== 'GET' && req.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403)
      const user = await currentUser(auth, req)
      if (!user) return json({ error: 'auth' }, 401)

      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/state': return await state(env, user)
        case 'POST /api/sync': return await sync(req, env, user.id)
        case 'POST /api/ai/consent': return await consent(req, env, user.id)
        case 'POST /api/ai/tutor': return await tutor(req, env, user)
        case 'POST /api/ai/generate': return await generate(req, env, user.id)
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
      env.DB.prepare('DELETE FROM ai_usage_global WHERE day < ?').bind(new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)),
    ])
  },
} satisfies ExportedHandler<Env>
