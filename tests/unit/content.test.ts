import { describe, expect, it } from 'vitest'
import { flashcardText, flashcardsOf, localize, newsFor, notesFor, questionsOf, repoQuestions } from '../../src/lib/content'
import { CERTS } from '../../src/shared/certs'

describe('localized questions', () => {
  it('keep the English answer key and option letters', () => {
    for (const q of repoQuestions) {
      const es = localize(q, 'es')
      expect(es.answer).toEqual(q.answer)
      expect(Object.keys(es.options)).toEqual(Object.keys(q.options))
      expect(es.id).toBe(q.id)
      expect(es.domain).toBe(q.domain)
    }
  })
  it('are actually translated when current', () => {
    const changed = repoQuestions.filter((q) => localize(q, 'es').question !== q.question).length
    expect(changed).toBe(repoQuestions.length)
  })
  it('fall back to English when the English text changed after translating', () => {
    const q = { ...repoQuestions[0], question: repoQuestions[0].question + ' (edited)' }
    expect(localize(q, 'es')).toBe(q)
  })
  it('stay English in English', () => {
    expect(localize(repoQuestions[0], 'en')).toBe(repoQuestions[0])
  })
})

describe('other content', () => {
  it('every certification has questions, flashcards and notes, all of them in Spanish', () => {
    for (const c of CERTS) {
      expect(questionsOf(c).length).toBeGreaterThanOrEqual(80)
      expect(questionsOf(c).every((q) => q.cert === c.id && c.domains.some((d) => d.name === q.domain))).toBe(true)
      for (const f of flashcardsOf(c)) expect(flashcardText(f, 'es').front).not.toBe(f.front)
      expect(notesFor(c, 'es').notes).not.toBe(notesFor(c, 'en').notes)
      expect(notesFor(c, 'es').cheatSheet).not.toBe(notesFor(c, 'en').cheatSheet)
    }
    expect(newsFor('es').length).toBe(newsFor('en').length)
  })
  it('question ids are unique across certifications', () => {
    expect(new Set(repoQuestions.map((q) => q.id)).size).toBe(repoQuestions.length)
  })
})
