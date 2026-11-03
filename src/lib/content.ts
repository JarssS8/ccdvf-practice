import { questionHash, textHash, type Question } from '../shared/exam'
import { CERTS, certOfQuestion, type CertDef } from '../shared/certs'
import type { Lang } from '../i18n'
import newsJson from '../content/news.json'
import questionsEs from '../content/es/questions.json'
import flashcardsEs from '../content/es/flashcards.json'
import newsEs from '../content/es/news.json'
import notesEs from '../content/es/notes.json'
import aoQuestions from '../content/associate-foundations/questions.json'
import aoFlashcards from '../content/associate-foundations/flashcards.json'
import aoNotes from '../content/associate-foundations/notes.json'
import aoMeta from '../content/associate-foundations/meta.json'
import dvQuestions from '../content/developer-foundations/questions.json'
import dvFlashcards from '../content/developer-foundations/flashcards.json'
import dvNotes from '../content/developer-foundations/notes.json'
import dvMeta from '../content/developer-foundations/meta.json'
import afQuestions from '../content/architect-foundations/questions.json'
import afFlashcards from '../content/architect-foundations/flashcards.json'
import afNotes from '../content/architect-foundations/notes.json'
import afMeta from '../content/architect-foundations/meta.json'
import apQuestions from '../content/architect-professional/questions.json'
import apFlashcards from '../content/architect-professional/flashcards.json'
import apNotes from '../content/architect-professional/notes.json'
import apMeta from '../content/architect-professional/meta.json'

export interface Flashcard { id: string; front: string; back: string; kind: string; scope: string }
type Notes = { cheatSheet: string; notes: string }
type Meta = { exam: string; syncedAt: string; factsVerified: string | null; counts: { questions: number; flashcards: number; guide?: number } }
interface CertContent { questions: Question[]; flashcards: Flashcard[]; notes: Notes; meta: Meta }

const CONTENT: Record<string, CertContent> = {
  'associate-foundations': { questions: aoQuestions as Question[], flashcards: aoFlashcards, notes: aoNotes, meta: aoMeta },
  'developer-foundations': { questions: dvQuestions as Question[], flashcards: dvFlashcards, notes: dvNotes, meta: dvMeta },
  'architect-foundations': { questions: afQuestions as Question[], flashcards: afFlashcards, notes: afNotes, meta: afMeta },
  'architect-professional': { questions: apQuestions as Question[], flashcards: apFlashcards, notes: apNotes, meta: apMeta },
}
const contentOf = (cert: CertDef) => CONTENT[cert.id]

/** Every certification's bank: attempts are resolved by question id whatever certification is selected. */
export const repoQuestions: Question[] = CERTS.flatMap((c) => contentOf(c).questions)
export const questionsOf = (cert: CertDef) => contentOf(cert).questions
export const flashcardsOf = (cert: CertDef) => contentOf(cert).flashcards
export const metaOf = (cert: CertDef) => contentOf(cert).meta
export const guideCount = (cert: CertDef) => contentOf(cert).questions.filter((q) => q.source === 'guide').length

type News = { year: string; title: string; body: string }
const newsEn = newsJson as News[]

export type AiQuestion = Question & { reported?: boolean }

/** Every question by id: all banks plus generated ones (reported ones stay resolvable for history). */
export function questionIndex(ai: AiQuestion[]) {
  const map = new Map<string, AiQuestion>()
  for (const q of repoQuestions) map.set(q.id, q)
  for (const q of ai) map.set(q.id, q)
  return map
}

/** The part of an index that belongs to one certification. */
export function inCert(qs: Map<string, AiQuestion>, cert: CertDef) {
  const map = new Map<string, AiQuestion>()
  for (const [id, q] of qs) if (certOfQuestion(q) === cert.id) map.set(id, q)
  return map
}

export const groupOf = (q: Question) => q.dupGroup ?? q.id

// ---------- Spanish, falling back to English per item when missing or translated from older text ----------

type QText = { question: string; options: Record<string, string>; rationale: string; src?: string }
const qEs = questionsEs as Record<string, QText>
const fEs = flashcardsEs as Record<string, { front: string; back: string; src?: string }>
const nEs = notesEs as Record<string, Partial<Record<keyof Notes, { text: string; src?: string }>>>
const wEs = newsEs as Record<string, { title: string; body: string; src?: string }>
const own = <T,>(o: Record<string, T>, k: string) => (Object.hasOwn(o, k) ? o[k] : undefined)

/** The question in `lang`. Answer key and option letters always come from the English source. */
export function localize<Q extends Question>(q: Q, lang: Lang): Q {
  if (lang !== 'es') return q
  const t = own(qEs, q.id)
  if (!t || t.src !== questionHash(q)) return q
  const options: Question['options'] = {}
  for (const k of Object.keys(q.options) as (keyof Question['options'])[]) options[k] = t.options[k] ?? q.options[k]
  return { ...q, question: t.question, options, rationale: t.rationale }
}

export function flashcardText(c: Pick<Flashcard, 'id' | 'front' | 'back'>, lang: Lang) {
  const t = lang === 'es' ? own(fEs, c.id) : undefined
  return t && t.src === textHash(c.front + '\n' + c.back) ? { front: t.front, back: t.back } : { front: c.front, back: c.back }
}

export function notesFor(cert: CertDef, lang: Lang) {
  const en = contentOf(cert).notes
  const es = lang === 'es' ? own(nEs, cert.id) : undefined
  const pick = (k: keyof Notes) => (es?.[k] && es[k].src === textHash(en[k]) ? es[k].text : en[k])
  return { cheatSheet: pick('cheatSheet'), notes: pick('notes') }
}

export function newsFor(lang: Lang): News[] {
  if (lang !== 'es') return newsEn
  return newsEn.map((n) => {
    const t = own(wEs, textHash(n.title))
    return t && t.src === textHash(n.title + '\n' + n.body) ? { ...n, title: t.title, body: t.body } : n
  })
}
