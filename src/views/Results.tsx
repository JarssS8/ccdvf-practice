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
  const rows = a.questionIds.map((qid, i) => {
    const q = qs.get(qid)
    const ans = data.answers[`${a.id}|${qid}`]
    return { i, q, ans, ok: q ? isCorrect(q, ans?.choice) : false }
  })
  const misses = rows.filter((x) => !x.ok || x.ans?.flagged)
  const perQ = r.total ? r.timeUsedMs / r.total : 0

  return (
    <>
      <div className="row">
        <a href="#/progress" className="btn btn-ghost btn-sm" style={{ paddingLeft: 4 }}><Icon name="chevronLeft" size={18} />Progreso</a>
        <span className="small muted">{attemptTitle(a)} · {fmtDate(a.submittedAt ?? a.startedAt)} · {r.total} preguntas</span>
      </div>

      {timedOut && <p className="callout callout-bad" role="status"><strong>Tiempo agotado.</strong> Se entregó con las respuestas guardadas antes del final.</p>}

      <section className="grid-auto" aria-labelledby="score-h">
        <div className="card">
          <div className="row-between">
            <h1 id="score-h" className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>Resultado</h1>
            {est && !a.feedback && <ZoneChip zone={est.zone} />}
          </div>
          <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
            <span className="big-number">{pct(r.correct, r.total)}%</span>
            <span className="mono muted">{r.correct}/{r.total}</span>
          </div>
          {est && (
            <>
              <ScaleBar est={est} />
              <p className="small muted">
                Equivale a unos <strong style={{ color: 'var(--ink)' }}>{est.scaledLo}–{est.scaledHi}</strong> sobre {EXAM.scaleMax} (95 %, conversión lineal aproximada).
                {r.total < 30 && ' Con tan pocas preguntas el rango es ancho.'}
              </p>
            </>
          )}
          {repeat && (
            <p className="callout callout-info small">
              <span><strong>{r.total - r.fresh} de {r.total}</strong> ya las habías visto. Sin ellas: {r.fresh ? `${pct(r.freshCorrect, r.fresh)} % en ${r.fresh} nuevas` : 'ninguna era nueva'}. Solo las nuevas cuentan para tu preparación estimada.</span>
            </p>
          )}
        </div>

        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {[
            ['Aciertos', `${r.correct}/${r.total}`],
            ['Tiempo', fmtDuration(r.timeUsedMs)],
            ['Por pregunta', `${(perQ / 60000).toFixed(1)} min`],
            ['Marcadas · blanco', `${r.flagged} · ${r.blank}`],
          ].map(([k, v]) => (
            <div key={k} className="card card-tight">
              <span className="tiny muted">{k}</span>
              <span className="mono" style={{ fontSize: 24, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <p className="tiny muted" style={{ gridColumn: '1 / -1' }}>Ritmo del examen real: {(EXAM.minutes / EXAM.items).toFixed(2)} min por pregunta.</p>
        </div>
      </section>

      {err && <p role="alert" className="callout callout-bad">{err}</p>}

      <div className="split">
        <section className="card main" aria-labelledby="bd-h">
          <h2 id="bd-h" className="h-section">Por dominio</h2>
          <p className="tiny muted">El informe oficial muestra el % por dominio, pero el aprobado depende solo de la puntuación total.</p>
          {DOMAINS.filter((d) => r.byDomain[d.name]).map((d) => {
            const t = r.byDomain[d.name]
            return (
              <div key={d.name} className="stack" style={{ gap: 6 }}>
                <div className="row-between" style={{ flexWrap: 'nowrap' }}>
                  <span style={{ fontWeight: 500 }}>{d.name}</span>
                  <span className="mono small">{t.c}/{t.n}</span>
                </div>
                <Meter value={pct(t.c, t.n)} bad={t.c / t.n < 0.69} label={`${d.name}: ${t.c} de ${t.n}`} />
              </div>
            )
          })}
        </section>

        <aside className="side">
          <section className="card" aria-labelledby="miss-h">
            <h2 id="miss-h" className="h-section" style={{ fontSize: 19 }}>Para repasar</h2>
            {misses.length === 0 && <p className="small muted">Todo correcto y nada marcado.</p>}
            {misses.slice(0, 8).map(({ i, q, ok, ans }) => (
              <a key={i} href={`#/review/${a.id}/${i}`} className="list-item">
                <span className="mono tiny" style={{ fontWeight: 600, color: ok ? 'var(--muted)' : 'var(--bad-ink)', minWidth: 30 }}>#{i + 1}</span>
                <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{q?.question}</span>
                <span className="tiny" style={{ color: ok ? 'var(--muted)' : 'var(--bad-ink)', whiteSpace: 'nowrap' }}>{!ans?.choice.length ? 'En blanco' : ok ? 'Marcada' : 'Fallada'}</span>
              </a>
            ))}
            <a href={`#/review/${a.id}/0`} className="btn btn-sm">Revisar todas</a>
          </section>
          {rows.some((x) => !x.ok) && (
            <button className="btn btn-primary btn-block" onClick={() => setErr(startAttempt('missed', undefined, a.id) ?? '')}><Icon name="target" size={18} />Repasar las {rows.filter((x) => !x.ok).length} falladas de este intento</button>
          )}
        </aside>
      </div>
    </>
  )
}
