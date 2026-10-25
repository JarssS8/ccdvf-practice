import { useEffect, useMemo, useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import { useQuestions } from '../App'
import { Empty } from '../components/ui'
import { deck, NEW_PER_DAY, preview, queue, schedule } from '../lib/srs'
import { dispatch, now, useStore } from '../lib/store'

const GRADES: { r: Grade; label: string; key: string }[] = [
  { r: Rating.Again, label: 'Otra vez', key: '1' },
  { r: Rating.Hard, label: 'Difícil', key: '2' },
  { r: Rating.Good, label: 'Bien', key: '3' },
  { r: Rating.Easy, label: 'Fácil', key: '4' },
]

const ORIGIN: Record<string, string> = { repo: 'Del repo', missed: 'Pregunta que fallaste', added: 'Añadida por ti' }

export default function Cards() {
  const { data } = useStore()
  const qs = useQuestions()
  const [shown, setShown] = useState(false)
  const cards = useMemo(() => deck(data, qs), [data, qs])
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
          <h1 className="h-page">Flashcards</h1>
          <p className="muted">Repetición espaciada (FSRS). Las preguntas que fallas entran solas en el mazo.</p>
        </div>
        <p className="small mono muted">{q.due.length} para repasar · {q.fresh.length} nuevas hoy · {cards.length} en el mazo</p>
      </div>

      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }} className="stack">
        {!current ? (
          <div className="card">
            <Empty icon="check" title="Nada pendiente por hoy">
              {q.newTotal > 0 ? `Quedan ${q.newTotal} tarjetas nuevas; entran ${NEW_PER_DAY} al día para no saturarte.` : 'Has visto todo el mazo. Vuelve mañana o haz un drill.'}
            </Empty>
          </div>
        ) : (
          <>
            <article className="card flashcard" aria-live="polite">
              <span className="chip" style={{ alignSelf: 'center' }}>{ORIGIN[current.origin]}{s.byCard.has(current.id) ? '' : ' · nueva'}</span>
              <p style={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>{current.front}</p>
              {shown && <p className="back">{current.back}</p>}
            </article>
            {!shown ? (
              <button className="btn btn-primary btn-block" onClick={() => setShown(true)}>Mostrar respuesta <span className="kbd desktop-only" style={{ color: 'var(--ink)' }}>Espacio</span></button>
            ) : (
              <div className="grades" role="group" aria-label="¿Cómo de bien la sabías?">
                {GRADES.map((g) => (
                  <button key={g.r} className={`btn ${g.r === Rating.Good ? 'btn-primary' : ''}`} onClick={() => grade(g.r)}>
                    {g.label}<span style={g.r === Rating.Good ? { color: 'inherit', opacity: 0.8 } : undefined}>{intervals?.[g.r]}</span>
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
