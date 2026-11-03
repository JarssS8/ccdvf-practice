import { describe, expect, it } from 'vitest'
import { ensureCert, flashcardsOf, guideCount, isLoaded, metaOf, notesFor, questionIndex, questionsOf } from '../../src/lib/content'
import { certById } from '../../src/shared/certs'

// Fresh module state: nothing loaded until asked for
describe('content per certification, on demand', () => {
  const AO = certById('associate-foundations')
  it('nothing is there before it is asked for, except the small metadata', () => {
    expect(isLoaded(AO.id)).toBe(false)
    expect(questionsOf(AO)).toEqual([])
    expect(flashcardsOf(AO)).toEqual([])
    expect(notesFor(AO, 'en').notes).toBe('')
    expect(metaOf(AO).counts.questions).toBeGreaterThan(80)
    expect(guideCount(AO)).toBe(3)
    expect(questionIndex([]).size).toBe(0)
  })
  it('loads once, then reads synchronously; unknown ids are refused', async () => {
    await Promise.all([ensureCert(AO.id), ensureCert(AO.id)])
    expect(isLoaded(AO.id)).toBe(true)
    expect(questionsOf(AO).length).toBe(metaOf(AO).counts.questions)
    expect(isLoaded('architect-professional')).toBe(false)
    await expect(ensureCert('__proto__')).rejects.toThrow()
  })
})
