import { DOMAINS, EXAM, domainQuotas, mulberry32, shuffle, type Letter, type Question } from '../shared/exam'
import { groupOf, type AiQuestion } from './content'
import { getLang, type Dict, type Lang } from '../i18n'
import type { Data } from './store'
import type { Answer, Attempt, AttemptResult, Mode } from './types'

export { displayLetter, optionOrder } from '../shared/exam'

export const isCorrect = (q: Question, choice: Letter[] | undefined) =>
  !!choice && choice.length === q.answer.length && q.answer.every((l) => choice.includes(l))

// ---------- history ----------

export interface Exposure { qid: string; group: string; attemptId: string; at: number; correct: boolean; firstOfGroup: boolean; feedback: boolean }

/** Every answered question in submitted attempts, oldest first; firstOfGroup marks the first time a concept was seen. */
export function exposures(data: Data, qs: Map<string, AiQuestion>): Exposure[] {
  const out: Exposure[] = []
  const attempts = Object.values(data.attempts).filter((a) => a.status === 'submitted').sort((a, b) => a.startedAt - b.startedAt)
  const seen = new Set<string>()
  for (const a of attempts) {
    for (const qid of a.questionIds) {
      const q = qs.get(qid)
      const ans = data.answers[`${a.id}|${qid}`]
      if (!q || !ans || !ans.choice.length) continue
      const group = groupOf(q)
      out.push({ qid, group, attemptId: a.id, at: ans.updatedAt, correct: isCorrect(q, ans.choice), firstOfGroup: !seen.has(group), feedback: a.feedback })
      seen.add(group)
    }
  }
  return out
}

// ---------- building attempts ----------

export interface ModeSpec { items: number; minutes: number | null; feedback: boolean }

// Titles and descriptions live in the dictionaries (t.modes)
export const MODES: Record<Mode, ModeSpec> = {
  full: { items: EXAM.items, minutes: EXAM.minutes, feedback: false },
  quick: { items: 15, minutes: 34, feedback: false },
  'repo-mock-1': { items: 15, minutes: 30, feedback: false },
  'repo-mock-2': { items: 15, minutes: 30, feedback: false },
  'repo-mock-3': { items: 15, minutes: 30, feedback: false },
  guide: { items: 3, minutes: null, feedback: true },
  drill: { items: 10, minutes: null, feedback: true },
  missed: { items: 15, minutes: null, feedback: true },
  ai: { items: 10, minutes: null, feedback: true },
  flagged: { items: 20, minutes: null, feedback: true },
}

/** Simulations of the real exam: always in English, interface included. */
export const EXAM_MODES: Mode[] = ['full', 'quick', 'repo-mock-1', 'repo-mock-2', 'repo-mock-3', 'guide']
export const isExamMode = (m: Mode) => EXAM_MODES.includes(m)
/** Language an attempt is shown in: exams in English, everything else in the language it was started in. */
export const attemptLang = (a: Pick<Attempt, 'mode' | 'lang'>): Lang => (isExamMode(a.mode) ? 'en' : a.lang ?? getLang())

/** Questions ordered by how stale they are for you: never seen first, then oldest seen, ties random. */
function byFreshness(pool: AiQuestion[], exp: Exposure[], rnd: () => number) {
  const last = new Map<string, number>()
  for (const e of exp) last.set(e.group, e.at)
  return shuffle(pool, rnd).sort((a, b) => (last.get(groupOf(a)) ?? -1) - (last.get(groupOf(b)) ?? -1))
}

function pickDistinct(sorted: AiQuestion[], n: number, used: Set<string>) {
  const out: AiQuestion[] = []
  for (const q of sorted) {
    if (out.length >= n) break
    if (used.has(groupOf(q))) continue
    used.add(groupOf(q))
    out.push(q)
  }
  return out
}

export function latestByQuestion(data: Data) {
  const latest = new Map<string, Answer>()
  for (const a of Object.values(data.answers)) {
    const att = data.attempts[a.attemptId]
    if (!att || att.status !== 'submitted' || !a.choice.length) continue
    const prev = latest.get(a.qid)
    if (!prev || a.updatedAt > prev.updatedAt) latest.set(a.qid, a)
  }
  return latest
}

