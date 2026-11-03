// Study content. Each certification's questions, flashcards and notes (with their Spanish) arrive on demand as their own
// chunk: the one being studied before the app renders, the others in idle time. What is loaded is read synchronously.
import { useSyncExternalStore } from 'react'
import { questionHash, textHash, type Question } from '../shared/exam'
import { CERTS, certOfQuestion, type CertDef } from '../shared/certs'
import type { Lang } from '../i18n'
import newsJson from '../content/news.json'
import newsEs from '../content/es/news.json'
import guideJson from '../content/guide.json'
import guideEs from '../content/es/guide.json'
import aoMeta from '../content/associate-foundations/meta.json'
import dvMeta from '../content/developer-foundations/meta.json'
import afMeta from '../content/architect-foundations/meta.json'
import apMeta from '../content/architect-professional/meta.json'
import type { Guide } from '../shared/guide'

export interface Flashcard { id: string; front: string; back: string; kind: string; scope: string }
type Notes = { cheatSheet: string; notes: string }
type Meta = { exam: string; syncedAt: string; factsVerified: string | null; counts: { questions: number; flashcards: number; guide?: number; app?: number } }
type QText = { question: string; options: Record<string, string>; rationale: string; src?: string }
type Text = { text: string; src?: string }
interface CertContent {
  questions: Question[]
  flashcards: Flashcard[]
  notes: Notes
  es: { questions: Record<string, QText>; flashcards: Record<string, { front: string; back: string; src?: string }>; notes: Partial<Record<keyof Notes, Text>> }
}

// Static, tiny: what the switcher, Exams and Settings show before a certification's content is there
const META: Record<string, Meta> = { 'associate-foundations': aoMeta, 'developer-foundations': dvMeta, 'architect-foundations': afMeta, 'architect-professional': apMeta }
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  'associate-foundations': () => import('../content/associate-foundations/index'),
  'developer-foundations': () => import('../content/developer-foundations/index'),
  'architect-foundations': () => import('../content/architect-foundations/index'),
  'architect-professional': () => import('../content/architect-professional/index'),
}

const loaded = new Map<string, CertContent>()
const pending = new Map<string, Promise<void>>()
let version = 0
const listeners = new Set<() => void>()

export const isLoaded = (id: string) => loaded.has(id)

/** Loads a certification's content once; a failed load (offline, a chunk gone after a deploy) can be retried. */
export function ensureCert(id: string): Promise<void> {
  if (loaded.has(id)) return Promise.resolve()
  if (!Object.hasOwn(LOADERS, id)) return Promise.reject(new Error('unknown certification'))
  let p = pending.get(id)
  if (!p) {
    p = LOADERS[id]().then((m) => {
      loaded.set(id, m.default as CertContent)
      version++
      listeners.forEach((l) => l())
    }).finally(() => pending.delete(id))
    pending.set(id, p)
  }
  return p
}
export const ensureAll = () => Promise.all(CERTS.map((c) => ensureCert(c.id))).then(() => undefined)

/** Re-renders when a certification's content arrives. */
export function useContentVersion() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => version)
}

const contentOf = (id: string) => loaded.get(id)

/** Every loaded bank: attempts are resolved by question id whatever certification is selected. */
export const repoQuestions = (): Question[] => CERTS.flatMap((c) => contentOf(c.id)?.questions ?? [])
export const questionsOf = (cert: CertDef) => contentOf(cert.id)?.questions ?? []
export const flashcardsOf = (cert: CertDef) => contentOf(cert.id)?.flashcards ?? []
export const metaOf = (cert: CertDef) => META[cert.id]
export const guideCount = (cert: CertDef) => META[cert.id].counts.guide ?? 0

type News = { year: string; title: string; body: string }
const newsEn = newsJson as News[]

export type AiQuestion = Question & { reported?: boolean }

/** Every question by id: the loaded banks plus generated ones (reported ones stay resolvable for history). */
export function questionIndex(ai: AiQuestion[]) {
  const map = new Map<string, AiQuestion>()
  for (const q of repoQuestions()) map.set(q.id, q)
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

const own = <T,>(o: Record<string, T> | undefined, k: string) => (o && Object.hasOwn(o, k) ? o[k] : undefined)
const wEs = newsEs as Record<string, { title: string; body: string; src?: string }>
const gEs = guideEs as Record<string, Text>

/** The question in `lang`. Answer key and option letters always come from the English source. */
export function localize<Q extends Question>(q: Q, lang: Lang): Q {
  if (lang !== 'es') return q
  const t = own(contentOf(certOfQuestion(q))?.es.questions, q.id)
  if (!t || t.src !== questionHash(q)) return q
  const options: Question['options'] = {}
  for (const k of Object.keys(q.options) as (keyof Question['options'])[]) options[k] = t.options[k] ?? q.options[k]
  return { ...q, question: t.question, options, rationale: t.rationale }
}

/** A card in `lang`. Shared cards sit in every certification's deck, so any loaded one has the translation. */
export function flashcardText(c: Pick<Flashcard, 'id' | 'front' | 'back'>, lang: Lang) {
  if (lang === 'es') {
    for (const content of loaded.values()) {
      const t = own(content.es.flashcards, c.id)
      if (t && t.src === textHash(c.front + '\n' + c.back)) return { front: t.front, back: t.back }
    }
  }
  return { front: c.front, back: c.back }
}

export function notesFor(cert: CertDef, lang: Lang): Notes {
  const content = contentOf(cert.id)
  if (!content) return { cheatSheet: '', notes: '' }
  const en = content.notes
  const es = lang === 'es' ? content.es.notes : undefined
  const pick = (k: keyof Notes) => { const t = es?.[k]; return t && t.src === textHash(en[k]) ? t.text : en[k] }
  return { cheatSheet: pick('cheatSheet'), notes: pick('notes') }
}

/** The study repo's guide pages: confusable pairs, courses, study plan and official videos (common to every certification). */
export const guide = guideJson as Guide
/** A guide text in `lang`, or its English when the Spanish is missing or was translated from older text. */
export function guideText(key: string, en: string, lang: Lang) {
  const t = lang === 'es' ? own(gEs, key) : undefined
  return t && t.src === textHash(en) ? t.text : en
}

export function newsFor(lang: Lang): News[] {
  if (lang !== 'es') return newsEn
  return newsEn.map((n) => {
    const t = own(wEs, textHash(n.title))
    return t && t.src === textHash(n.title + '\n' + n.body) ? { ...n, title: t.title, body: t.body } : n
  })
}
