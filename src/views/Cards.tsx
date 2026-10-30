import { useEffect, useMemo, useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import { useQuestions } from '../App'
import { Empty } from '../components/ui'
import { deck, NEW_PER_DAY, preview, queue, schedule } from '../lib/srs'
import { dispatch, now, useStore } from '../lib/store'
import { useLang, useT } from '../i18n'

// Labels in t.cardsView.grades, same order
const GRADES: { r: Grade; key: string }[] = [
  { r: Rating.Again, key: '1' },
  { r: Rating.Hard, key: '2' },
  { r: Rating.Good, key: '3' },
  { r: Rating.Easy, key: '4' },
]

export default function Cards() {
  const { data } = useStore()
  const t = useT()
  const lang = useLang()
  const qs = useQuestions()
  const [shown, setShown] = useState(false)
  const cards = useMemo(() => deck(data, qs, lang), [data, qs, lang])
  const s = useMemo(() => schedule(data, new Date(now())), [data])
  const q = useMemo(() => queue(cards, s), [cards, s])
  const current = q.due[0] ?? q.fresh[0]
  const intervals = current ? preview(current.id, s) : null

  useEffect(() => setShown(false), [current?.id])

  const grade = (r: Grade) => {
    if (!current) return
    dispatch({ type: 'review', id: crypto.randomUUID(), cardId: current.id, rating: r, reviewedAt: now() })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || !current) return
      if (e.key === ' ' && !shown) { e.preventDefault(); setShown(true) }
      const g = GRADES.find((x) => x.key === e.key)
      if (g && shown) { e.preventDefault(); grade(g.r) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="h-page">{t.cardsView.title}</h1>
          <p className="muted">{t.cardsView.intro}</p>
        </div>
        <p className="small mono muted">{t.cardsView.counts(q.due.length, q.fresh.length, cards.length)}</p>
      </div>

      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }} className="stack">
        {!current ? (
          <div className="card">
            <Empty icon="check" title={t.cardsView.nothing}>
              {q.newTotal > 0 ? t.cardsView.newLeft(q.newTotal, NEW_PER_DAY) : t.cardsView.allSeen}
            </Empty>
          </div>
        ) : (
          <>
            <article className="card flashcard" aria-live="polite">
              <span className="chip" style={{ alignSelf: 'center' }}>{t.cardsView.origin[current.origin]}{s.byCard.has(current.id) ? '' : t.cardsView.newTag}</span>
              <p style={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>{current.front}</p>
              {shown && <p className="back">{current.back}</p>}
            </article>
            {!shown ? (
              <button className="btn btn-primary btn-block" onClick={() => setShown(true)}>{t.cardsView.show} <span className="kbd desktop-only" style={{ color: 'var(--ink)' }}>{t.cardsView.space}</span></button>
            ) : (
              <div className="grades" role="group" aria-label={t.cardsView.how}>
                {GRADES.map((g, gi) => (
                  <button key={g.r} className={`btn ${g.r === Rating.Good ? 'btn-primary' : ''}`} onClick={() => grade(g.r)}>
                    {t.cardsView.grades[gi]}<span style={g.r === Rating.Good ? { color: 'inherit', opacity: 0.8 } : undefined}>{intervals?.[g.r]}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
