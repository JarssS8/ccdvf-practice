// Spanish content lives in src/content/es/*.json: only text, keyed like the English source, plus `src`,
// the hash of the English text it was translated from. The app falls back to English when they differ.
//   node scripts/i18n.mjs check   report missing, stale and malformed translations (never fails the build)
//   node scripts/i18n.mjs stamp   mark entries without `src` as translated from the current English text
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { questionHash, textHash } from '../src/shared/exam.ts'

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
  let fresh = 0, stale = 0, missing = 0

  const q = read('questions.json'), qes = read('es/questions.json')
  for (const x of q) {
    const t = qes[x.id]
    if (!t) { missing++; continue }
    if (Object.keys(t.options ?? {}).sort().join() !== Object.keys(x.options).sort().join()) issues.push(`${x.id}: option letters differ`)
    if (stamp && !t.src) t.src = questionHash(x)
    if (t.src === questionHash(x)) fresh++
    else stale++
  }

  const f = read('flashcards.json'), fes = read('es/flashcards.json')
  for (const x of f) {
    const t = fes[x.id]
    if (!t) { missing++; continue }
    if (stamp && !t.src) t.src = cardHash(x)
    if (t.src === cardHash(x)) fresh++
    else stale++
  }

  const n = read('notes.json'), nes = read('es/notes.json')
  for (const k of ['cheatSheet', 'notes']) {
    const t = nes[k]
    if (!t) { missing++; continue }
    if (fences(t.text) !== fences(n[k]) || rows(t.text) !== rows(n[k])) issues.push(`notes.${k}: code fences or table rows differ`)
    if (stamp && !t.src) t.src = textHash(n[k])
    if (t.src === textHash(n[k])) fresh++
    else stale++
  }

  const w = read('news.json'), wes = read('es/news.json')
  for (const x of w) {
    const t = wes[newsKey(x)]
    if (!t) { missing++; continue }
    if (stamp && !t.src) t.src = newsHash(x)
    if (t.src === newsHash(x)) fresh++
    else stale++
  }

  if (stamp) { write('es/questions.json', qes); write('es/flashcards.json', fes); write('es/notes.json', nes); write('es/news.json', wes) }
  for (const i of issues) console.warn('  ! ' + i)
  console.log(`es translations: ${fresh} current · ${stale} stale (shown in English) · ${missing} missing`)
  return { fresh, stale, missing, issues }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run(process.argv[2] ?? 'check')
