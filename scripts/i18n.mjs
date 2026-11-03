// Spanish content: only text, keyed like the English source, plus `src`, the hash of the English text it was translated
// from. The app falls back to English when they differ. Each certification keeps its own in src/content/<cert>/es/
// (questions and flashcards by id, the shared cards in every deck; notes); news and the guide pages in src/content/es/.
//   node scripts/i18n.mjs check   report missing, stale and malformed translations (never fails the build)
//   node scripts/i18n.mjs stamp   mark entries without `src` as translated from the current English text
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { questionHash, textHash } from '../src/shared/exam.ts'
import { CERTS } from '../src/shared/certs.ts'
import { guideEntries } from '../src/shared/guide.ts'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content')
const read = (p) => JSON.parse(readFileSync(join(dir, p), 'utf8'))
const write = (p, d) => writeFileSync(join(dir, p), JSON.stringify(d, null, 1) + '\n')

export const cardHash = (c) => textHash(c.front + '\n' + c.back)
export const newsKey = (n) => textHash(n.title)
export const newsHash = (n) => textHash(n.title + '\n' + n.body)

const fences = (s) => (s.match(/```/g) ?? []).length
const rows = (s) => (s.match(/^\|/gm) ?? []).length

export function run(mode) {
  const stamp = mode === 'stamp'
  const issues = []
  const byCert = {}
  let fresh = 0, stale = 0, missing = 0
  const tally = (cert, kind) => {
    const c = (byCert[cert] ??= { fresh: 0, stale: 0, missing: 0 })
    c[kind]++
    if (kind === 'fresh') fresh++
    else if (kind === 'stale') stale++
    else missing++
  }

  for (const cert of CERTS) {
    if (!existsSync(join(dir, cert.id, 'questions.json'))) continue
    const esFile = (name, empty) => (existsSync(join(dir, cert.id, 'es', name)) ? read(`${cert.id}/es/${name}`) : empty)
    const qes = esFile('questions.json', {}), fes = esFile('flashcards.json', {}), nes = esFile('notes.json', {})
    for (const x of read(`${cert.id}/questions.json`)) {
      const t = qes[x.id]
      if (!t) { tally(cert.id, 'missing'); continue }
      if (Object.keys(t.options ?? {}).sort().join() !== Object.keys(x.options).sort().join()) issues.push(`${x.id}: option letters differ`)
      if (stamp && !t.src) t.src = questionHash(x)
      tally(cert.id, t.src === questionHash(x) ? 'fresh' : 'stale')
    }

    for (const x of read(`${cert.id}/flashcards.json`)) {
      const t = fes[x.id]
      if (!t) { tally(cert.id, 'missing'); continue }
      if (stamp && !t.src) t.src = cardHash(x)
      tally(cert.id, t.src === cardHash(x) ? 'fresh' : 'stale')
    }

    const n = read(`${cert.id}/notes.json`)
    for (const k of ['cheatSheet', 'notes']) {
      const t = nes[k]
      if (!t) { tally(cert.id, 'missing'); continue }
      if (fences(t.text) !== fences(n[k]) || rows(t.text) !== rows(n[k])) issues.push(`${cert.id} notes.${k}: code fences or table rows differ`)
      if (stamp && !t.src) t.src = textHash(n[k])
      tally(cert.id, t.src === textHash(n[k]) ? 'fresh' : 'stale')
    }
    if (stamp) { write(`${cert.id}/es/questions.json`, qes); write(`${cert.id}/es/flashcards.json`, fes); write(`${cert.id}/es/notes.json`, nes) }
  }

  const w = read('news.json'), wes = read('es/news.json')
  for (const x of w) {
    const t = wes[newsKey(x)]
    if (!t) { tally('news', 'missing'); continue }
    if (stamp && !t.src) t.src = newsHash(x)
    tally('news', t.src === newsHash(x) ? 'fresh' : 'stale')
  }

  // Study guide pages: confusable pairs, course and video summaries, study plan
  const ges = existsSync(join(dir, 'es/guide.json')) ? read('es/guide.json') : {}
  if (existsSync(join(dir, 'guide.json'))) {
    for (const [key, en] of guideEntries(read('guide.json'))) {
      const t = Object.hasOwn(ges, key) ? ges[key] : undefined
      if (!t) { tally('guide', 'missing'); continue }
      if (key.endsWith(':body') && (fences(t.text) !== fences(en) || rows(t.text) !== rows(en))) issues.push(`guide ${key}: code fences or table rows differ`)
      if (stamp && !t.src) t.src = textHash(en)
      tally('guide', t.src === textHash(en) ? 'fresh' : 'stale')
    }
  }

  if (stamp) { write('es/news.json', wes); write('es/guide.json', ges) }
  for (const i of issues) console.warn('  ! ' + i)
  console.log(`es translations: ${fresh} current · ${stale} stale (shown in English) · ${missing} missing`)
  for (const [c, x] of Object.entries(byCert)) if (x.stale || x.missing) console.log(`  ${c}: ${x.fresh} current · ${x.stale} stale · ${x.missing} missing`)
  return { fresh, stale, missing, issues, byCert }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run(process.argv[2] ?? 'check')
