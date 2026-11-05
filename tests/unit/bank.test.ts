import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { calibratedProblems, itemProblems, nearDuplicates, setProblems } from '../../scripts/lint-questions.mjs'
import { CERTS } from '../../src/shared/certs'
import type { Question } from '../../src/shared/exam'

const read = <T,>(f: string): T => JSON.parse(readFileSync(f, 'utf8'))
const flags = read<Record<string, unknown>>('scripts/calibrated-bank.json')
/** The study repo's own practice and mock questions: the ones an override rewrites. */
const UPSTREAM = ['practice', 'mock-1', 'mock-2', 'mock-3']

describe.each(CERTS.map((c) => [c.code, c.id] as const))('%s question bank', (_code, id) => {
  const on = flags[id] === true
  const bank = read<Question[]>(`src/content/${id}/questions.json`)
  const overrides = existsSync(`scripts/question-overrides/${id}.json`) ? read<Record<string, Record<string, unknown>>>(`scripts/question-overrides/${id}.json`) : {}
  const curated = (existsSync(`scripts/extra-questions/${id}.json`) ? read<Question[]>(`scripts/extra-questions/${id}.json`) : []).filter((q) => q.source === 'curated')

  it('serves the original questions while the calibrated bank is off', () => {
    if (on) return
    expect(bank.filter((q) => q.calibrated || q.ref || q.source === 'curated').map((q) => q.id)).toEqual([])
  })

  // The calibrated bank's sources stay valid whether or not it is switched on
  it('keeps its rewrites and new items, and they pass every answer-pattern rule', () => {
    expect(Object.keys(overrides).length).toBeGreaterThan(0)
    expect(curated.length).toBeGreaterThan(0)
    const upstream = new Map(bank.map((q) => [q.id, q]))
    const rewritten = Object.entries(overrides).map(([qid, o]) => ({ ...(upstream.get(qid) ?? { id: qid }), ...o, id: qid, source: 'curated' })) as Question[]
    const fresh = curated.map((q) => ({ ...q, calibrated: 'x' }))
    expect([...rewritten, ...fresh].flatMap((q) => itemProblems(q))).toEqual([])
    expect(setProblems(fresh, { label: 'curated', curated: true })).toEqual([])
    expect(nearDuplicates(fresh, bank.filter((q) => q.source !== 'curated'))).toEqual([])
  })
  it('overrides cover every upstream practice and mock question and never carry a key', () => {
    const up = bank.filter((q) => UPSTREAM.includes(q.source))
    expect(Object.keys(overrides).sort()).toEqual(up.map((q) => q.id).sort())
    for (const [qid, o] of Object.entries(overrides)) {
      expect(Object.keys(o).filter((k) => !['src', 'calibrated', 'question', 'options', 'rationale', 'evidence', 'ref', 'task'].includes(k)), qid).toEqual([])
      expect(Object.keys(o.options as object), qid).toEqual(Object.keys(bank.find((x) => x.id === qid)!.options))
      expect(o.calibrated, qid).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
    }
  })

  it.skipIf(!on)('passes every answer-pattern rule once switched on', () => {
    expect(calibratedProblems(bank)).toEqual([])
    expect(bank.filter((q) => UPSTREAM.includes(q.source) && !q.calibrated).map((q) => q.id)).toEqual([])
  })
})

describe('the lint', () => {
  it('catches the cues it is meant to catch', () => {
    const q = { id: 'x', source: 'curated', domain: 'Claude Code', question: 'Which?', options: { A: 'a', B: 'a much longer and more specific answer', C: 'c', D: 'd' }, answer: ['B'], rationale: 'Option B is right.', ref: 'https://example.com' }
    const p = itemProblems(q).join('\n')
    expect(p).toMatch(/option lengths differ/)
    expect(p).toMatch(/without parentheses/)
  })
})