export function buildAttempt(mode: Mode, data: Data, qs: Map<string, AiQuestion>, opts: { domain?: string; fromAttempt?: string; now: number }): Omit<Attempt, 'status'> | { error: 'no_missed' | 'no_questions' } {
  const spec = MODES[mode]
  const seed = (Math.random() * 2 ** 32) >>> 0
  const rnd = mulberry32(seed)
  const all = [...qs.values()].filter((q) => !(q as AiQuestion).reported)
  const repo = all.filter((q) => q.source !== 'ai')
  const exp = exposures(data, qs)
  let chosen: AiQuestion[] = []
  let label: string | undefined

  if (mode === 'full' || mode === 'quick') {
    const quotas = domainQuotas(spec.items)
    const used = new Set<string>()
    for (const d of DOMAINS) chosen.push(...pickDistinct(byFreshness(repo.filter((q) => q.domain === d.name), exp, rnd), quotas[d.name], used))
    // A domain without enough distinct questions is topped up from the freshest of the rest
    if (chosen.length < spec.items) chosen.push(...pickDistinct(byFreshness(repo, exp, rnd), spec.items - chosen.length, used))
    chosen = shuffle(chosen, rnd)
  } else if (mode.startsWith('repo-mock-')) {
    chosen = repo.filter((q) => q.source === 'mock-' + mode.slice(-1))
  } else if (mode === 'guide') {
    chosen = repo.filter((q) => q.source === 'guide')
  } else if (mode === 'drill') {
    label = opts.domain
    const pool = all.filter((q) => q.domain === opts.domain && q.source !== 'ai')
    chosen = pickDistinct(byFreshness(pool, exp, rnd), spec.items, new Set())
  } else if (mode === 'ai') {
    label = opts.domain
    const pool = all.filter((q) => q.source === 'ai' && (!opts.domain || q.domain === opts.domain))
    chosen = byFreshness(pool, exp, rnd).slice(0, spec.items)
  } else if (mode === 'missed' && opts.fromAttempt) {
    // The misses of one attempt, all of them
    const src = data.attempts[opts.fromAttempt]
    label = src ? `from:${src.mode}` : undefined
    chosen = shuffle((src?.questionIds ?? []).map((id) => qs.get(id)!).filter((q) => q && !isCorrect(q, data.answers[`${src!.id}|${q.id}`]?.choice)), rnd)
  } else if (mode === 'missed') {
    const latest = latestByQuestion(data)
    chosen = shuffle(all.filter((q) => { const a = latest.get(q.id); return a && !isCorrect(q, a.choice) }), rnd).slice(0, spec.items)
  } else if (mode === 'flagged') {
    const flagged = new Set(Object.values(data.answers).filter((a) => a.flagged).map((a) => a.qid))
    chosen = shuffle(all.filter((q) => flagged.has(q.id)), rnd).slice(0, spec.items)
  }

  if (!chosen.length) return { error: mode === 'missed' ? 'no_missed' : 'no_questions' }
  return {
    id: crypto.randomUUID(), mode, label, lang: isExamMode(mode) ? 'en' : getLang(), feedback: spec.feedback, seed,
    questionIds: chosen.map((q) => q.id), startedAt: opts.now,
    deadline: spec.minutes ? opts.now + spec.minutes * 60_000 : null,
  }
}

// ---------- scoring ----------

export function scoreAttempt(a: Attempt, data: Data, qs: Map<string, AiQuestion>, at: number): AttemptResult {
  const prior = exposures({ ...data, attempts: Object.fromEntries(Object.entries(data.attempts).filter(([, x]) => x.status === 'submitted' && x.startedAt < a.startedAt)) }, qs)
  const seenGroups = new Set(prior.map((e) => e.group))
  const r: AttemptResult = { total: a.questionIds.length, correct: 0, blank: 0, flagged: 0, fresh: 0, freshCorrect: 0, timeUsedMs: Math.min(at, a.deadline ?? at) - a.startedAt, byDomain: {} }
  for (const qid of a.questionIds) {
    const q = qs.get(qid)
    if (!q) continue
    const ans = data.answers[`${a.id}|${qid}`]
    const ok = isCorrect(q, ans?.choice)
    const fresh = !seenGroups.has(groupOf(q))
    if (!ans?.choice.length) r.blank++
    if (ans?.flagged) r.flagged++
    if (ok) r.correct++
    if (fresh) { r.fresh++; if (ok) r.freshCorrect++ }
    const d = (r.byDomain[q.domain] ??= { n: 0, c: 0 })
    d.n++
    if (ok) d.c++
  }
  return r
}

