import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { calibratedProblems, itemProblems } from '../../scripts/lint-questions.mjs'
import type { Question } from '../../src/shared/exam'

const bank = JSON.parse(readFileSync('src/content/developer-foundations/questions.json', 'utf8')) as Question[]
const overrides = JSON.parse(readFileSync('scripts/question-overrides/developer-foundations.json', 'utf8')) as Record<string, Record<string, unknown>>

describe('the calibrated Developer bank', () => {
  it('passes every answer-pattern rule', () => {
    expect(calibratedProblems(bank)).toEqual([])
  })
  it('rewrites every upstream practice and mock question, and every rewrite is in use', () => {
    const upstream = bank.filter((q) => ['practice', 'mock-1', 'mock-2', 'mock-3'].includes(q.source))
    expect(upstream.length).toBeGreaterThan(0)
    expect(upstream.filter((q) => !q.calibrated).map((q) => q.id)).toEqual([])
    expect(Object.keys(overrides).sort()).toEqual(upstream.map((q) => q.id).sort())
  })
  it('overrides never carry a key: stored answers keep their meaning', () => {
    for (const [id, o] of Object.entries(overrides)) {
      expect(Object.keys(o).filter((k) => !['src', 'calibrated', 'question', 'options', 'rationale', 'evidence', 'ref', 'task'].includes(k)), id).toEqual([])
      const q = bank.find((x) => x.id === id)!
      expect(Object.keys(o.options as object), id).toEqual(Object.keys(q.options))
      expect(q.answer.length, id).toBe(1)
    }
  })
  it('calibration times are full ISO timestamps', () => {
    for (const q of bank.filter((x) => x.calibrated)) expect(q.calibrated, q.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
  })
  it('the lint catches the cues it is meant to catch', () => {
    const q = { id: 'x', source: 'curated', domain: 'Claude Code', question: 'Which?', options: { A: 'a', B: 'a much longer and more specific answer', C: 'c', D: 'd' }, answer: ['B'], rationale: 'Option B is right.', ref: 'https://example.com' }
    const p = itemProblems(q).join('\n')
    expect(p).toMatch(/option lengths differ/)
    expect(p).toMatch(/without parentheses/)
  })
})
