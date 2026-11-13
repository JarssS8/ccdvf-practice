import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { loteItemProblems, nearDuplicates, setProblems } from '../../scripts/lint-questions.mjs'
import { ensureAll, questionIndex, questionsOf } from '../../src/lib/content'
import { buildAttempt, countsForReadiness } from '../../src/lib/engine'
import { loteCounts } from '../../src/lib/lotes'
import { certById } from '../../src/shared/certs'
import { loteOf, type Question } from '../../src/shared/exam'
import type { Data } from '../../src/lib/store'

await ensureAll()
const DV = certById('developer-foundations')
const qs = questionIndex([])
const empty = (): Data => ({ user: null, attempts: {}, answers: {}, reviews: [], aiQuestions: [], settings: {}, ai: { enabled: false, usedToday: 0, dailyLimit: 0 } })
const dir = 'scripts/lotes/developer-foundations'
const lotes = readdirSync(dir).filter((f) => /^lote\d+\.json$/.test(f)).sort().map((f) => [f, JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Question[]] as const)
const served = questionsOf(DV).filter((q) => q.source === 'lote')

describe('lotes 2 and 3 (Developer)', () => {
  it('two lotes of a full exam each, covering every domain by its official weight', () => {
    expect(lotes.map(([f]) => f)).toEqual(['lote2.json', 'lote3.json'])
    for (const [, items] of lotes) {
      expect(items).toHaveLength(DV.items)
      const byDomain = new Map<string, number>()
      for (const q of items) byDomain.set(q.domain, (byDomain.get(q.domain) ?? 0) + 1)
      expect([...byDomain.keys()].sort()).toEqual(DV.domains.map((d) => d.name).sort())
      for (const d of DV.domains) expect(Math.abs((byDomain.get(d.name) ?? 0) - (d.weight / 100) * DV.items), d.name).toBeLessThanOrEqual(1.1)
    }
  })

  it('passes the lote rules: long prose, no code, plausible equal-length options, key length not a cue', () => {
    const all = lotes.flatMap(([, s]) => s)
    expect(all.flatMap((q) => loteItemProblems(q))).toEqual([])
    for (const [f, s] of lotes) expect(setProblems(s, { label: f })).toEqual([])
    const others = questionsOf(DV).filter((q) => q.source !== 'lote')
    expect(nearDuplicates(all, others)).toEqual([])
  })

  it('is served by the bank with its lote, source and official reference, outside every duplicate group', () => {
    expect(served).toHaveLength(lotes.reduce((n, [, s]) => n + s.length, 0))
    // Only the stems of a contrastive set share a group (SPEC.md); nothing else of a lote joins a duplicate group
    expect(served.every((q) => q.ref && (q.lote ?? 1) >= 2 && (!q.dupGroup || q.dupGroup.includes('-set-')))).toBe(true)
    expect(loteCounts(qs, DV)).toEqual({ 1: questionsOf(DV).length - served.length, 2: lotes[0][1].length, 3: lotes[1][1].length })
  })

  it('exams draw from Lote 1 by default and from the chosen lotes otherwise', () => {
    const ids = (lotesWanted?: number[], mode: 'full' | 'drill' = 'full', domain?: string) => {
      const a = buildAttempt(mode, empty(), qs, { cert: DV, domain, lotes: lotesWanted, now: 0 })
      if ('error' in a) throw new Error(a.error)
      return a.questionIds.map((id) => loteOf(qs.get(id)!))
    }
    expect(new Set(ids())).toEqual(new Set([1]))
    expect(new Set(ids([2]))).toEqual(new Set([2]))
    expect(new Set(ids([3]))).toEqual(new Set([3]))
    expect(ids([2])).toHaveLength(DV.items)
    expect(ids([1, 2, 3]).every((n) => [1, 2, 3].includes(n))).toBe(true)
    expect(new Set(ids([2, 3])).has(1)).toBe(false)
    expect(new Set(ids([2], 'drill', 'Applications and Integration'))).toEqual(new Set([2]))
  })

  it('does not count towards readiness until it is trusted', () => {
    expect(countsForReadiness(served[0])).toBe(false)
  })
})
