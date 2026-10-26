import { useState } from 'react'
import { Icon } from '../components/Icon'
import { activeAttempt, discardAttempt, startAttempt } from '../lib/actions'
import { attemptTitle, MODES } from '../lib/engine'
import { useStore } from '../lib/store'
import type { Mode } from '../lib/types'

const TONE: Partial<Record<Mode, string>> = { full: 'tile-blue', quick: 'tile-lime', guide: 'tile-lilac', missed: 'tile-pink', flagged: 'tile-sun' }

const SECTIONS: { title: string; note: string; modes: Mode[] }[] = [
  { title: 'Condiciones de examen', note: 'Reloj corriendo, sin pausa y sin ver respuestas hasta entregar. Opciones barajadas en cada intento.', modes: ['full', 'quick'] },
  { title: 'Exámenes del repo', note: 'Los tres mocks de developer-foundations. A partir de la segunda vez mides memoria, no preparación: cuentan como repaso.', modes: ['repo-mock-1', 'repo-mock-2', 'repo-mock-3', 'guide'] },
  { title: 'Repaso', note: 'Corrección al momento y explicación de cada respuesta.', modes: ['missed', 'flagged'] },
]

export default function Exams() {
  const { data } = useStore()
  const [err, setErr] = useState('')
  const active = activeAttempt()
  const count = (m: Mode) => Object.values(data.attempts).filter((a) => a.mode === m && a.status === 'submitted').length

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="h-page">Exámenes</h1>
        <p className="muted">Los mocks completos eligen primero las preguntas que no has visto nunca, para que la estimación no se infle.</p>
      </div>
      {active && (
        <div className="callout callout-info row-between">
          <span><strong>{attemptTitle(active)}</strong> sigue abierto.</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => { if (confirm('¿Descartar este intento? No contará en tu historial.')) discardAttempt(active.id) }}>Descartar</button>
            <a className="btn btn-primary btn-sm" href={`#/exam/${active.id}`}>Continuar</a>
          </span>
        </div>
      )}
      {err && <p role="alert" className="callout callout-bad">{err}</p>}
      {SECTIONS.map((s) => (
        <section key={s.title} className="stack" style={{ gap: 14 }} aria-labelledby={`s-${s.modes[0]}`}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 id={`s-${s.modes[0]}`} className="h-section">{s.title}</h2>
            <p className="small muted">{s.note}</p>
          </div>
          <div className="grid-modes">
            {s.modes.map((m) => (
              <button key={m} type="button" className={`tile-link ${TONE[m] ?? ''}`} onClick={() => setErr(startAttempt(m) ?? '')}>
                <span className="row-between" style={{ width: '100%' }}>
                  <strong>{MODES[m].title}</strong>
                  {count(m) > 0 && <span className="chip">{count(m)} hecho{count(m) === 1 ? '' : 's'}</span>}
                </span>
                <span className="small muted" style={{ minHeight: 42 }}>{MODES[m].detail}</span>
                <span className="row small" style={{ fontWeight: 700, gap: 6, marginTop: 'auto' }}>Empezar<Icon name="arrowRight" size={16} /></span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
