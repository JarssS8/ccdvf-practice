import { questionHash, textHash, type Question } from '../shared/exam'
import type { Lang } from '../i18n'
import questionsJson from '../content/questions.json'
import flashcardsJson from '../content/flashcards.json'
import newsJson from '../content/news.json'
import notesJson from '../content/notes.json'
import metaJson from '../content/meta.json'
import questionsEs from '../content/es/questions.json'
import flashcardsEs from '../content/es/flashcards.json'
import newsEs from '../content/es/news.json'
import notesEs from '../content/es/notes.json'

export const repoQuestions = questionsJson as Question[]
export interface Flashcard { id: string; front: string; back: string; kind: string; scope: string }
export const repoFlashcards = flashcardsJson as Flashcard[]
type News = { year: string; title: string; body: string }
const newsEn = newsJson as News[]
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

// ---------- Spanish, falling back to English per item when missing or translated from older text ----------

type QText = { question: string; options: Record<string, string>; rationale: string; src?: string }
const qEs = questionsEs as Record<string, QText>
const fEs = flashcardsEs as Record<string, { front: string; back: string; src?: string }>
const nEs = notesEs as Record<'cheatSheet' | 'notes', { text: string; src?: string }>
const wEs = newsEs as Record<string, { title: string; body: string; src?: string }>

/** The question in `lang`. Answer key and option letters always come from the English source. */
export function localize<Q extends Question>(q: Q, lang: Lang): Q {
  if (lang !== 'es') return q
  const t = qEs[q.id]
  if (!t || t.src !== questionHash(q)) return q
  const options: Question['options'] = {}
  for (const k of Object.keys(q.options) as (keyof Question['options'])[]) options[k] = t.options[k] ?? q.options[k]
  return { ...q, question: t.question, options, rationale: t.rationale }
}

export function flashcardText(c: Pick<Flashcard, 'id' | 'front' | 'back'>, lang: Lang) {
  const t = lang === 'es' ? fEs[c.id] : undefined
  return t && t.src === textHash(c.front + '\n' + c.back) ? { front: t.front, back: t.back } : { front: c.front, back: c.back }
}

export function notesFor(lang: Lang) {
  const pick = (k: 'cheatSheet' | 'notes') => (lang === 'es' && nEs[k]?.src === textHash(notesJson[k]) ? nEs[k].text : notesJson[k])
  return { cheatSheet: pick('cheatSheet'), notes: pick('notes') }
}

export function newsFor(lang: Lang): News[] {
  if (lang !== 'es') return newsEn
  return newsEn.map((n) => {
    const t = wEs[textHash(n.title)]
    return t && t.src === textHash(n.title + '\n' + n.body) ? { ...n, title: t.title, body: t.body } : n
  })
}
