// Imports the study material from the parent repo into static JSON bundled with the app, one folder per certification.
// Run after `git pull` in the repo: `npm run sync` (all certifications) or `npm run sync -- <cert-id>`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { CERTS, domainQuotas } from '../src/shared/certs.ts'
import { upstreamHash } from '../src/shared/exam.ts'
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
// Which certifications serve the rewritten, calibrated bank (scripts/calibrated-bank.json); the rest serve the study repo's questions as they are
const flags = existsSync(join(here, 'calibrated-bank.json')) ? JSON.parse(readFileSync(join(here, 'calibrated-bank.json'), 'utf8')) : {}
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

  // Questions: repo bank + the exam guide's sample questions + the app's own items: written for thin domains (source "app")
  // or as the calibrated bank (source "curated")
  const local = (dir) => { const f = join(here, dir, `${cert.id}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [] }
  const calibratedBank = flags[cert.id] === true
  const samples = local('guide-samples')
  // Curated items belong to the calibrated bank; items written by the app for thin domains (source "app") are always served
  const extra = local('extra-questions').filter((q) => calibratedBank || q.source !== 'curated')
  const keyOf = (q) => (Array.isArray(q.answer) ? q.answer.join('') : String(q.answer)).replace(/[^A-E]/g, '').split('')
  const shape = (q) => ({
    id: q.id,
    cert: cert.id,
    source: q.source,
    domain: q.domain,
    question: q.question,
    options: q.options,
    answer: keyOf(q),
    rationale: q.rationale,
    ...(q.evidence ? { evidence: q.evidence } : {}),
    ...(calibratedBank && q.ref ? { ref: q.ref } : {}),
    ...(calibratedBank && q.calibrated ? { calibrated: q.calibrated } : {}),
  })
  const upstream = [...bank.questions.filter((q) => q.exam === cert.id), ...samples, ...extra].map(shape)

  // Rewrites of upstream questions without their answer-pattern cues (scripts/question-overrides/): same id and key, new wording.
  // Each one names the upstream text it rewrote; when upstream moves, the question falls back to it, uncalibrated.
  const overrides = calibratedBank ? local('question-overrides') : {}
  const questions = upstream.map((q) => {
    if (!Object.hasOwn(overrides, q.id)) return q
    const o = overrides[q.id]
    if (o.src !== upstreamHash(q)) { warn(`${q.id}: upstream changed, re-review its override in scripts/question-overrides/`); return q }
    return { ...q, question: o.question, options: o.options, rationale: o.rationale, ...(o.evidence ? { evidence: o.evidence } : {}), ref: o.ref, calibrated: o.calibrated }
  })
  for (const id of Object.keys(overrides)) if (!upstream.some((q) => q.id === id)) warn(`${id}: override for a question that no longer exists`)
  for (const q of questions) {
    if (!names.includes(q.domain)) warn(`${q.id}: unknown domain "${q.domain}"`)
    if (!q.answer.length || q.answer.some((l) => !q.options[l])) warn(`${q.id}: answer not among options`)
  }

  // Clusters use the upstream wording, so rewriting a question never regroups what was already seen.
  // App-written and curated items stay out of them: a shared group would let them hide behind a question already seen.
  const own = (q) => q.source === 'app' || q.source === 'curated'
  const toks = upstream.map((q) => tokens(q.question + ' ' + q.options[q.answer[0]]))
  const parent = questions.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  let dups = 0
  for (let i = 0; i < questions.length; i++)
    for (let j = i + 1; j < questions.length; j++) {
      if (jaccard(toks[i], toks[j]) < 0.33) continue
      if (own(questions[i]) || own(questions[j])) { warn(`${questions[j].id} is too close to ${questions[i].id}: rewrite the ${questions[j].source} item`); continue }
      parent[find(j)] = find(i); dups++
    }
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
  // syncedAt only moves when the imported content does, so an unchanged daily sync leaves no diff
  const contentHash = createHash('sha1').update(JSON.stringify([questions, flashcards, notes, blueprint, verified])).digest('hex').slice(0, 12)
  let previous = null
  try { previous = JSON.parse(readFileSync(join(out, cert.id, 'meta.json'), 'utf8')) } catch { /* first sync */ }
  write(`${cert.id}/meta.json`, {
    exam: cert.id,
    syncedAt: previous?.contentHash === contentHash ? previous.syncedAt : new Date().toISOString(),
    contentHash,
    factsVerified: verified,
    counts: { questions: questions.length, flashcards: flashcards.length, guide: samples.length, app: extra.filter((q) => q.source === 'app').length, ...(calibratedBank ? { curated: extra.filter((q) => q.source === 'curated').length, calibrated: questions.filter((q) => q.calibrated).length } : {}), distinct: pool },
  })
  console.log(`${cert.code}: questions ${questions.length} (${dups} near-duplicate pairs, ${samples.length} from the guide, ${extra.filter((q) => q.source === 'app').length} written by the app${calibratedBank ? `, ${extra.filter((q) => q.source === 'curated').length} curated, ${questions.filter((q) => q.calibrated).length} calibrated` : ', calibrated bank off'}) · flashcards ${flashcards.length} · facts verified ${verified}`)
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

// ---------- study guide pages: confusable pairs, courses, study plan, official videos ----------

const map = JSON.parse(readFileSync(join(here, 'course-map.json'), 'utf8'))
const gwarn = (m) => console.warn('  ! guide ' + m)
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** Markdown fit for the app: no diagrams, images, alert markers or horizontal rules. */
const clean = (s) => s
  .replace(/```mermaid[\s\S]*?```\n?/g, '')
  .replace(/^.*!\[.*$\n?/gm, '')
  .replace(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n/gm, '')
  .replace(/^---+\s*$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
/** `## Heading` sections of a page, in order. */
const sections = (text, level = '## ') => {
  const out = []
  let cur = null
  for (const line of text.split('\n')) {
    if (line.startsWith(level)) { cur = { title: line.slice(level.length).trim(), body: '' }; out.push(cur); continue }
    if (cur) cur.body += line + '\n'
  }
  return out
}
const certsOf = (table, key, what) => {
  if (!Object.hasOwn(map[table], key)) { gwarn(`${what} "${key}" is not in scripts/course-map.json`); return [] }
  return map[table][key]
}
const byShort = (name) => CERTS.find((c) => c.short === name.trim())?.id

const confusions = sections(read('guide/confusions.md'))
  .filter((s) => !/^where to go next/i.test(s.title))
  .map((s) => ({ id: slug(s.title), title: s.title, body: clean(s.body) }))

const courses = []
for (const s of sections(read('guide/courses.md'))) {
  for (const row of s.body.split('\n')) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim())
    const url = cells[2]?.match(/\((https:\/\/academy\.claude\.com\/[^)]+)\)/)?.[1]
    if (cells.length < 3 || !url) continue
    courses.push({ id: slug(cells[0]), title: cells[0], summary: cells[1], url, section: s.title, certs: certsOf('courses', cells[0], 'course') })
  }
}
for (const x of JSON.parse(readFileSync(join(here, 'extra-courses.json'), 'utf8'))) {
  if (courses.some((c) => c.url === x.url)) { gwarn(`extra course now listed upstream, remove it from scripts/extra-courses.json: ${x.title}`); continue }
  courses.push({ id: slug(x.title), title: x.title, summary: x.summary, url: x.url, section: x.section, certs: certsOf('courses', x.title, 'course'), extra: true })
}
if (courses.length < 25) gwarn(`only ${courses.length} courses parsed from guide/courses.md`)

