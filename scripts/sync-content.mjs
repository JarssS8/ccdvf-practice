// Imports the study material from the parent repo into static JSON bundled with the app, one folder per certification.
// Run after `git pull` in the repo: `npm run sync` (all certifications) or `npm run sync -- <cert-id>`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { CERTS, domainQuotas } from '../src/shared/certs.ts'
import { run as checkTranslations } from './i18n.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const out = join(here, '..', 'src', 'content')
mkdirSync(out, { recursive: true })
if (!existsSync(join(repo, 'question-bank.json'))) {
  console.warn('  ! study repo not found next to this folder: keeping the content already in src/content')
  checkTranslations('check')
  process.exit(0)
}

const only = process.argv[2]
const read = (p) => readFileSync(join(repo, p), 'utf8')
const bank = JSON.parse(read('question-bank.json'))
const tsv = read('flashcards.tsv').split('\n').filter(Boolean).map((line) => {
  const [front, back, tags = ''] = line.split('\t')
  const [kind, scope] = tags.trim().split(/\s+/)
  return { front, back, kind, scope }
})
const write = (p, data) => { mkdirSync(dirname(join(out, p)), { recursive: true }); writeFileSync(join(out, p), JSON.stringify(data, null, 1) + '\n') }

// Near-duplicates (same scenario reworded): token Jaccard on the stem
const tokens = (s) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
const jaccard = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i) }

/** Task statements per domain, from the exam guide PDF (needs poppler's pdftotext; keeps the last copy otherwise). */
function blueprintOf(cert, warn) {
  const text = execFileSync('pdftotext', [join(repo, cert.id, 'exam-guide.pdf'), '-'], { encoding: 'utf8' })
  const body = text.slice(text.indexOf('Domain 1:'), text.indexOf('7. How to Prepare'))
    .split('\n').filter((l) => l.trim() && !/^(Claude Certification Program|Exam guide)$/.test(l.trim()))
  const bp = {}
  let cur = null
  if (cert.id === 'developer-foundations') {
    // Headings carry the weight and every task statement ends in its own weight
    for (const line of body) {
      const m = line.match(/^Domain \d+: (.+?) \([\d.]+%\)$/)
      if (m) { cur = m[1]; bp[cur] = ''; continue }
      if (cur) bp[cur] += (/^[A-Z][^.]*\([\d.]+%\)$/.test(line) ? '\n- ' : ' ') + line.trim()
    }
  } else {
    // Bulleted task statements under "Domain N: Name (x%)" (the weight is missing in some guides); a numbered section ends the list
    for (const line of body) {
      const m = line.match(/^Domain \d+: (.+?)(?: \([\d.]+%\))?$/)
      if (m) { cur = cert.domains.find((d) => d.name === m[1].trim())?.name ?? null; if (!cur) warn(`blueprint heading not in the registry: ${m[1]}`); else bp[cur] = ''; continue }
      if (/^\d+\.\s+[A-Z]/.test(line.trim())) { cur = null; continue }
      if (cur) bp[cur] += (/^[•●▪-]\s*/.test(line.trim()) ? '\n- ' + line.trim().replace(/^[•●▪-]\s*/, '') : ' ' + line.trim())
    }
    for (const k of Object.keys(bp)) bp[k] = '\n' + bp[k].trim().replace(/[ \t]+/g, ' ').slice(0, 6000)
  }
  for (const d of cert.domains) if (!bp[d.name]) warn(`blueprint missing for ${d.name}`)
  return bp
}

for (const cert of CERTS) {
  if (only && only !== cert.id) continue
  const warn = (m) => console.warn(`  ! ${cert.code} ${m}`)
  const names = cert.domains.map((d) => d.name)

  // Questions: repo bank + the exam guide's sample questions
  const samplesFile = join(here, 'guide-samples', `${cert.id}.json`)
  const samples = existsSync(samplesFile) ? JSON.parse(readFileSync(samplesFile, 'utf8')) : []
  const questions = [...bank.questions.filter((q) => q.exam === cert.id), ...samples].map((q) => ({
    id: q.id,
    cert: cert.id,
    source: q.source,
    domain: q.domain,
    question: q.question,
    options: q.options,
    answer: (Array.isArray(q.answer) ? q.answer.join('') : String(q.answer)).replace(/[^A-E]/g, '').split(''),
    rationale: q.rationale,
  }))
  for (const q of questions) {
    if (!names.includes(q.domain)) warn(`${q.id}: unknown domain "${q.domain}"`)
    if (!q.answer.length || q.answer.some((l) => !q.options[l])) warn(`${q.id}: answer not among options`)
  }

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
  const pool = Object.fromEntries(names.map((d) => [d, new Set(questions.filter((q) => q.domain === d).map((q) => q.dupGroup ?? q.id)).size]))
  const quotas = domainQuotas(cert, cert.items)
  for (const d of names) if (pool[d] < quotas[d]) warn(`${d}: ${pool[d]} distinct questions, a full mock wants ${quotas[d]} (filled from other domains or AI)`)

  // Flashcards: this certification's plus the shared deck
  const flashcards = tsv.filter((c) => c.scope === cert.id || c.scope === 'shared').map(({ front, back, kind, scope }) => ({
    id: 'fc-' + createHash('sha1').update(front).digest('hex').slice(0, 10),
    front, back, kind, scope,
  }))

  // Study notes as markdown, minus images
  const md = (p) => read(p).replace(/^.*!\[.*$\n?/gm, '')
  const notes = { cheatSheet: md(`${cert.id}/cheat-sheet.md`), notes: md(`${cert.id}/notes.md`) }

  let blueprint = {}
  try { blueprint = blueprintOf(cert, warn) } catch {
    warn('pdftotext unavailable: keeping the previous blueprint.json')
    try { blueprint = JSON.parse(readFileSync(join(out, cert.id, 'blueprint.json'), 'utf8')) } catch { /* none yet */ }
  }

  const verified = (read(`${cert.id}/README.md`).match(/last verified against the official sources on (\d{4}-\d{2}-\d{2})/) || [])[1] ?? null

  write(`${cert.id}/questions.json`, questions)
  write(`${cert.id}/flashcards.json`, flashcards)
  write(`${cert.id}/notes.json`, notes)
  write(`${cert.id}/blueprint.json`, blueprint)
  write(`${cert.id}/meta.json`, {
    exam: cert.id,
    syncedAt: new Date().toISOString(),
    factsVerified: verified,
    counts: { questions: questions.length, flashcards: flashcards.length, guide: samples.length, distinct: pool },
  })
  console.log(`${cert.code}: questions ${questions.length} (${dups} near-duplicate pairs, ${samples.length} from the guide) · flashcards ${flashcards.length} · facts verified ${verified}`)
}

// Program news: "### Month: title" entries under year headings (common to every certification)
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
if (!only) write('news.json', news.slice(0, 12))

checkTranslations('check')
