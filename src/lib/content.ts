import type { Question } from '../shared/exam'
import questionsJson from '../content/questions.json'
import flashcardsJson from '../content/flashcards.json'
import newsJson from '../content/news.json'
import notesJson from '../content/notes.json'
import metaJson from '../content/meta.json'

export const repoQuestions = questionsJson as Question[]
export interface Flashcard { id: string; front: string; back: string; kind: string; scope: string }
export const repoFlashcards = flashcardsJson as Flashcard[]
export const news = newsJson as { year: string; title: string; body: string }[]
export const notes = notesJson as { cheatSheet: string; notes: string }
export const meta = metaJson

export type AiQuestion = Question & { reported?: boolean }

/** Every question by id: repo bank plus generated ones (reported ones stay resolvable for history). */
export function questionIndex(ai: AiQuestion[]) {
  const map = new Map<string, AiQuestion>()
  for (const q of repoQuestions) map.set(q.id, q)
  for (const q of ai) map.set(q.id, q)
  return map
}

export const groupOf = (q: Question) => q.dupGroup ?? q.id

export const SOURCE_LABEL: Record<string, string> = {
  practice: 'Práctica del repo',
  'mock-1': 'Mock 1 del repo',
  'mock-2': 'Mock 2 del repo',
  'mock-3': 'Mock 3 del repo',
  guide: 'Ejemplo de la guía oficial',
  ai: 'Generada por IA',
}
