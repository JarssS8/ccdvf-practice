// Question shape and option shuffling, shared by the app and the Worker. Exam facts per certification: certs.ts.

export type Letter = 'A' | 'B' | 'C' | 'D' | 'E'

export interface Question {
  id: string
  source: string // practice | mock-1..3 | guide | ai
  /** Certification id (certs.ts). Bank questions always carry it; older AI questions resolve it from the domain. */
  cert?: string
  domain: string
  question: string
  options: Partial<Record<Letter, string>>
  answer: Letter[]
  rationale: string
  dupGroup?: string
  evidence?: string
  /** Official page that settles the key (calibrated items). */
  ref?: string
  /** ISO time from which the item is free of answer-pattern cues; only answers given after it measure readiness. */
  calibrated?: string
  /** Which lote an item belongs to when source is "lote" (2 or 3); every other bank question is Lote 1. */
  lote?: number
}

/** The lote a question is served in: 1 for the original bank, 2 or 3 for the long-scenario lotes. */
export const loteOf = (q: Pick<Question, 'lote'>) => q.lote ?? 1

/** A stem split into prose and ``` code blocks, in order (an unclosed fence runs to the end). */
export function stemParts(s: string): { code: boolean; text: string }[] {
  const out: { code: boolean; text: string }[] = []
  const re = /```[^\n]*\n?([\s\S]*?)(?:```|$)/g
  let at = 0
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > at) out.push({ code: false, text: s.slice(at, m.index).trim() })
    out.push({ code: true, text: m[1].replace(/\n$/, '') })
    at = re.lastIndex
    if (!m[0]) break
  }
  if (at < s.length) out.push({ code: false, text: s.slice(at).trim() })
  return out.filter((p) => p.code || p.text)
}

/** The stem as one line of prose, without its code blocks: for previews, lists and exports. */
export const stemPreview = (s: string) => stemParts(s).filter((p) => !p.code).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim()

// ---------- option order (shared so the Worker sees a question exactly as the viewer does) ----------

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a, 32 bit. Also marks which English text a translation was made from. */
export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
export const textHash = (s: string) => hash(s).toString(36)

export function shuffle<T>(xs: T[], rnd: () => number) {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E']

/** Display order of a question's original option letters for this attempt (the bank's keys follow fixed patterns). */
export function optionOrder(q: Pick<Question, 'id' | 'options'>, seed: number): Letter[] {
  const keys = LETTERS.filter((l) => q.options[l] != null)
  return shuffle(keys, mulberry32(seed ^ hash(q.id)))
}
export const displayLetter = (i: number) => LETTERS[i]

/** Rationales cite options as "(B)" or "(A, C)" by original letter; rewrite them to the shuffled display letters. */
export function relabel(text: string, q: Question, seed: number) {
  const order = optionOrder(q, seed)
  const map = (l: string) => { const i = order.indexOf(l as Letter); return i < 0 ? l : displayLetter(i) }
  return text.replace(/\(([A-E](?:,\s*[A-E])*)\)/g, (_, inner: string) => `(${inner.split(/,\s*/).map(map).sort().join(', ')})`)
}

/** The question as the viewer sees it (shuffled order, display letters): what the tutor must talk about. */
export function asDisplayed(q: Question, seed: number, choice: Letter[]) {
  const order = optionOrder(q, seed)
  const to = (l: Letter) => displayLetter(order.indexOf(l))
  const options: Question['options'] = {}
  order.forEach((orig, i) => { options[displayLetter(i)] = q.options[orig] })
  return {
    question: { ...q, options, answer: q.answer.map(to).sort(), rationale: relabel(q.rationale, q, seed) },
    choice: choice.map(to).sort(),
  }
}

/** Translation fingerprint of a question's English text. */
export const questionHash = (q: Pick<Question, 'question' | 'options' | 'rationale'>) => textHash(JSON.stringify([q.question, q.options, q.rationale]))

/** Fingerprint of what an override replaces in an upstream question: when it moves, the override must be re-reviewed. */
export const upstreamHash = (q: Pick<Question, 'question' | 'options' | 'answer'>) => textHash(JSON.stringify([q.question, q.options, q.answer]))