const prepPaths = {}
for (const row of read('guide/learning-paths.md').split('\n')) {
  const m = row.match(/^\| ([^|]+?) \| \[[^\]]+\]\((https:\/\/anthropic-partners\.skilljar\.com\/[^)]+)\)/)
  const id = m && byShort(m[1])
  if (id) prepPaths[id] = m[2]
}
for (const c of CERTS) if (!prepPaths[c.id]) gwarn(`no official prep path for ${c.code}`)

const strategyText = read('guide/study-strategy.md')
const part = (title) => sections(strategyText).find((s) => s.title.toLowerCase().startsWith(title))?.body ?? ''
const emphasis = {}
// By link target (../<cert>/README.md), not by the display name
for (const m of part('per-certification emphasis').matchAll(/^\*\*\[[^\]]+\]\(\.\.\/([a-z-]+)\/README\.md\)\.\*\* (.+)$/gm)) {
  if (CERTS.some((c) => c.id === m[1])) emphasis[m[1]] = m[2].trim()
}
for (const c of CERTS) if (!emphasis[c.id]) gwarn(`no study emphasis for ${c.code}`)
const bullets = (body, re = /^- (?:\[ \] )?(.+)$/gm) => [...body.matchAll(re)].map((m) => m[1].trim())
const weeks = bullets(part('a sensible three-week shape'), /^- \*\*([^*]+?)\.\*\* (.+)$/gm).length
  ? [...part('a sensible three-week shape').matchAll(/^- \*\*([^*]+?)\.\*\* (.+)$/gm)].map((m) => ({ title: m[1].trim(), body: m[2].trim() }))
  : []
if (weeks.length !== 3) gwarn(`expected 3 study weeks, found ${weeks.length}`)
const strategy = { emphasis, weeks, examWeek: bullets(part('exam week checklist')), during: bullets(part('during the exam')) }
if (!strategy.examWeek.length || !strategy.during.length) gwarn('exam-week checklist or exam tips not found')

const videos = []
for (const s of sections(read('guide/videos.md'))) {
  if (/playlist/i.test(s.title)) continue
  const certs = certsOf('videos', s.title, 'video section')
  for (const v of sections(s.body, '### ')) {
    const url = v.body.match(/\]\((https:\/\/www\.youtube\.com\/watch\?v=[\w-]+)\)/)?.[1]
    if (!url) continue
    const summary = v.body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('[![') && !l.startsWith('!['))
    videos.push({ id: slug(v.title), section: s.title, title: v.title, ...(summary ? { summary } : {}), url, certs })
  }
}
if (videos.length < 10) gwarn(`only ${videos.length} videos parsed from guide/videos.md`)

if (!only) write('guide.json', { confusions, courses, prepPaths, strategy, videos })
console.log(`guide: ${confusions.length} confusable pairs · ${courses.length} courses · ${videos.length} videos · ${strategy.examWeek.length} exam-week checks`)

checkTranslations('check')
