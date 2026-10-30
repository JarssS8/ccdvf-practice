// Facts from developer-foundations/exam-guide.pdf (v1.0). Shared by the app and the Worker.

export const EXAM = {
  code: 'CCDV-F',
  name: 'Claude Certified Developer – Foundations',
  items: 53,
  minutes: 120,
  passScaled: 720,
  scaleMin: 100,
  scaleMax: 1000,
} as const

export const DOMAINS = [
  { name: 'Applications and Integration', weight: 33.1 },
  { name: 'Model Selection and Optimization', weight: 16.8 },
  { name: 'Agents and Workflows', weight: 14.7 },
  { name: 'Prompt and Context Engineering', weight: 11.0 },
  { name: 'Tools and MCPs', weight: 10.6 },
  { name: 'Security and Safety', weight: 8.1 },
  { name: 'Claude Code', weight: 3.1 },
  { name: 'Eval, Testing, and Debugging', weight: 2.6 },
] as const

export type DomainName = (typeof DOMAINS)[number]['name']
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E'

export interface Question {
  id: string
  source: string // practice | mock-1..3 | guide | ai
  domain: DomainName
  question: string
  options: Partial<Record<Letter, string>>
  answer: Letter[]
  rationale: string
  dupGroup?: string
  evidence?: string
}

/** Largest-remainder split of `total` items across the domain weights. */
export function domainQuotas(total: number): Record<string, number> {
  const raw = DOMAINS.map((d) => ({ name: d.name, exact: (d.weight / 100) * total }))
  const out: Record<string, number> = {}
  let used = 0
  for (const r of raw) { out[r.name] = Math.floor(r.exact); used += out[r.name] }
  raw
    .sort((a, b) => (b.exact % 1) - (a.exact % 1))
    .slice(0, total - used)
    .forEach((r) => { out[r.name]++ })
  return out
}

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
