import { describe, expect, it } from 'vitest'
import { ensureAll, flashcardText, flashcardsOf, guide, guideText, localize, newsFor, notesFor, questionsOf, repoQuestions as allQuestions } from '../../src/lib/content'
import { CERTS, isCertId } from '../../src/shared/certs'
import { guideEntries } from '../../src/shared/guide'

// Content arrives per certification on demand; these tests read all of it
await ensureAll()
const repoQuestions = allQuestions()

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
  it('the guide pages: nine confusable pairs, courses mapped to real certifications, a prep path and a plan for each', () => {
    expect(guide.confusions).toHaveLength(9)
    expect(guide.courses.length).toBeGreaterThanOrEqual(28)
    for (const c of guide.courses) {
      expect(c.certs.length, c.title).toBeGreaterThan(0)
      expect(c.certs.every(isCertId)).toBe(true)
      expect(c.url).toMatch(/^https:\/\/academy\.claude\.com\/courses\//)
    }
    for (const c of CERTS) {
      expect(guide.prepPaths[c.id]).toMatch(/^https:\/\/anthropic-partners\.skilljar\.com\//)
      expect(guide.strategy.emphasis[c.id]).toBeTruthy()
      expect(guide.courses.some((x) => x.certs.includes(c.id))).toBe(true)
    }
    expect(guide.strategy.weeks).toHaveLength(3)
    for (const [key, en] of guideEntries(guide)) expect(guideText(key, en, 'es'), key).not.toBe(en)
  })
  it('question ids are unique across certifications', () => {
    expect(new Set(repoQuestions.map((q) => q.id)).size).toBe(repoQuestions.length)
  })
})
