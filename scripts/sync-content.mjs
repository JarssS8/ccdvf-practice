// Imports the study material from the parent repo into static JSON bundled with the app.
// Run after `git pull` in the repo: `npm run sync`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { run as checkTranslations } from './i18n.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const out = join(here, '..', 'src', 'content')
const EXAM = 'developer-foundations'
const DOMAINS = [
  'Applications and Integration', 'Model Selection and Optimization', 'Agents and Workflows',
  'Prompt and Context Engineering', 'Tools and MCPs', 'Security and Safety', 'Claude Code',
  'Eval, Testing, and Debugging',
]
mkdirSync(out, { recursive: true })
if (!existsSync(join(repo, 'question-bank.json'))) {
  console.warn('  ! study repo not found next to this folder: keeping the content already in src/content')
  checkTranslations('check')
  process.exit(0)
}

const read = (p) => readFileSync(join(repo, p), 'utf8')
const warn = (m) => console.warn('  ! ' + m)

// Questions: repo bank + the exam guide's three samples
const bank = JSON.parse(read('question-bank.json'))
const samples = JSON.parse(readFileSync(join(here, 'guide-samples.json'), 'utf8'))
const questions = [...bank.questions.filter((q) => q.exam === EXAM), ...samples].map((q) => ({
  id: q.id,
  source: q.source,
  domain: q.domain,
  question: q.question,
  options: q.options,
  answer: (Array.isArray(q.answer) ? q.answer.join('') : String(q.answer)).replace(/[^A-E]/g, '').split(''),
  rationale: q.rationale,
}))

for (const q of questions) {
  if (!DOMAINS.includes(q.domain)) warn(`${q.id}: unknown domain "${q.domain}"`)
  if (!q.answer.length || q.answer.some((l) => !q.options[l])) warn(`${q.id}: answer not among options`)
}

// Near-duplicates (same scenario reworded): token Jaccard on the stem
const tokens = (s) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
const jaccard = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i) }
const toks = questions.map((q) => tokens(q.question + ' ' + q.options[q.answer[0]]))
const parent = questions.map((_, i) => i)
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
let dups = 0
for (let i = 0; i < questions.length; i++)
  for (let j = i + 1; j < questions.length; j++)
    if (jaccard(toks[i], toks[j]) >= 0.33) { parent[find(j)] = find(i); dups++ }
const groups = {}
questions.forEach((q, i) => (groups[find(i)] ??= []).push(q.id))
for (const ids of Object.values(groups)) {
  if (ids.length < 2) continue
  for (const q of questions) if (ids.includes(q.id)) q.dupGroup = ids[0]
}

// A full mock must be fillable once with fresh questions per domain
const items = 53
const pool = Object.fromEntries(DOMAINS.map((d) => [d, new Set(questions.filter((q) => q.domain === d).map((q) => q.dupGroup ?? q.id)).size]))
const weights = [33.1, 16.8, 14.7, 11.0, 10.6, 8.1, 3.1, 2.6]
DOMAINS.forEach((d, i) => {
  const need = Math.round((weights[i] / 100) * items)
  if (pool[d] < need) warn(`${d}: ${pool[d]} distinct questions, a full mock wants ~${need} (filled from other domains or AI)`)
})

// Flashcards: developer-specific plus the shared deck
const flashcards = read('flashcards.tsv')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [front, back, tags = ''] = line.split('\t')
    const [kind, scope] = tags.trim().split(/\s+/)
    return [front, back, kind, scope]
  })
  .filter(([, , , scope]) => scope === EXAM || scope === 'shared')
  .map(([front, back, kind, scope]) => ({
    id: 'fc-' + createHash('sha1').update(front).digest('hex').slice(0, 10),
    front, back, kind, scope,
  }))

// Program news: "### Month: title" entries under year headings
const news = []
let year = ''
let cur = null
for (const line of read('guide/program-changes.md').split('\n')) {
  const y = line.match(/^## (\d{4})/)
  if (y) { year = y[1]; continue }
  const h = line.match(/^### (.+)$/)
  if (h) {
    cur = { year, title: h[1].trim(), body: '' }
    news.push(cur)
    continue
  }
  if (line.startsWith('---') || line.startsWith('Facts last verified')) cur = null
  else if (cur) cur.body += line + '\n'
}
for (const n of news) n.body = n.body.trim()

// Study notes as markdown, minus images
const md = (p) => read(p).replace(/^.*!\[.*$\n?/gm, '')
const notes = { cheatSheet: md(`${EXAM}/cheat-sheet.md`), notes: md(`${EXAM}/notes.md`) }

// Blueprint text per domain from the exam guide PDF (needs poppler's pdftotext; keeps the last copy otherwise)
let blueprint = {}
try {
  const text = execFileSync('pdftotext', [join(repo, EXAM, 'exam-guide.pdf'), '-'], { encoding: 'utf8' })
  const body = text.slice(text.indexOf('Domain 1:'), text.indexOf('7. How to Prepare'))
    .split('\n').filter((l) => l.trim() && !/^(Claude Certification Program|Exam guide)$/.test(l.trim()))
  let cur = null
  for (const line of body) {
    const m = line.match(/^Domain \d+: (.+?) \([\d.]+%\)$/)
    if (m) { cur = m[1]; blueprint[cur] = ''; continue }
    if (cur) blueprint[cur] += (/^[A-Z][^.]*\([\d.]+%\)$/.test(line) ? '\n- ' : ' ') + line.trim()
  }
  for (const d of DOMAINS) if (!blueprint[d]) warn(`blueprint missing for ${d}`)
} catch {
  warn('pdftotext unavailable: keeping the previous blueprint.json')
  try { blueprint = JSON.parse(readFileSync(join(out, 'blueprint.json'), 'utf8')) } catch { /* none yet */ }
}

const verified =(read(`${EXAM}/README.md`).match(/last verified against the official sources on (\d{4}-\d{2}-\d{2})/) || [])[1] ?? null

const write = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 1) + '\n')
write('questions.json', questions)
write('flashcards.json', flashcards)
write('news.json', news.slice(0, 12))
write('notes.json', notes)
write('blueprint.json', blueprint)
write('meta.json', {
  exam: EXAM,
  syncedAt: new Date().toISOString(),
  factsVerified: verified,
  counts: { questions: questions.length, flashcards: flashcards.length, distinct: pool },
})

console.log(`questions ${questions.length} (${dups} near-duplicate pairs) · flashcards ${flashcards.length} · news ${news.length} · facts verified ${verified}`)
checkTranslations('check')
