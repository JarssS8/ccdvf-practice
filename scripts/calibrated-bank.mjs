// Switches a certification between the study repo's questions as they are and the rewritten, calibrated bank.
//   node scripts/calibrated-bank.mjs status
//   node scripts/calibrated-bank.mjs enable|disable <cert-id|all>   flips the flag, re-runs the sync and swaps the Spanish
//   node scripts/calibrated-bank.mjs es                              only swaps the Spanish to match the flags
// The Spanish of both versions lives in scripts/question-overrides/es/<cert-id>.json ({ calibrated, original }, each entry stamped
// with the hash of the English it translates); only entries that match the English now served are put in src/content/<cert-id>/es/.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { CERTS } from '../src/shared/certs.ts'
import { questionHash } from '../src/shared/exam.ts'

const here = dirname(fileURLToPath(import.meta.url))
const flagsFile = join(here, 'calibrated-bank.json')
const content = join(here, '..', 'src', 'content')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const flags = () => readJson(flagsFile)

function swapSpanish() {
  for (const cert of CERTS) {
    const overlayFile = join(here, 'question-overrides', 'es', `${cert.id}.json`)
    if (!existsSync(overlayFile)) continue
    const overlay = readJson(overlayFile)
    const on = flags()[cert.id] === true
    const want = on ? overlay.calibrated : overlay.original
    const en = new Map(readJson(join(content, cert.id, 'questions.json')).map((q) => [q.id, q]))
    const esFile = join(content, cert.id, 'es', 'questions.json')
    const es = readJson(esFile)
    let put = 0, dropped = 0
    for (const id of new Set([...Object.keys(overlay.calibrated), ...Object.keys(overlay.original)])) {
      const t = want[id], q = en.get(id)
      if (t && q && t.src === questionHash(q)) { es[id] = t; put++ } else if (id in es) { delete es[id]; dropped++ }
    }
    writeFileSync(esFile, JSON.stringify(es, null, 1) + '\n')
    console.log(`${cert.code}: ${on ? 'calibrated' : 'original'} bank · Spanish ${put} put, ${dropped} dropped`)
  }
}

const [cmd, target] = process.argv.slice(2)
if (cmd === 'status' || !cmd) {
  for (const c of CERTS) console.log(`${c.code.padEnd(7)} ${flags()[c.id] === true ? 'calibrated bank ON' : 'original bank (calibrated bank off)'}`)
} else if (cmd === 'es') {
  swapSpanish()
} else if (cmd === 'enable' || cmd === 'disable') {
  const ids = target === 'all' ? CERTS.map((c) => c.id) : CERTS.filter((c) => c.id === target).map((c) => c.id)
  if (!ids.length) { console.error('usage: calibrated-bank.mjs enable|disable <cert-id|all>'); process.exit(1) }
  const f = flags()
  for (const id of ids) f[id] = cmd === 'enable'
  writeFileSync(flagsFile, JSON.stringify(f, null, 2) + '\n')
  execFileSync('node', [join(here, 'sync-content.mjs')], { stdio: 'inherit' })
  swapSpanish()
  execFileSync('node', [join(here, 'i18n.mjs'), 'check'], { stdio: 'inherit' })
} else {
  console.error('usage: calibrated-bank.mjs status | enable|disable <cert-id|all> | es')
  process.exit(1)
}
