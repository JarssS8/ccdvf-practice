// Answer-pattern lint for the question banks: can an item be answered without knowing the topic?
//   node scripts/lint-questions.mjs [cert-id]              table for every bank, then the calibrated rules (exit 1 if they fail)
//   node scripts/lint-questions.mjs --candidates <file>    check draft items (array) before they go into scripts/extra-questions/
// The same rules run in tests/unit/bank.test.ts, so a calibrated bank that regresses fails `npm test`.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CERTS } from '../src/shared/certs.ts'
import { stemPreview } from '../src/shared/exam.ts'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content')

/** Distractors that only a careless writer would offer: the reader learns to skip them, not the topic. */
export const TEMPLATE_DISTRACTORS = [
  /capital letters/i, /\b(raise|increase|lower|reduce)\w* the temperature/i, /temperature (to|of) (zero|0)\b/i,
  /repeat (the|its) system prompt/i, /all of the above/i, /none of the above/i, /\btry harder\b/i, /\bin bold\b/i,
]

export const RULES = {
  maxLengthRatio: 1.6, // per item: longest option / shortest option
  multiKeySpread: 0.2, // per multi-response item: mean key length within ±20% of mean distractor length
  maxKeyLongest: 0.3, // per set of single-answer items: share whose key is the longest option (chance 0.25)
  maxKeyShortest: 0.35,
  rankShare: [0.12, 0.35], // every length rank of the key (1st…4th) inside this band
  minMulti: 0.15, // new (curated) items only: the 87 keep their single keys
  minCode: 0.15,
  minRationale: 80,
  nearDuplicate: 0.33, // same Jaccard and tokens as scripts/sync-content.mjs
}

export const tokens = (s) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
export const jaccard = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1) }
/** What the sync clusters on: the stem plus the (first) key. */
export const clusterTokens = (q) => tokens(q.question + ' ' + q.options[q.answer[0]])

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const pct = (p) => `${Math.round(p * 100)}%`
export const hasCode = (q) => q.question.includes('```')
const STOP = new Set('the and for with that this from your what which when into are not but its can will should would their they them than then use using does how why who all any each more most only also'.split(' '))
const words = (s) => new Set((stemPreview(s).toLowerCase().match(/[a-z0-9_]{4,}/g) ?? []).filter((w) => !STOP.has(w)))

/** Facts about one item's options that a test-wise reader could exploit. */
export function itemStats(q) {
  const keys = Object.keys(q.options)
  const len = (k) => q.options[k].length
  const lens = keys.map(len)
  const single = q.answer.length === 1
  const byLen = [...keys].sort((a, b) => len(b) - len(a))
  const stem = words(q.question)
  const echo = (k) => [...words(q.options[k])].filter((w) => stem.has(w)).length
  const echoes = keys.map(echo)
  const others = keys.filter((k) => !q.answer.includes(k))
  return {
    ratio: Math.max(...lens) / Math.min(...lens),
    /** 0 = longest. Ties count against the key. */
    keyRank: single ? byLen.filter((k) => len(k) > len(q.answer[0])).length : null,
    keyLongest: single && len(q.answer[0]) === Math.max(...lens),
    keyShortest: single && len(q.answer[0]) === Math.min(...lens),
    keyEcho: single && echo(q.answer[0]) > 0 && echo(q.answer[0]) === Math.max(...echoes),
    keyRelLen: mean(q.answer.map(len)) / mean(others.map(len)),
    template: others.filter((k) => TEMPLATE_DISTRACTORS.some((re) => re.test(q.options[k]))),
  }
}

export function bankStats(qs) {
  const s = qs.map(itemStats)
  const singles = s.filter((x) => x.keyRank !== null)
  const share = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : 0)
  const w = qs.map((q) => stemPreview(q.question).split(/\s+/).length).sort((a, b) => a - b)
  return {
    n: qs.length,
    keyLongest: share(singles, (x) => x.keyLongest),
    keyShortest: share(singles, (x) => x.keyShortest),
    ranks: [0, 1, 2, 3].map((r) => share(singles, (x) => x.keyRank === r)),
    echo: share(singles, (x) => x.keyEcho),
    keyRelLen: s.length ? mean(s.map((x) => x.keyRelLen)) : 0,
    multi: share(qs, (q) => q.answer.length > 1),
    code: share(qs, hasCode),
    medianWords: w.length ? w[Math.floor(w.length / 2)] : 0,
    templates: s.filter((x) => x.template.length).length,
  }
}

/** Rationales cite options only as "(B)" or "(A, C)": that is the form relabel() rewrites to the shuffled letters. */
const BARE_LETTER = /\b(?:options?|answers?|choices?)\s+[A-E]\b|\b[A-E]\s+(?:is|are|was|would|could|does|do|fails?|misses|ignores|only|also|and|or)\b|^[A-E][.:)]|\s[A-E][:)]\s/

