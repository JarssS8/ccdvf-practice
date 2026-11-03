// The four certifications, from each <cert>/exam-guide.pdf (v1.0). Shared by the app, the Worker and the scripts.
// `id` is the folder name in the study repo and the `exam` field of its question bank.

export interface Domain { name: string; weight: number }
export interface CertDef {
  id: string
  code: string
  name: string
  short: string
  items: number
  minutes: number
  /** Pastel from the app's palette that marks the certification in the switcher. */
  tint: string
  initials: string
  domains: readonly Domain[]
}

/** Every exam reports a scaled score on the same range with the same cut. */
export const SCALE = { min: 100, max: 1000, pass: 720 } as const

export const CERTS: readonly CertDef[] = [
  {
    id: 'associate-foundations', code: 'CCAO-F', name: 'Claude Certified Associate – Foundations', short: 'Associate – Foundations',
    items: 60, minutes: 120, tint: '#FFE9A8', initials: 'AO',
    domains: [
      { name: 'Output Evaluation and Validation', weight: 21 },
      { name: 'Workflow Integration and Solution Design', weight: 16 },
      { name: 'Governance, Risk, and Responsible Use', weight: 15 },
      { name: 'Prompting and Task Execution', weight: 14 },
      { name: 'Product and Model Selection', weight: 12 },
      { name: 'Configuration and Knowledge Management', weight: 12 },
      { name: 'Troubleshooting and Optimization', weight: 10 },
    ],
  },
  {
    id: 'developer-foundations', code: 'CCDV-F', name: 'Claude Certified Developer – Foundations', short: 'Developer – Foundations',
    items: 53, minutes: 120, tint: '#CDEB52', initials: 'DV',
    domains: [
      { name: 'Applications and Integration', weight: 33.1 },
      { name: 'Model Selection and Optimization', weight: 16.8 },
      { name: 'Agents and Workflows', weight: 14.7 },
      { name: 'Prompt and Context Engineering', weight: 11.0 },
      { name: 'Tools and MCPs', weight: 10.6 },
      { name: 'Security and Safety', weight: 8.1 },
      { name: 'Claude Code', weight: 3.1 },
      { name: 'Eval, Testing, and Debugging', weight: 2.6 },
    ],
  },
  {
    id: 'architect-foundations', code: 'CCAR-F', name: 'Claude Certified Architect – Foundations', short: 'Architect – Foundations',
    items: 60, minutes: 120, tint: '#D9D0FF', initials: 'AF',
    domains: [
      { name: 'Agentic Architecture & Orchestration', weight: 27 },
      { name: 'Claude Code Configuration & Workflows', weight: 20 },
      { name: 'Prompt Engineering & Structured Output', weight: 20 },
      { name: 'Tool Design & MCP Integration', weight: 18 },
      { name: 'Context Management & Reliability', weight: 15 },
    ],
  },
  {
    id: 'architect-professional', code: 'CCAR-P', name: 'Claude Certified Architect – Professional', short: 'Architect – Professional',
    items: 63, minutes: 120, tint: '#FFC9D6', initials: 'AP',
    domains: [
      { name: 'Integration', weight: 19 },
      { name: 'Solution Design & Architecture', weight: 17 },
      { name: 'Evaluation, Testing & Optimization', weight: 16 },
      { name: 'Governance, Safety & Risk Management', weight: 14 },
      { name: 'Stakeholder Communication & Lifecycle Management', weight: 14 },
      { name: 'Claude Models, Prompting & Context Engineering', weight: 13 },
      { name: 'Developer Productivity & Operational Enablement', weight: 7 },
    ],
  },
]

/** The only certification the app knew before; everything stored without a certification belongs to it. */
export const DEFAULT_CERT = 'developer-foundations'

const byId = new Map(CERTS.map((c) => [c.id, c]))
const byDomain = new Map(CERTS.flatMap((c) => c.domains.map((d) => [d.name, c.id] as const)))

/** Ids arrive from users and storage: a Map lookup never resolves `__proto__` or `constructor`. */
export const isCertId = (id: unknown): id is string => typeof id === 'string' && byId.has(id)
export const certById = (id: string | null | undefined): CertDef => byId.get(id ?? '') ?? byId.get(DEFAULT_CERT)!
/** Domain names are unique across the four exams, so a domain names its certification. */
export const certOfDomain = (domain: string | null | undefined) => byDomain.get(domain ?? '')
export const certOfQuestion = (q: { cert?: string; domain: string }) => (isCertId(q.cert) ? q.cert : certOfDomain(q.domain) ?? DEFAULT_CERT)
export const certOfAttempt = (a: { cert?: string }) => (isCertId(a.cert) ? a.cert : DEFAULT_CERT)
export const hasDomain = (cert: CertDef, domain: unknown) => typeof domain === 'string' && cert.domains.some((d) => d.name === domain)

/** Exam date per certification. Developer keeps the key it always had, so existing dates stay put. */
export const examDateKey = (cert: string) => (cert === DEFAULT_CERT ? 'exam_date' : `exam_date:${cert}`)
export const certOfExamDateKey = (key: string) => (key === 'exam_date' ? DEFAULT_CERT : key.startsWith('exam_date:') && isCertId(key.slice(10)) && key.slice(10) !== DEFAULT_CERT ? key.slice(10) : null)

/** Largest-remainder split of `total` items across the certification's domain weights. */
export function domainQuotas(cert: CertDef, total: number): Record<string, number> {
  const raw = cert.domains.map((d) => ({ name: d.name, exact: (d.weight / 100) * total }))
  const out: Record<string, number> = {}
  let used = 0
  for (const r of raw) { out[r.name] = Math.floor(r.exact); used += out[r.name] }
  raw
    .sort((a, b) => (b.exact % 1) - (a.exact % 1))
    .slice(0, total - used)
    .forEach((r) => { out[r.name]++ })
  return out
}

/** The quick mock keeps the real exam's pace: 15 items in the time the real exam gives 15. */
export const quickMinutes = (cert: CertDef) => Math.round((15 * cert.minutes) / cert.items)
