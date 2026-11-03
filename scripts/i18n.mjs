// Spanish content: only text, keyed like the English source, plus `src`, the hash of the English text it was translated
// from. The app falls back to English when they differ. Each certification keeps its own in src/content/<cert>/es/
// (questions and flashcards by id, the shared cards in every deck; notes); news and the guide pages in src/content/es/.
//   node scripts/i18n.mjs check   report missing, stale and malformed translations (never fails the build)
//   node scripts/i18n.mjs stamp   mark entries without `src` as translated from the current English text
//   node scripts/i18n.mjs list    one line per missing or stale entry: what to translate, where it goes, where the English is
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
  const todo = []
  /** `file`/`key`: where the Spanish goes; `en`: where its English source is. */
  const tally = (cert, kind, file, key, en) => {
    if (kind !== 'fresh') todo.push({ kind, file: `src/content/${file}`, key, en: `src/content/${en}` })
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
      const at = [cert.id, `${cert.id}/es/questions.json`, x.id, `${cert.id}/questions.json`]
      const t = qes[x.id]
      if (!t) { tally(at[0], 'missing', ...at.slice(1)); continue }
      if (Object.keys(t.options ?? {}).sort().join() !== Object.keys(x.options).sort().join()) issues.push(`${x.id}: option letters differ`)
      if (stamp && !t.src) t.src = questionHash(x)
      tally(at[0], t.src === questionHash(x) ? 'fresh' : 'stale', ...at.slice(1))
    }

    for (const x of read(`${cert.id}/flashcards.json`)) {
      const at = [cert.id, `${cert.id}/es/flashcards.json`, x.id, `${cert.id}/flashcards.json`]
      const t = fes[x.id]
      if (!t) { tally(at[0], 'missing', ...at.slice(1)); continue }
      if (stamp && !t.src) t.src = cardHash(x)
      tally(at[0], t.src === cardHash(x) ? 'fresh' : 'stale', ...at.slice(1))
    }

    const n = read(`${cert.id}/notes.json`)
    for (const k of ['cheatSheet', 'notes']) {
      const at = [cert.id, `${cert.id}/es/notes.json`, k, `${cert.id}/notes.json`]
      const t = nes[k]
      if (!t) { tally(at[0], 'missing', ...at.slice(1)); continue }
      if (fences(t.text) !== fences(n[k]) || rows(t.text) !== rows(n[k])) issues.push(`${cert.id} notes.${k}: code fences or table rows differ`)
      if (stamp && !t.src) t.src = textHash(n[k])
      tally(at[0], t.src === textHash(n[k]) ? 'fresh' : 'stale', ...at.slice(1))
    }
    if (stamp) { write(`${cert.id}/es/questions.json`, qes); write(`${cert.id}/es/flashcards.json`, fes); write(`${cert.id}/es/notes.json`, nes) }
  }

  const w = read('news.json'), wes = read('es/news.json')
  for (const x of w) {
    const at = ['news', 'es/news.json', newsKey(x), `news.json (title "${x.title}")`]
    const t = wes[newsKey(x)]
    if (!t) { tally(at[0], 'missing', ...at.slice(1)); continue }
    if (stamp && !t.src) t.src = newsHash(x)
    tally(at[0], t.src === newsHash(x) ? 'fresh' : 'stale', ...at.slice(1))
  }

  // Study guide pages: confusable pairs, course and video summaries, study plan
  const ges = existsSync(join(dir, 'es/guide.json')) ? read('es/guide.json') : {}
  if (existsSync(join(dir, 'guide.json'))) {
    for (const [key, en] of guideEntries(read('guide.json'))) {
      const at = ['guide', 'es/guide.json', key, 'guide.json (see guideEntries in src/shared/guide.ts)']
      const t = Object.hasOwn(ges, key) ? ges[key] : undefined
      if (!t) { tally(at[0], 'missing', ...at.slice(1)); continue }
      if (key.endsWith(':body') && (fences(t.text) !== fences(en) || rows(t.text) !== rows(en))) issues.push(`guide ${key}: code fences or table rows differ`)
      if (stamp && !t.src) t.src = textHash(en)
      tally(at[0], t.src === textHash(en) ? 'fresh' : 'stale', ...at.slice(1))
    }
  }

  if (stamp) { write('es/news.json', wes); write('es/guide.json', ges) }
  if (mode === 'list') for (const x of todo) console.log(`${x.kind}\t${x.file}\t${x.key}\t(English: ${x.en})`)
  for (const i of issues) console.warn('  ! ' + i)
  console.log(`es translations: ${fresh} current · ${stale} stale (shown in English) · ${missing} missing`)
  for (const [c, x] of Object.entries(byCert)) if (x.stale || x.missing) console.log(`  ${c}: ${x.fresh} current · ${x.stale} stale · ${x.missing} missing`)
  return { fresh, stale, missing, issues, byCert, todo }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run(process.argv[2] ?? 'check')
