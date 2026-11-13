import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { loteItemProblems, nearDuplicates, setProblems } from '../../scripts/lint-questions.mjs'
import { ensureAll, questionIndex, questionsOf } from '../../src/lib/content'
import { buildAttempt, countsForReadiness, modeSpec } from '../../src/lib/engine'
import { loteCounts } from '../../src/lib/lotes'
import { certById } from '../../src/shared/certs'
import { loteOf, type Question } from '../../src/shared/exam'
import type { Data } from '../../src/lib/store'

await ensureAll()
const DV = certById('developer-foundations')
const qs = questionIndex([])
const empty = (): Data => ({ user: null, attempts: {}, answers: {}, reviews: [], aiQuestions: [], settings: {}, ai: { enabled: false, usedToday: 0, dailyLimit: 0 } })
const dir = 'scripts/lotes/developer-foundations'
type LoteItem = Question & { group?: string }
const lotes = readdirSync(dir).filter((f) => /^lote\d+\.json$/.test(f)).sort().map((f) => [f, JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as LoteItem[]] as const)
const served = questionsOf(DV).filter((q) => q.source === 'lote')
const lote4 = lotes.find(([f]) => f === 'lote4.json')![1]

function attempt(lotesWanted: number[] | undefined, mode: 'full' | 'drill' = 'full', domain?: string) {
  const a = buildAttempt(mode, empty(), qs, { cert: DV, domain, lotes: lotesWanted, now: 0 })
  if ('error' in a) throw new Error(a.error)
  return a.questionIds.map((id) => qs.get(id)!)
}

describe('lotes 2 to 4 (Developer)', () => {
  it('each lote is at least a full exam, covering every domain by its official weight', () => {
    expect(lotes.map(([f]) => f)).toEqual(['lote2.json', 'lote3.json', 'lote4.json'])
    for (const [f, items] of lotes) {
      expect(items.length, f).toBeGreaterThanOrEqual(DV.items)
      const byDomain = new Map<string, number>()
      for (const q of items) byDomain.set(q.domain, (byDomain.get(q.domain) ?? 0) + 1)
      expect([...byDomain.keys()].sort()).toEqual(DV.domains.map((d) => d.name).sort())
      for (const d of DV.domains) expect(Math.abs((byDomain.get(d.name) ?? 0) - (d.weight / 100) * items.length), `${f} ${d.name}`).toBeLessThanOrEqual(1.1)
    }
  })

  it('passes the lote rules: long prose, no code, plausible equal-length options, key length not a cue', () => {
    const all = lotes.flatMap(([, s]) => s)
    expect(all.flatMap((q) => loteItemProblems(q))).toEqual([])
    for (const [f, s] of lotes) expect(setProblems(s, { label: f })).toEqual([])
    const others = questionsOf(DV).filter((q) => q.source !== 'lote')
    expect(nearDuplicates(all, others)).toEqual([])
  })

  it('is served by the bank with its lote, source and official reference; only contrastive sets share a group', () => {
    expect(served).toHaveLength(lotes.reduce((n, [, s]) => n + s.length, 0))
    expect(served.every((q) => q.ref && (q.lote ?? 1) >= 2 && (!q.dupGroup || q.dupGroup.includes('-set-')))).toBe(true)
    expect(loteCounts(qs, DV)).toEqual({ 1: questionsOf(DV).length - served.length, ...Object.fromEntries(lotes.map(([f, s]) => [Number(f.match(/\d+/)![0]), s.length])) })
  })

  it('exams draw from Lote 1 by default and from the chosen lotes otherwise', () => {
    const lots = (w?: number[], mode: 'full' | 'drill' = 'full', domain?: string) => attempt(w, mode, domain).map(loteOf)
    expect(new Set(lots())).toEqual(new Set([1]))
    for (const n of [2, 3, 4]) {
      expect(new Set(lots([n]))).toEqual(new Set([n]))
      expect(lots([n])).toHaveLength(DV.items)
    }
    expect(lots([1, 2, 3, 4]).every((n) => [1, 2, 3, 4].includes(n))).toBe(true)
    expect(new Set(lots([2, 3])).has(1)).toBe(false)
    expect(new Set(lots([2], 'drill', 'Applications and Integration'))).toEqual(new Set([2]))
  })

  it('does not count towards readiness until it is trusted', () => {
    expect(served.every((q) => !countsForReadiness(q))).toBe(true)
  })
})

describe('Lote 4: contrastive sets', () => {
  const sets = new Map<string, LoteItem[]>()
  for (const q of lote4) sets.set(q.group!, [...(sets.get(q.group!) ?? []), q])

  it('every stem belongs to a twin or a quad that shares one option list, each stem with a different key', () => {
    expect(lote4.every((q) => q.group?.includes('-set-'))).toBe(true)
    for (const [g, stems] of sets) {
      expect([2, 4], g).toContain(stems.length)
      for (const s of stems) expect(s.options, s.id).toEqual(stems[0].options)
      expect(new Set(stems.map((s) => s.answer[0])).size, g).toBe(stems.length)
    }
  })

  it('options alone can be right at most once per set', () => {
    // A reader who sees only the options gives one answer per set; at most one stem of the set has that key
    let best = 0
    for (const stems of sets.values()) best += 1
    expect(best / lote4.length).toBeLessThanOrEqual(0.3)
  })

  it('mixed with other lots, an exam never shows two stems of one set; on its own it is topped up with siblings', () => {
    for (let i = 0; i < 5; i++) {
      const groups = attempt([1, 4]).filter((q) => q.dupGroup?.includes('-set-')).map((q) => q.dupGroup)
      expect(new Set(groups).size).toBe(groups.length)
    }
    expect(attempt([4])).toHaveLength(DV.items)
    expect(attempt([4], 'drill', 'Applications and Integration')).toHaveLength(Math.min(modeSpec('drill', DV).items, lote4.filter((q) => q.domain === 'Applications and Integration').length))
  })
})
