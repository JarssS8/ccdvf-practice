import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Meter, ScaleBar, ZoneChip } from '../components/ui'
import { useQuestions } from '../App'
import { news } from '../lib/content'
import { activeAttempt, discardAttempt, startAttempt } from '../lib/actions'
import { attemptTitle, domainStats, exposures, fmtDate, fmtDuration, MODES, pct, readiness } from '../lib/engine'
import { deck, queue, schedule } from '../lib/srs'
import { now, useStore } from '../lib/store'
import { EXAM } from '../shared/exam'

export default function Home() {
  const { data } = useStore()
  const qs = useQuestions()
  const [err, setErr] = useState('')

  const exp = useMemo(() => exposures(data, qs), [data, qs])
  const ready = useMemo(() => readiness(exp, qs), [exp, qs])
  const domains = useMemo(() => domainStats(exp, qs), [exp, qs])
  const cards = useMemo(() => { const s = schedule(data, new Date(now())); const q = queue(deck(data, qs), s); return q.due.length + q.fresh.length }, [data, qs])
  const submitted = Object.values(data.attempts).filter((a) => a.status === 'submitted').sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
  const active = activeAttempt()
  const examDate = data.settings.exam_date?.value
  const daysLeft = examDate ? Math.ceil((new Date(examDate + 'T09:00').getTime() - now()) / 864e5) : null
  const fullDone = submitted.some((a) => a.mode === 'full')

  const unexplored = domains.filter((d) => d.first.n === 0).sort((a, b) => b.weight - a.weight)[0]
  const weakest = domains.filter((d) => d.first.n >= 3).sort((a, b) => a.first.c / a.first.n - b.first.c / b.first.n)[0]
  const focus = unexplored ?? (weakest && weakest.first.c / weakest.first.n < 0.8 ? weakest : undefined)

  const start = (mode: Parameters<typeof startAttempt>[0], domain?: string) => setErr(startAttempt(mode, domain) ?? '')

  return (
    <>
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <div className="stack" style={{ gap: 4 }}>
          <p className="small muted" style={{ fontWeight: 500 }}>{EXAM.name} · {EXAM.code}</p>
          <h1 className="h-page">{active ? 'Tienes un examen a medias.' : fullDone ? 'Sigue afinando.' : 'Toca tu primer mock completo.'}</h1>
        </div>
        <p className="small muted">
          {daysLeft != null && daysLeft >= 0
            ? <><strong style={{ color: 'var(--ink)' }}>{daysLeft === 0 ? 'Examen hoy' : `Faltan ${daysLeft} días`}</strong> · </>
            : <><a href="#/settings">Añade la fecha de tu examen</a> · </>}
          {EXAM.items} preguntas · {EXAM.minutes} min · corte {EXAM.passScaled}
        </p>
      </div>

      {err && <p role="alert" className="callout callout-bad">{err}</p>}

      <section className="grid-auto" aria-label="Resumen">
        <div className="card hero">
          <div className="eyebrow row" style={{ color: 'var(--hero-muted)', gap: 8 }}><Icon name="play" size={16} />Siguiente paso</div>
          {active ? (
            <>
              <div className="stack" style={{ gap: 6 }}>
                <h2 style={{ fontSize: 26 }}>{attemptTitle(active)}</h2>
                <p className="muted">
                  {Object.values(data.answers).filter((a) => a.attemptId === active.id && a.choice.length).length} de {active.questionIds.length} respondidas
                  {active.deadline ? ` · quedan ${fmtDuration(active.deadline - now())}. El reloj no se para.` : ''}
                </p>
              </div>
              <div className="row">
                <a className="btn btn-hero" href={`#/exam/${active.id}`}>Continuar<Icon name="arrowRight" size={18} /></a>
                <button className="btn btn-hero-ghost" onClick={() => { if (confirm('¿Descartar este intento? No contará en tu historial.')) discardAttempt(active.id) }}>Descartar</button>
              </div>
            </>
          ) : (
            <>
              <div className="stack" style={{ gap: 6 }}>
                <h2 style={{ fontSize: 26 }}>{fullDone && focus ? `Drill: ${focus.name}` : 'Mock completo'}</h2>
                <p className="muted">
                  {fullDone && focus
                    ? focus.first.n === 0 ? 'Aún no has visto preguntas de este dominio.' : `Tu primer intento aquí va al ${pct(focus.first.c, focus.first.n)} %.`
                    : `${EXAM.items} preguntas repartidas por el peso de cada dominio, ${EXAM.minutes} min y sin ver respuestas hasta el final.`}
                </p>
              </div>
              <div className="row">
                {fullDone && focus
                  ? <button className="btn btn-hero" onClick={() => start('drill', focus.name)}>Empezar drill<Icon name="arrowRight" size={18} /></button>
                  : <button className="btn btn-hero" onClick={() => start('full')}>Empezar mock<Icon name="arrowRight" size={18} /></button>}
                <button className="btn btn-hero-ghost" onClick={() => start('quick')}>Mock rápido · 15 preg.</button>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="row-between">
            <h2 className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>Preparación estimada</h2>
            {ready && <ZoneChip zone={ready.zone} />}
          </div>
          {ready ? (
            <>
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                <span className="big-number">{ready.scaledLo}–{ready.scaledHi}</span>
                <span className="mono muted">/ 1000</span>
              </div>
              <ScaleBar est={ready} />
              <p className="small muted">
                {pct(Math.round(ready.p * ready.n), ready.n)} % en tu primer intento de {ready.n} preguntas, ponderado por dominio. Rango al 95 %; la conversión a escala real no es pública, así que es una aproximación lineal.
              </p>
            </>
          ) : (
            <>
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}><span className="big-number">—</span><span className="mono muted">/ 1000</span></div>
              <p className="small muted">Se calcula con tus primeros intentos en preguntas del banco. El diagnóstico del 8 de octubre no cuenta: sus respuestas seguían el patrón A-B-C-D.</p>
            </>
          )}
        </div>
      </section>

      <section aria-label="Modos de práctica" className="grid-modes">
        <a className="tile-link" href="#/exams"><span className="icon"><Icon name="exam" size={24} /></span><strong>Exámenes</strong><span className="small muted">Mock completo, rápido, los 3 del repo y los ejemplos de la guía</span></a>
        <a className="tile-link" href="#/domains"><span className="icon"><Icon name="target" size={24} /></span><strong>Drill por dominio</strong><span className="small muted">10 preguntas con corrección al momento</span></a>
        <a className="tile-link" href="#/cards"><span className="icon"><Icon name="cards" size={24} /></span><strong>Flashcards</strong><span className="small muted">{cards ? `${cards} para hoy` : 'Nada pendiente hoy'} · repetición espaciada</span></a>
        <a className="tile-link" href="#/domains"><span className="icon"><Icon name="sparkle" size={24} /></span><strong>Preguntas nuevas con IA</strong><span className="small muted">{data.ai.enabled ? `${data.aiQuestions.filter((q) => !q.reported).length} en tu banco IA` : 'Sin configurar'}</span></a>
      </section>

      <div className="split">
        <section className="card main" aria-labelledby="dom-h">
          <div className="row-between">
            <h2 id="dom-h" className="h-section">Dominio por dominio</h2>
            <span className="tiny muted">Primer intento · por peso en el examen</span>
          </div>
          {domains.map((d) => (
            <div key={d.name} className="stack" style={{ gap: 6 }}>
              <div className="row-between" style={{ flexWrap: 'nowrap' }}>
                <span style={{ fontWeight: 500 }}>{d.name}</span>
                <span className="mono small" style={{ whiteSpace: 'nowrap' }}>{d.first.n ? `${pct(d.first.c, d.first.n)} % · ${d.first.c}/${d.first.n}` : 'sin datos'}</span>
              </div>
              <Meter value={d.first.n ? pct(d.first.c, d.first.n) : 0} bad={d.first.n >= 3 && d.first.c / d.first.n < 0.69} label={`${d.name}: ${d.first.n ? pct(d.first.c, d.first.n) + ' %' : 'sin datos'}`} />
              <span className="tiny muted">Peso {d.weight.toLocaleString('es-ES')} %{d.first.n > 0 && d.first.n < 5 ? ' · pocas preguntas, poco fiable' : ''}</span>
            </div>
          ))}
        </section>

        <aside className="side">
          <section className="card" aria-labelledby="hist-h">
            <div className="row-between"><h2 id="hist-h" className="h-section" style={{ fontSize: 19 }}>Historial</h2><a href="#/progress" className="small">Ver todo</a></div>
            {submitted.length === 0 && <p className="small muted">Aún no has terminado ningún intento.</p>}
            {submitted.slice(0, 5).map((a) => (
              <a key={a.id} href={`#/results/${a.id}`} className="list-item">
                <span className={`badge-icon ${a.result && a.result.correct / a.result.total >= 0.69 ? 'ok' : 'bad'}`}><Icon name={a.result && a.result.correct / a.result.total >= 0.69 ? 'check' : 'x'} size={18} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{attemptTitle(a)}</span>
                  <span className="tiny muted">{fmtDate(a.submittedAt ?? a.startedAt)} · {a.result?.total} preguntas</span>
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>{a.result ? `${pct(a.result.correct, a.result.total)} %` : '—'}</span>
              </a>
            ))}
          </section>

          {focus && (
            <section className="callout callout-bad" aria-labelledby="gap-h">
              <strong id="gap-h">{focus.first.n === 0 ? 'Hueco sin cubrir' : 'Punto débil'}</strong>
              <p className="small"><strong style={{ color: 'inherit' }}>{focus.name}</strong> · pesa {focus.weight.toLocaleString('es-ES')} %. {focus.first.n === 0 ? 'Todavía no has respondido nada de aquí.' : `Primer intento al ${pct(focus.first.c, focus.first.n)} %.`}</p>
              <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => start('drill', focus.name)}>Drill de {MODES.drill.items}</button>
            </section>
          )}

          <section className="card" aria-labelledby="news-h">
            <div className="row-between"><h2 id="news-h" className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>Novedades del programa</h2><a href="#/notes" className="small">Más</a></div>
            {news.slice(0, 2).map((n) => (
              <p key={n.title} className="small"><strong>{n.title.split(':')[0]} {n.year}</strong> · {n.title.split(':').slice(1).join(':').trim()}</p>
            ))}
          </section>
        </aside>
      </div>
    </>
  )
}