/** Rules every rewritten or new item must pass (the official guide samples are kept verbatim and exempt). */
export function itemProblems(q) {
  const out = []
  const x = itemStats(q)
  const n = Object.keys(q.options).length
  const k = q.answer.length
  const say = (m) => out.push(`${q.id}: ${m}`)
  if (Object.keys(q.options).join('') !== 'ABCDE'.slice(0, n)) say('option letters must be A, B, C… in order')
  if (!q.answer.length || q.answer.some((l) => !q.options[l])) say('answer not among the options')
  if (x.ratio > RULES.maxLengthRatio) say(`option lengths differ ${x.ratio.toFixed(2)}× (max ${RULES.maxLengthRatio})`)
  if (k > 1 && Math.abs(x.keyRelLen - 1) > RULES.multiKeySpread) say(`keys are ${Math.round(x.keyRelLen * 100)}% the length of the distractors`)
  if (k === 1 && n !== 4) say('single-answer items have 4 options')
  if (k > 1 && (n < 4 || n > 5 || k >= n - 1)) say(`${k} keys among ${n} options`)
  const tail = stemPreview(q.question).match(/\(Select (TWO|THREE)\.\)$/)
  if (k > 1 && (!tail || (tail[1] === 'TWO' ? 2 : 3) !== k)) say(`a ${k}-key stem must end in "(Select ${k === 2 ? 'TWO' : 'THREE'}.)"`)
  if (k === 1 && tail) say('single-answer stem says Select TWO/THREE')
  if (q.question.trim().startsWith('```')) say('the stem must open with a sentence, not a code block')
  if ((q.question.match(/```/g) ?? []).length % 2) say('unbalanced ``` fences')
  if (x.template.length) say(`template distractor ${x.template.join(', ')}`)
  if ((q.rationale ?? '').length < RULES.minRationale) say('rationale too short')
  if (BARE_LETTER.test(q.rationale ?? '')) say('rationale names an option without parentheses: write "(B)"')
  if (!/^https:\/\/\S+$/.test(q.ref ?? '')) say('missing ref (official source URL)')
  return out
}

/** Set-level rules over a group of items (`curated` adds the format quotas for new items). */
export function setProblems(qs, { label, curated = false } = {}) {
  const out = []
  if (!qs.length) return out
  const b = bankStats(qs)
  const say = (m) => out.push(`${label}: ${m}`)
  if (b.keyLongest > RULES.maxKeyLongest) say(`key is the longest option in ${pct(b.keyLongest)} (max ${pct(RULES.maxKeyLongest)})`)
  if (b.keyShortest > RULES.maxKeyShortest) say(`key is the shortest option in ${pct(b.keyShortest)} (max ${pct(RULES.maxKeyShortest)})`)
  b.ranks.forEach((r, i) => { if (r < RULES.rankShare[0] || r > RULES.rankShare[1]) say(`key is length rank ${i + 1} in ${pct(r)} (band ${pct(RULES.rankShare[0])}–${pct(RULES.rankShare[1])})`) })
  // Stem echo is reported, not enforced: the official samples echo the stem in most keys too
  if (curated && b.multi < RULES.minMulti) say(`${pct(b.multi)} multi-response (min ${pct(RULES.minMulti)})`)
  if (curated && b.code < RULES.minCode) say(`${pct(b.code)} with code (min ${pct(RULES.minCode)})`)
  return out
}

/** Lotes 2 and 3 (scripts/lotes/<cert>/lote<N>.json): long prose items, single answer, no code or exhibits. */
export const LOTE_RULES = { minStem: 280, maxStem: 560 }

/** Item rules for a lote item: the shared ones plus length, single answer and no code. */
export function loteItemProblems(q) {
  const out = itemProblems(q)
  const n = q.question.length
  const say = (m) => out.push(`${q.id}: ${m}`)
  if (n < LOTE_RULES.minStem || n > LOTE_RULES.maxStem) say(`stem is ${n} characters (want ${LOTE_RULES.minStem}–${LOTE_RULES.maxStem})`)
  if (q.question.includes('`')) say('no code or backticks in a lote stem')
  if (Object.values(q.options).some((o) => o.includes('`'))) say('no code or backticks in lote options')
  if (q.answer.length !== 1) say('lote items are single-answer')
  return out
}

/** New items must not cluster with anything: a shared dupGroup would hide them from readiness behind a question already seen. */
export function nearDuplicates(news, others) {
  const out = []
  const t = news.map(clusterTokens)
  const o = others.map((q) => [q.id, clusterTokens(q)])
  news.forEach((q, i) => {
    for (const [id, ot] of o) if (id !== q.id && jaccard(t[i], ot) >= RULES.nearDuplicate) out.push(`${q.id}: too close to ${id} (${jaccard(t[i], ot).toFixed(2)})`)
    // Stems of one contrastive set share their options on purpose and never appear in the same exam (same group)
    for (let j = 0; j < i; j++) if (!(q.group && q.group === news[j].group) && jaccard(t[i], t[j]) >= RULES.nearDuplicate) out.push(`${q.id}: too close to ${news[j].id}`)
  })
  return out
}

/** Everything wrong with a certification's calibrated content, as readable lines (empty when it passes). */
export function calibratedProblems(qs) {
  const cal = qs.filter((q) => q.calibrated && q.source !== 'guide')
  const curated = cal.filter((q) => q.source === 'curated')
  return [
    ...cal.flatMap(itemProblems),
    ...setProblems(cal, { label: 'calibrated' }),
    ...setProblems(curated, { label: 'curated', curated: true }),
    ...nearDuplicates(curated, qs.filter((q) => q.source !== 'curated')),
  ]
}

export const loadBank = (certId) => JSON.parse(readFileSync(join(dir, certId, 'questions.json'), 'utf8'))

function row(label, set) {
  const b = bankStats(set)
  return `${label.padEnd(26)} ${String(b.n).padStart(5)}  ${pct(b.keyLongest).padStart(8)}  ${pct(b.keyShortest).padStart(9)}  ${b.ranks.map(pct).join('/').padStart(16)}  ${pct(b.echo).padStart(5)}  ${b.keyRelLen.toFixed(2).padStart(7)}  ${pct(b.multi).padStart(5)}  ${pct(b.code).padStart(4)}  ${String(b.medianWords).padStart(5)}  ${String(b.templates).padStart(4)}`
}
const HEADER = `${'set'.padEnd(26)} items   longest   shortest  len ranks 1/2/3/4   echo  key/oth  multi  code  words  tmpl`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  let failed = false
  if (args[0] === '--lote') {
    // node scripts/lint-questions.mjs --lote scripts/lotes/developer-foundations
    // Each lote<N>.json is one set (key-length rules apply per lote); near-duplicates are checked against the whole existing bank and across lotes
    const lotesDir = args[1]
    const sets = readdirSync(lotesDir).filter((f) => /^lote\d+\.json$/.test(f)).sort().map((f) => [f, JSON.parse(readFileSync(join(lotesDir, f), 'utf8'))])
    const all = sets.flatMap(([, s]) => s)
    const bank = loadBank(all[0]?.cert ?? 'developer-foundations').filter((q) => !all.some((d) => d.id === q.id))
    console.log(HEADER)
    for (const [f, s] of sets) console.log(row(f, s))
    const problems = [...all.flatMap(loteItemProblems), ...sets.flatMap(([f, s]) => setProblems(s, { label: f })), ...nearDuplicates(all, bank)]
    for (const p of problems) console.log('  ! ' + p)
    console.log(problems.length ? `${problems.length} problems` : 'ok')
    process.exit(problems.length ? 1 : 0)
  }
  if (args[0] === '--candidates') {
    // Drafts: item rules, set rules as new items, and no clustering with any bank question or with each other
    const drafts = JSON.parse(readFileSync(args[1], 'utf8'))
    const cert = CERTS.find((c) => drafts[0]?.id?.startsWith(c.id)) ?? CERTS.find((c) => c.id === 'developer-foundations')
    const bank = loadBank(cert.id).filter((q) => !drafts.some((d) => d.id === q.id))
    console.log(HEADER)
    console.log(row('candidates', drafts))
    const problems = [...drafts.flatMap(itemProblems), ...setProblems(drafts, { label: 'candidates', curated: drafts.every((d) => d.source === 'curated') }), ...nearDuplicates(drafts.filter((d) => d.source === 'curated'), bank)]
    for (const p of problems) console.log('  ! ' + p)
    console.log(problems.length ? `${problems.length} problems` : 'ok')
    process.exit(problems.length ? 1 : 0)
  }
  console.log(HEADER)
  for (const cert of CERTS) {
    if (args[0] && args[0] !== cert.id) continue
    if (!existsSync(join(dir, cert.id, 'questions.json'))) continue
    const qs = loadBank(cert.id)
    for (const [name, set] of [['all', qs], ['guide (official)', qs.filter((q) => q.source === 'guide')], ['calibrated', qs.filter((q) => q.calibrated && q.source !== 'guide')], ['curated', qs.filter((q) => q.source === 'curated')]])
      if (set.length) console.log(row(`${cert.code} ${name}`, set))
    const problems = calibratedProblems(qs)
    for (const p of problems) console.warn(`  ! ${cert.code} ${p}`)
    if (problems.length) failed = true
  }
  process.exit(failed ? 1 : 0)
}
