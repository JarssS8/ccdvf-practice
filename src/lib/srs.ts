// FSRS scheduling replayed from the append-only review log, so every device converges.
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs'
import { flashcardText, localize, repoFlashcards, type AiQuestion } from './content'
import type { Lang } from '../i18n'
import { isCorrect } from './engine'
import type { Data } from './store'

const scheduler = fsrs({ enable_fuzz: false, request_retention: 0.9 })
export const ADDED = 0 // review-log marker: card added to the deck by hand
export const NEW_PER_DAY = 15

export interface StudyCard { id: string; front: string; back: string; origin: 'repo' | 'missed' | 'added' }

export function deck(data: Data, qs: Map<string, AiQuestion>, lang: Lang): StudyCard[] {
  const cards: StudyCard[] = repoFlashcards.map((c) => ({ id: c.id, ...flashcardText(c, lang), origin: 'repo' }))
  const addedIds = new Set(data.reviews.filter((r) => r.rating === ADDED).map((r) => r.cardId))
  const missed = new Set<string>()
  for (const a of Object.values(data.answers)) {
    const q = qs.get(a.qid)
    if (q && a.choice.length && data.attempts[a.attemptId]?.status === 'submitted' && !isCorrect(q, a.choice)) missed.add(q.id)
  }
  for (const qid of new Set([...missed, ...[...addedIds].filter((id) => id.startsWith('q:')).map((id) => id.slice(2))])) {
    const orig = qs.get(qid)
    if (!orig) continue
    const q = localize(orig, lang)
    const key = q.answer.map((l) => `${l}. ${q.options[l]}`).join('\n')
    cards.push({ id: 'q:' + q.id, front: q.question, back: `${key}\n\n${q.rationale}`, origin: missed.has(qid) ? 'missed' : 'added' })
  }
  return cards
}

export function schedule(data: Data, at: Date) {
  const byCard = new Map<string, Card>()
  const firstSeen = new Map<string, number>()
  for (const r of [...data.reviews].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
    if (r.rating === ADDED) continue
    const prev = byCard.get(r.cardId) ?? createEmptyCard<Card>(new Date(r.reviewedAt))
    byCard.set(r.cardId, scheduler.next(prev, new Date(r.reviewedAt), r.rating as Grade).card)
    if (!firstSeen.has(r.cardId)) firstSeen.set(r.cardId, r.reviewedAt)
  }
  const dayStart = new Date(at); dayStart.setHours(0, 0, 0, 0)
  const newToday = [...firstSeen.values()].filter((t) => t >= dayStart.getTime()).length
  return { byCard, newToday, at }
}

export function queue(cards: StudyCard[], s: ReturnType<typeof schedule>) {
  const due = cards.filter((c) => { const k = s.byCard.get(c.id); return k && k.due <= s.at }).sort((a, b) => +s.byCard.get(a.id)!.due - +s.byCard.get(b.id)!.due)
  // Missed questions first among new cards: they are where the marks are being lost
  const fresh = cards.filter((c) => !s.byCard.has(c.id)).sort((a, b) => (a.origin === 'repo' ? 1 : 0) - (b.origin === 'repo' ? 1 : 0))
  const newAllowed = Math.max(0, NEW_PER_DAY - s.newToday)
  return { due, fresh: fresh.slice(0, newAllowed), newTotal: fresh.length }
}

export function preview(cardId: string, s: ReturnType<typeof schedule>) {
  const card = s.byCard.get(cardId) ?? createEmptyCard<Card>(s.at)
  const p = scheduler.repeat(card, s.at)
  const fmt = (d: Date) => {
    const mins = Math.round((+d - +s.at) / 60000)
    if (mins < 60) return `${Math.max(1, mins)} min`
    const h = Math.round(mins / 60)
    if (h < 24) return `${h} h`
    const days = Math.round(h / 24)
    return days < 30 ? `${days} d` : `${Math.round(days / 30)} mes`
  }
  return {
    [Rating.Again]: fmt(p[Rating.Again].card.due),
    [Rating.Hard]: fmt(p[Rating.Hard].card.due),
    [Rating.Good]: fmt(p[Rating.Good].card.due),
    [Rating.Easy]: fmt(p[Rating.Easy].card.due),
  }
}
