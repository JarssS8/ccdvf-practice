import { describe, expect, it } from 'vitest'
import { flashcardText, localize, newsFor, notesFor, repoFlashcards, repoQuestions } from '../../src/lib/content'

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
  it('flashcards, notes and news have Spanish versions', () => {
    expect(flashcardText(repoFlashcards[0], 'es').front).not.toBe(repoFlashcards[0].front)
    expect(notesFor('es').notes).not.toBe(notesFor('en').notes)
    expect(newsFor('es').length).toBe(newsFor('en').length)
  })
})