// ---------- estimates ----------

export interface Estimate { n: number; p: number; lo: number; hi: number; scaled: number; scaledLo: number; scaledHi: number; zone: 'below' | 'borderline' | 'likely' }

/** Linear map of proportion correct onto 100–1000. The real raw→scaled conversion is not published. */
export const toScaled = (p: number) => Math.round(EXAM.scaleMin + (EXAM.scaleMax - EXAM.scaleMin) * p)
export const PASS_P = (EXAM.passScaled - EXAM.scaleMin) / (EXAM.scaleMax - EXAM.scaleMin)

export function estimate(correct: number, n: number): Estimate | null {
  if (n < 1) return null
  // Wilson interval, 95%
  const z = 1.96
  const p = correct / n
  const den = 1 + (z * z) / n
  const mid = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  const lo = Math.max(0, mid - half)
  const hi = Math.min(1, mid + half)
  const zone = hi < PASS_P ? 'below' : lo >= PASS_P ? 'likely' : 'borderline'
  return { n, p, lo, hi, scaled: toScaled(p), scaledLo: toScaled(lo), scaledHi: toScaled(hi), zone }
}

/** Readiness from first exposures to repo questions only, re-weighted to the blueprint. */
export function readiness(exp: Exposure[], qs: Map<string, AiQuestion>) {
  const first = exp.filter((e) => e.firstOfGroup && qs.get(e.qid)?.source !== 'ai')
  if (!first.length) return null
  const by: Record<string, { n: number; c: number }> = {}
  for (const e of first) {
    const d = qs.get(e.qid)!.domain
    const t = (by[d] ??= { n: 0, c: 0 })
    t.n++
    if (e.correct) t.c++
  }
  const total = first.length
  const overall = first.filter((e) => e.correct).length / total
  // Shrink each domain toward the overall rate, then weight by the blueprint
  const k = 3
  let p = 0
  for (const d of DOMAINS) {
    const t = by[d.name] ?? { n: 0, c: 0 }
    p += (d.weight / 100) * ((t.c + k * overall) / (t.n + k))
  }
  const est = estimate(Math.round(p * total), total)
  return est && { ...est, by }
}

export function domainStats(exp: Exposure[], qs: Map<string, AiQuestion>) {
  const res = DOMAINS.map((d) => ({ name: d.name, weight: d.weight, first: { n: 0, c: 0 }, recent: { n: 0, c: 0 } }))
  const idx = new Map<string, (typeof res)[number]>(res.map((r) => [r.name, r]))
  const recentCut = exp.length - 60
  exp.forEach((e, i) => {
    const r = idx.get(qs.get(e.qid)?.domain ?? '')
    if (!r) return
    if (e.firstOfGroup) { r.first.n++; if (e.correct) r.first.c++ }
    if (i >= recentCut) { r.recent.n++; if (e.correct) r.recent.c++ }
  })
  return res
}

export const pct = (c: number, n: number) => (n ? Math.round((c / n) * 100) : 0)
export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
export const locale = (lang: Lang = getLang()) => (lang === 'es' ? 'es-ES' : 'en-GB')
export const fmtDate = (ms: number, lang?: Lang) => new Date(ms).toLocaleDateString(locale(lang), { day: '2-digit', month: 'short', year: 'numeric' })
export const fmtNum = (n: number, lang?: Lang) => n.toLocaleString(locale(lang))

export function attemptTitle(a: Pick<Attempt, 'mode' | 'label'>, t: Dict) {
  const base = t.modes[a.mode]?.title ?? a.mode
  if (!a.label) return base
  if (a.label.startsWith('from:')) return `${base} · ${t.common.fromAttempt(t.modes[a.label.slice(5) as Mode]?.title ?? a.label.slice(5))}`
  return `${base} · ${t.domains[a.label] ?? a.label}`
}
