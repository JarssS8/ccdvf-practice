import { describe, expect, it } from 'vitest'
import { asDisplayed, displayLetter, optionOrder, questionHash, relabel, stemParts, stemPreview, type Question } from '../../src/shared/exam'
import { CERTS, DEFAULT_CERT, certById, certOfAttempt, certOfDomain, certOfExamDateKey, certOfQuestion, domainQuotas, examDateKey, isCertId, quickMinutes } from '../../src/shared/certs'

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
  it('every certification: weights add up to 100% and quotas fill the requested number of items', () => {
    for (const c of CERTS) {
      expect(c.domains.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(100, 5)
      for (const n of [3, 15, c.items]) expect(Object.values(domainQuotas(c, n)).reduce((a, b) => a + b, 0)).toBe(n)
    }
  })
  it('the four exams as the guides publish them', () => {
    expect(CERTS.map((c) => [c.code, c.items, c.minutes])).toEqual([['CCAO-F', 60, 120], ['CCDV-F', 53, 120], ['CCAR-F', 60, 120], ['CCAR-P', 63, 120]])
    expect(new Set(CERTS.map((c) => c.id)).size).toBe(4)
    expect(quickMinutes(certById('developer-foundations'))).toBe(34)
    expect(quickMinutes(certById('architect-foundations'))).toBe(30)
  })
  it('a domain name belongs to exactly one certification', () => {
    const all = CERTS.flatMap((c) => c.domains.map((d) => d.name))
    expect(new Set(all).size).toBe(all.length)
    for (const c of CERTS) for (const d of c.domains) expect(certOfDomain(d.name)).toBe(c.id)
  })
  it('untrusted ids never resolve through the prototype', () => {
    for (const id of ['__proto__', 'constructor', 'toString', '', 'developer']) expect(isCertId(id)).toBe(false)
    expect(certById('__proto__').id).toBe(DEFAULT_CERT)
    expect(certOfExamDateKey('exam_date:__proto__')).toBeNull()
    expect(certOfExamDateKey('exam_date:developer-foundations')).toBeNull()
  })
  it('older rows without a certification are Developer', () => {
    expect(certOfAttempt({})).toBe(DEFAULT_CERT)
    expect(certOfAttempt({ cert: 'architect-professional' })).toBe('architect-professional')
    expect(certOfQuestion({ domain: 'Integration' })).toBe('architect-professional')
    expect(certOfQuestion({ domain: 'Something new' })).toBe(DEFAULT_CERT)
  })
  it('exam date keys: Developer keeps its old key, the others get their own', () => {
    for (const c of CERTS) expect(certOfExamDateKey(examDateKey(c.id))).toBe(c.id)
    expect(examDateKey(DEFAULT_CERT)).toBe('exam_date')
    expect(examDateKey('associate-foundations')).toBe('exam_date:associate-foundations')
  })
  it('the translation fingerprint changes with the English text', () => {
    expect(questionHash(q)).toBe(questionHash({ ...q }))
    expect(questionHash(q)).not.toBe(questionHash({ ...q, question: 'Which one? ' }))
  })
})

describe('stems with code', () => {
  const stem = 'The handler fails on some responses:\n```python\ntext = response.content[0].text\n```\nWhat is the cause?'
  it('splits prose and fenced code, dropping the language tag', () => {
    expect(stemParts(stem)).toEqual([
      { code: false, text: 'The handler fails on some responses:' },
      { code: true, text: 'text = response.content[0].text' },
      { code: false, text: 'What is the cause?' },
    ])
  })
  it('previews without the code', () => {
    expect(stemPreview(stem)).toBe('The handler fails on some responses: What is the cause?')
    expect(stemPreview('Plain stem?')).toBe('Plain stem?')
  })
  it('an unclosed fence runs to the end', () => {
    expect(stemParts('Look:\n```json\n{"a": 1}')).toEqual([{ code: false, text: 'Look:' }, { code: true, text: '{"a": 1}' }])
  })
})
