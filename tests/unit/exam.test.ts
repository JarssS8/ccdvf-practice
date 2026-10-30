import { describe, expect, it } from 'vitest'
import { asDisplayed, displayLetter, domainQuotas, DOMAINS, EXAM, optionOrder, questionHash, relabel, type Question } from '../../src/shared/exam'

const q: Question = {
  id: 'q-1', source: 'practice', domain: 'Claude Code', question: 'Which one?',
  options: { A: 'alpha', B: 'bravo', C: 'charlie', D: 'delta' }, answer: ['B'],
  rationale: 'B is right; (A) and (C, D) are traps.',
}

describe('option order', () => {
  it('is a permutation of the option letters', () => {
    for (let seed = 0; seed < 50; seed++) expect([...optionOrder(q, seed)].sort()).toEqual(['A', 'B', 'C', 'D'])
  })
  it('is stable for the same seed and question', () => {
    expect(optionOrder(q, 1234)).toEqual(optionOrder(q, 1234))
  })
  it('actually shuffles across seeds', () => {
    const orders = new Set(Array.from({ length: 30 }, (_, s) => optionOrder(q, s).join('')))
    expect(orders.size).toBeGreaterThan(5)
  })
})

describe('displayed question', () => {
  it('maps the key and the choice to display letters consistently', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { question, choice } = asDisplayed(q, seed, ['B'])
      const order = optionOrder(q, seed)
      const shown = displayLetter(order.indexOf('B'))
      expect(question.answer).toEqual([shown])
      expect(choice).toEqual([shown])
      expect(question.options[shown]).toBe('bravo')
    }
  })
  it('relabels letters cited in the rationale', () => {
    const seed = 7
    const order = optionOrder(q, seed)
    const to = (l: 'A' | 'C' | 'D') => displayLetter(order.indexOf(l))
    expect(relabel(q.rationale, q, seed)).toBe(`B is right; (${to('A')}) and (${[to('C'), to('D')].sort().join(', ')}) are traps.`)
  })
})

describe('exam facts', () => {
  it('domain weights add up to 100%', () => {
    expect(DOMAINS.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(100, 5)
  })
  it('quotas fill the requested number of items', () => {
    for (const n of [3, 15, EXAM.items]) expect(Object.values(domainQuotas(n)).reduce((a, b) => a + b, 0)).toBe(n)
  })
  it('the translation fingerprint changes with the English text', () => {
    expect(questionHash(q)).toBe(questionHash({ ...q }))
    expect(questionHash(q)).not.toBe(questionHash({ ...q, question: 'Which one? ' }))
  })
})
