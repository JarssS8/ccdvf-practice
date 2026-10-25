import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuestions } from '../App'
import { Icon } from '../components/Icon'
import { Empty, Meter, ScaleBar, ZoneChip } from '../components/ui'
import { attemptTitle, domainStats, exposures, fmtDate, fmtDuration, pct, PASS_P, readiness } from '../lib/engine'
import { useStore } from '../lib/store'
import type { Attempt } from '../lib/types'

function ScoreChart({ points }: { points: Attempt[] }) {
  const [hover, setHover] = useState<number | null>(null)
  // Draw at the real width so text stays 12px instead of scaling down on phones
  const [W, setW] = useState(720)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const H = 240, L = 40, R = 16, T = 16, B = 28
  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i / (points.length - 1)) * (W - L - R))
  const y = (p: number) => T + (1 - p) * (H - T - B)
  const vals = points.map((a) => a.result!.correct / a.result!.total)
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const h = hover != null ? points[hover] : null
  return (
    <figure ref={ref} style={{ margin: 0, position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Evolución de ${points.length} intentos en condiciones de examen`} style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize={12} fill="var(--muted)" fontFamily="var(--mono)">{g * 100}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(PASS_P)} y2={y(PASS_P)} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 4" />
        <text x={W - R} y={y(PASS_P) - 6} textAnchor="end" fontSize={12} fill="var(--ink)" fontWeight={600}>Corte ≈ {Math.round(PASS_P * 100)} %</text>
        <path d={d} fill="none" stroke="var(--mark)" strokeWidth={2} strokeLinejoin="round" />
        {vals.map((v, i) => (
          <g key={points[i].id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
            aria-label={`${attemptTitle(points[i])}, ${fmtDate(points[i].submittedAt!)}: ${Math.round(v * 100)} %`}>
            <circle cx={x(i)} cy={y(v)} r={14} fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r={5} fill="var(--mark)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
      </svg>
      {h && hover != null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(vals[hover]) / H) * 100}%` }}>
          {attemptTitle(h)} · {fmtDate(h.submittedAt!)} · <strong>{Math.round(vals[hover] * 100)} %</strong>
        </div>
      )}
    </figure>
  )
}

export default function Progress() {
  const { data } = useStore()
  const qs = useQuestions()
  const [table, setTable] = useState(false)
  const exp = useMemo(() => exposures(data, qs), [data, qs])
  const ready = useMemo(() => readiness(exp, qs), [exp, qs])
  const doms = useMemo(() => domainStats(exp, qs), [exp, qs])
  const done = Object.values(data.attempts).filter((a) => a.status === 'submitted' && a.result).sort((a, b) => a.submittedAt! - b.submittedAt!)
  const examLike = done.filter((a) => !a.feedback)
  const answered = exp.length
  const firstSeen = exp.filter((e) => e.firstOfGroup).length

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="h-page">Progreso</h1>
        <p className="muted">{done.length} intentos · {answered} respuestas · {firstSeen} conceptos distintos vistos</p>
      </div>

      {done.length === 0 ? (
        <div className="card"><Empty icon="chart" title="Sin datos todavía">Haz un mock o un drill y aquí verás tu evolución.</Empty></div>
      ) : (
        <>
          <section className="grid-auto">
            <div className="card">
              <div className="row-between"><h2 className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>Preparación estimada</h2>{ready && <ZoneChip zone={ready.zone} />}</div>
              {ready ? (
                <>
                  <span className="big-number">{ready.scaledLo}–{ready.scaledHi}</span>
                  <ScaleBar est={ready} />
                  <p className="small muted">Basada en tu primer intento de {ready.n} preguntas del banco (no IA), reponderada por el peso de cada dominio.</p>
                </>
              ) : <p className="small muted">Aún no hay primeros intentos.</p>}
            </div>
            <div className="card">
              <div className="row-between">
                <h2 className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>Mocks en condiciones de examen</h2>
                {examLike.length > 0 && <button className="btn btn-sm btn-ghost" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Ver gráfico' : 'Ver tabla'}</button>}
              </div>
              {examLike.length === 0 ? <p className="small muted">Ninguno todavía. Los drills no salen aquí porque llevan corrección al momento.</p>
                : table ? (
                  <div className="scroll-x"><table className="data">
                    <thead><tr><th>Fecha</th><th>Intento</th><th className="num">%</th><th className="num">Nuevas</th></tr></thead>
                    <tbody>{examLike.map((a) => <tr key={a.id}><td>{fmtDate(a.submittedAt!)}</td><td>{attemptTitle(a)}</td><td className="num">{pct(a.result!.correct, a.result!.total)}</td><td className="num">{a.result!.fresh}/{a.result!.total}</td></tr>)}</tbody>
                  </table></div>
                ) : <ScoreChart points={examLike} />}
            </div>
          </section>

          <section className="card" aria-labelledby="dom-h">
            <h2 id="dom-h" className="h-section">Por dominio</h2>
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>Dominio</th><th className="num">Peso</th><th>Primer intento</th><th className="num">Últimas 60 respuestas</th></tr></thead>
                <tbody>
                  {doms.map((d) => (
                    <tr key={d.name}>
                      <td style={{ fontWeight: 500, minWidth: 180 }}>{d.name}</td>
                      <td className="num">{d.weight.toLocaleString('es-ES')} %</td>
                      <td style={{ minWidth: 160 }}>
                        {d.first.n ? <div className="stack" style={{ gap: 4 }}><span className="mono tiny">{pct(d.first.c, d.first.n)} % · {d.first.c}/{d.first.n}</span><Meter value={pct(d.first.c, d.first.n)} bad={d.first.n >= 3 && d.first.c / d.first.n < 0.69} label={`${d.name}`} /></div> : <span className="tiny muted">sin datos</span>}
                      </td>
                      <td className="num">{d.recent.n ? `${pct(d.recent.c, d.recent.n)} % · ${d.recent.n}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" aria-labelledby="hist-h">
            <h2 id="hist-h" className="h-section">Historial</h2>
            <div className="stack" style={{ gap: 8 }}>
              {[...done].reverse().map((a) => (
                <a key={a.id} href={`#/results/${a.id}`} className="list-item">
                  <span className={`badge-icon ${a.feedback ? 'accent' : a.result!.correct / a.result!.total >= PASS_P ? 'ok' : 'bad'}`}><Icon name={a.feedback ? 'target' : 'exam'} size={18} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{attemptTitle(a)}</span>
                    <span className="tiny muted">{fmtDate(a.submittedAt!)} · {fmtDuration(a.result!.timeUsedMs)} · {a.result!.fresh}/{a.result!.total} nuevas</span>
                  </span>
                  <span className="mono" style={{ fontWeight: 600 }}>{pct(a.result!.correct, a.result!.total)} %</span>
                </a>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card card-tight" aria-labelledby="diag-h">
        <h2 id="diag-h" className="small" style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>Diagnóstico previo (8 oct 2026, en Claude Code)</h2>
        <p className="small muted">15/15. No cuenta para la estimación: las respuestas seguían el patrón A-B-C-D y la opción correcta era la más larga, así que se podía acertar sin saber. Aquí las opciones se barajan en cada intento.</p>
      </section>
    </>
  )
}
