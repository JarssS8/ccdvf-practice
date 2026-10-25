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
