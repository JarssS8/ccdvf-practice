import { useState } from 'react'
import { useQuestions } from '../App'
import { Icon } from '../components/Icon'
import { Empty, Meter, ScaleBar, ZoneChip } from '../components/ui'
import { startAttempt } from '../lib/actions'
import { attemptTitle, estimate, fmtDate, fmtDuration, isCorrect, pct } from '../lib/engine'
import { useStore } from '../lib/store'
import { DOMAINS, EXAM } from '../shared/exam'

export default function Results({ id, timeout }: { id: string; timeout?: boolean }) {
  const { data } = useStore()
  const qs = useQuestions()
  const [err, setErr] = useState('')
  const a = data.attempts[id]
  if (!a) return <Empty icon="alert" title="Intento no encontrado">Puede que aún se esté sincronizando.</Empty>
  if (a.status !== 'submitted' || !a.result) {
    return <div className="stack"><h1 className="h-page">Intento en curso</h1><a className="btn btn-primary" href={`#/exam/${a.id}`} style={{ alignSelf: 'flex-start' }}>Continuar</a></div>
  }
  const r = a.result
  const timedOut = timeout || (!!a.deadline && a.submittedAt === a.deadline)
  const repeat = r.fresh < r.total
  const est = estimate(r.correct, r.total)
  const exam = !a.feedback
  const rows = a.questionIds.map((qid, i) => {
    const q = qs.get(qid)
    const ans = data.answers[`${a.id}|${qid}`]
    return { i, q, ans, ok: q ? isCorrect(q, ans?.choice) : false }
  })
  const failed = rows.filter((x) => !x.ok).length
  const misses = rows.filter((x) => !x.ok || x.ans?.flagged)
  const perQ = r.total ? r.timeUsedMs / r.total : 0

  // The headline says in plain words where you stand
  const headline = !exam || !est ? 'Terminado.'
    : est.zone === 'likely' ? 'Vas por buen camino.'
    : est.zone === 'below' ? 'Aún te falta margen.'
    : 'Estás en el límite.'

  // Weakest first, so the list reads as "what to work on"
  const domainRows = DOMAINS.filter((d) => r.byDomain[d.name])
    .map((d) => ({ ...d, t: r.byDomain[d.name] }))
    .sort((x, y) => (1 - y.t.c / y.t.n) * y.weight - (1 - x.t.c / x.t.n) * x.weight)

  return (
    <>
      <div className="row">
        <a href="#/progress" className="btn btn-ghost btn-sm" style={{ paddingLeft: 8 }}><Icon name="chevronLeft" size={18} />Progreso</a>
        <span className="small muted">{attemptTitle(a)} · {fmtDate(a.submittedAt ?? a.startedAt)} · {r.total} preguntas</span>
      </div>

      {timedOut && <p className="callout callout-bad" role="status"><strong>Tiempo agotado.</strong> Se entregó con las respuestas guardadas antes del final.</p>}

      <section aria-labelledby="score-h" className="stack" style={{ gap: 18, maxWidth: 760, padding: '8px 4px' }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <h1 id="score-h" className="h-page" style={{ fontSize: 'clamp(38px, 7vw, 60px)' }}>{headline}</h1>
          {est && exam && <ZoneChip zone={est.zone} />}
        </div>
        <p style={{ fontSize: 18, color: 'var(--ink-2)' }}>
          Acertaste <strong style={{ color: 'var(--ink)' }}>{r.correct} de {r.total}</strong> ({pct(r.correct, r.total)} %)
          {est && exam && <>. Equivale a unos <strong style={{ color: 'var(--ink)' }}>{est.scaledLo}–{est.scaledHi}</strong> sobre {EXAM.scaleMax}, y el corte es {EXAM.passScaled}.</>}
          {!exam && '. En un drill ves la corrección al momento, así que no se estima nota.'}
        </p>
        {est && exam && (
          <>
            <ScaleBar est={est} />
            <p className="small muted">
              {r.total < 30 ? 'Con tan pocas preguntas el rango es muy ancho. ' : 'El rango es amplio porque el número de preguntas da poca precisión; cuantas más hagas, más se estrecha. '}
              La conversión a la escala real es aproximada (95 %).
              {repeat ? ` ${r.total - r.fresh} de ${r.total} ya las habías visto: sin ellas, ${r.fresh ? `${pct(r.freshCorrect, r.fresh)} % en ${r.fresh} nuevas` : 'ninguna era nueva'}, y solo las nuevas cuentan para tu preparación.` : ` Las ${r.total} eran nuevas para ti, así que este resultado cuenta entero.`}
            </p>
          </>
        )}
      </section>

      {err && <p role="alert" className="callout callout-bad">{err}</p>}

      <div className="bento">
        {failed > 0 ? (
          <section className="tile tile-blue span-2" aria-labelledby="next-h" style={{ justifyContent: 'space-between', gap: 20 }}>
            <div className="stack" style={{ gap: 8 }}>
              <p className="eyebrow">Lo que más sube la nota ahora</p>
              <h2 id="next-h" className="h-tile">Repasa lo que fallaste</h2>
              <p className="muted">Cada fallada entra también en tus tarjetas para no volver a fallarla.</p>
            </div>
            <div className="row">
              <button className="btn btn-hero" onClick={() => setErr(startAttempt('missed', undefined, a.id) ?? '')}>Repasar las {failed} falladas de este intento<Icon name="arrowRight" size={18} /></button>
              <a className="btn btn-hero-ghost" href={`#/review/${a.id}/0`}>Ver todas</a>
            </div>
          </section>
        ) : (
          <section className="tile tile-lime span-2" style={{ justifyContent: 'space-between', gap: 16 }}>
            <p className="eyebrow">Sin falladas</p>
            <h2 className="h-tile">Todo correcto.</h2>
            <a className="btn btn-ink" href="#/" style={{ alignSelf: 'flex-start' }}>Volver a Hoy</a>
          </section>
        )}

        <div className="tile tile-lime" style={{ justifyContent: 'space-between', minHeight: 150 }}>
          <span className="small" style={{ fontWeight: 500 }}>Tiempo</span>
          <span><span className="big-number" style={{ display: 'block' }}>{fmtDuration(r.timeUsedMs)}</span><span className="small">{(perQ / 60000).toFixed(1)} min por pregunta</span></span>
        </div>
        <div className="tile tile-pink" style={{ justifyContent: 'space-between', minHeight: 150 }}>
          <span className="small" style={{ fontWeight: 500 }}>Marcadas · en blanco</span>
          <span><span className="big-number" style={{ display: 'block' }}>{r.flagged} · {r.blank}</span><span className="small">Examen real: {(EXAM.minutes / EXAM.items).toFixed(2)} min/pregunta</span></span>
        </div>

        <section className="tile span-2" aria-labelledby="bd-h" style={{ gap: 8 }}>
          <div style={{ marginBottom: 6 }}>
            <h2 id="bd-h" className="h-section">Por dominio</h2>
            <p className="tiny muted" style={{ marginTop: 4 }}>De lo que más puntos te daría mejorar a lo que menos. El informe oficial muestra el % por dominio, pero el aprobado depende solo de la puntuación total.</p>
          </div>
          {domainRows.map((d) => (
            <div key={d.name} className="stack" style={{ gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div className="row-between" style={{ flexWrap: 'nowrap', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500 }}>{d.name}</span>
                <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{d.t.c}/{d.t.n} · {pct(d.t.c, d.t.n)} %</span>
              </div>
              <Meter value={pct(d.t.c, d.t.n)} label={`${d.name}: ${d.t.c} de ${d.t.n}`} />
            </div>
          ))}
        </section>

        <section className="tile span-2" aria-labelledby="miss-h" style={{ gap: 10 }}>
          <h2 id="miss-h" className="h-section">Para repasar</h2>
          {misses.length === 0 && <p className="small muted">Todo correcto y nada marcado.</p>}
          {misses.slice(0, 8).map(({ i, q, ok, ans }) => (
            <a key={i} href={`#/review/${a.id}/${i}`} className="list-item">
              <span className="tiny" style={{ fontWeight: 700, color: ok ? 'var(--muted)' : 'var(--bad-ink)', minWidth: 30 }}>#{i + 1}</span>
              <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{q?.question}</span>
              <span className="tiny" style={{ color: ok ? 'var(--muted)' : 'var(--bad-ink)', whiteSpace: 'nowrap', fontWeight: 600 }}>{!ans?.choice.length ? 'En blanco' : ok ? 'Marcada' : 'Fallada'}</span>
            </a>
          ))}
          {misses.length > 8 && <a href={`#/review/${a.id}/0`} className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>Ver las {misses.length}</a>}
        </section>
      </div>
    </>
  )
}
