import { useQuestions } from '../App'
import { Icon } from '../components/Icon'
import { asDisplayed, Explanation, QuestionCard } from '../components/QuestionCard'
import { Tutor } from '../components/Tutor'
import { attemptTitle, isCorrect } from '../lib/engine'
import { go } from '../lib/router'
import { ADDED } from '../lib/srs'
import { dispatch, now, useStore } from '../lib/store'

export default function ReviewView({ id, index }: { id: string; index: number }) {
  const { data } = useStore()
  const qs = useQuestions()
  const a = data.attempts[id]
  if (!a) return <main className="page"><p>Intento no encontrado.</p><a className="btn" href="#/progress">Progreso</a></main>
  const total = a.questionIds.length
  const i = Math.max(0, Math.min(total - 1, index))
  const qid = a.questionIds[i]
  const q = qs.get(qid)
  const ans = data.answers[`${a.id}|${qid}`]
  const choice = ans?.choice ?? []
  const ok = q ? isCorrect(q, choice) : false
  const inDeck = data.reviews.some((r) => r.cardId === 'q:' + qid) || !ok
  const reported = q && 'reported' in q && q.reported

  return (
    <div className="exam">
      <header className="exam-head">
        <div className="exam-head-inner">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <a href={`#/results/${a.id}`} className="btn btn-ghost icon-btn" aria-label="Volver a resultados" style={{ border: '1px solid var(--line)' }}><Icon name="chevronLeft" /></a>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tiny muted" style={{ fontWeight: 500 }}>Revisión · {attemptTitle(a)}</div>
              <div style={{ fontWeight: 600 }}>Pregunta {i + 1} de {total}</div>
            </div>
            <span className={`chip ${!choice.length ? '' : ok ? 'chip-ok' : 'chip-bad'}`}>
              <Icon name={ok ? 'check' : 'x'} size={14} stroke={2.4} />{!choice.length ? 'En blanco' : ok ? 'Acertada' : 'Fallada'}
            </span>
          </div>
        </div>
      </header>

      <main className="exam-body" id="main">
        {!q ? <p>Esta pregunta ya no está disponible.</p> : (
          <>
            <QuestionCard q={q} seed={a.seed} selected={choice} reveal showDomain />
            <Explanation q={q} seed={a.seed} />
            <div className="row">
              <button className="btn btn-sm" disabled={inDeck} onClick={() => dispatch({ type: 'review', id: crypto.randomUUID(), cardId: 'q:' + qid, rating: ADDED, reviewedAt: now() })}>
                <Icon name="cards" size={16} />{inDeck ? 'Ya está en tus flashcards' : 'Añadir a flashcards'}
              </button>
              {q.source === 'ai' && (
                <button className="btn btn-sm btn-danger" disabled={!!reported} onClick={() => dispatch({ type: 'aiq.report', id: q.id })}>
                  <Icon name="alert" size={16} />{reported ? 'Reportada: no volverá a salir' : 'Reportar: la clave está mal'}
                </button>
              )}
            </div>
            <div className="card card-tight"><Tutor {...asDisplayed(q, a.seed, choice)} storeKey={`${a.id}|${q.id}`} /></div>
          </>
        )}
      </main>

      <footer className="exam-foot">
        <div className="exam-foot-inner">
          <button className="btn" onClick={() => go(`/review/${a.id}/${i - 1}`, true)} disabled={i === 0}><Icon name="chevronLeft" size={18} />Anterior</button>
          <span style={{ flex: 1 }} />
          {i < total - 1
            ? <button className="btn btn-primary" onClick={() => go(`/review/${a.id}/${i + 1}`, true)}>Siguiente<Icon name="chevronRight" size={18} /></button>
            : <a className="btn btn-primary" href={`#/results/${a.id}`}>Terminar revisión</a>}
        </div>
      </footer>
    </div>
  )
}
