import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { ScaleBar, ZoneChip } from '../components/ui'
import { useQuestions } from '../App'
import { news, repoQuestions } from '../lib/content'
import { activeAttempt, discardAttempt, startAttempt } from '../lib/actions'
import { attemptTitle, domainStats, exposures, fmtDate, fmtDuration, isCorrect, latestByQuestion, pct, readiness } from '../lib/engine'
import { deck, queue, schedule } from '../lib/srs'
import { now, useStore } from '../lib/store'
import { EXAM } from '../shared/exam'

const fmt = (n: number) => n.toLocaleString('es-ES')

export default function Home() {
  const { data } = useStore()
  const qs = useQuestions()
  const [err, setErr] = useState('')

  const exp = useMemo(() => exposures(data, qs), [data, qs])
  const ready = useMemo(() => readiness(exp, qs), [exp, qs])
  const domains = useMemo(() => domainStats(exp, qs), [exp, qs])
  const cards = useMemo(() => { const s = schedule(data, new Date(now())); const q = queue(deck(data, qs), s); return q.due.length + q.fresh.length }, [data, qs])
  const missed = useMemo(() => {
    let n = 0
    for (const [qid, a] of latestByQuestion(data)) { const q = qs.get(qid); if (q && !isCorrect(q, a.choice)) n++ }
    return n
  }, [data, qs])
  const aiN = data.aiQuestions.filter((q) => !q.reported).length
  const submitted = Object.values(data.attempts).filter((a) => a.status === 'submitted')
  const last = [...submitted].sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))[0]
  const active = activeAttempt()
  const examDate = data.settings.exam_date?.value
  const daysLeft = examDate ? Math.ceil((new Date(examDate + 'T09:00').getTime() - now()) / 864e5) : null

  // Where an extra right answer is worth most: (share you still miss) × (weight in the exam)
  const poolSize = (name: string) => new Set(repoQuestions.filter((q) => q.domain === name).map((q) => q.dupGroup ?? q.id)).size
  const ranked = useMemo(() => domains
    .map((d) => ({ ...d, gain: d.first.n ? (1 - d.first.c / d.first.n) * d.weight : d.weight, pool: poolSize(d.name) }))
    .sort((a, b) => b.gain - a.gain), [domains])
  const focus = ranked.find((d) => d.pool >= 3)

  const start = (mode: Parameters<typeof startAttempt>[0], domain?: string) => setErr(startAttempt(mode, domain) ?? '')
  const answeredN = active ? Object.values(data.answers).filter((a) => a.attemptId === active.id && a.choice.length).length : 0

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="h-page">Hoy</h1>
        <p className="small muted">{EXAM.name} · {EXAM.items} preguntas · {EXAM.minutes} min · corte {EXAM.passScaled}</p>
      </div>

      {err && <p role="alert" className="callout callout-bad">{err}</p>}

      <div className="bento">
        <section className="tile tile-blue span-2 row-2" aria-labelledby="next-h" style={{ justifyContent: 'space-between', gap: 24 }}>
          <div className="stack" style={{ gap: 14 }}>
            <p className="eyebrow">{active ? 'Tienes un examen a medias' : 'Siguiente paso'}</p>
            {active ? (
              <>
                <h2 id="next-h" className="h-tile">{attemptTitle(active)}</h2>
                <p className="muted">
                  {answeredN} de {active.questionIds.length} respondidas
                  {active.deadline ? ` · quedan ${fmtDuration(active.deadline - now())}. El reloj no se para.` : '.'}
                </p>
              </>
            ) : submitted.length === 0 || !focus ? (
              <>
                <h2 id="next-h" className="h-tile">Tu primer mock completo</h2>
                <p className="muted">{EXAM.items} preguntas repartidas por el peso de cada dominio, {EXAM.minutes} min y sin ver respuestas hasta el final. Es la mejor forma de medir dónde estás.</p>
              </>
            ) : (
              <>
                <h2 id="next-h" className="h-tile">Drill de {focus.name}</h2>
                <p className="muted">
                  {focus.first.n === 0
                    ? `Aún no has respondido nada de aquí y pesa un ${fmt(focus.weight)} %.`
                    : `Pesa un ${fmt(focus.weight)} % y vas al ${pct(focus.first.c, focus.first.n)} %: aquí ganas más puntos.`}
                </p>
              </>
            )}
          </div>
          <div className="row" style={{ gap: 12 }}>
            {active ? (
              <>
                <a className="btn btn-hero" href={`#/exam/${active.id}`}>Continuar<Icon name="arrowRight" size={18} /></a>
                <button className="btn btn-hero-ghost" onClick={() => { if (confirm('¿Descartar este intento? No contará en tu historial.')) discardAttempt(active.id) }}>Descartar</button>
              </>
            ) : submitted.length === 0 || !focus ? (
              <>
                <button className="btn btn-hero" onClick={() => start('full')}>Empezar mock<Icon name="arrowRight" size={18} /></button>
                <button className="btn btn-hero-ghost" onClick={() => start('quick')}>Mock rápido · 15</button>
              </>
            ) : (
              <>
                <button className="btn btn-hero" onClick={() => start('drill', focus.name)}>Empezar drill<Icon name="arrowRight" size={18} /></button>
                <a className="btn btn-hero-ghost" href="#/exams">Un mock completo</a>
              </>
            )}
          </div>
        </section>

        {daysLeft != null && daysLeft >= 0 ? (
          <a className="tile tile-lime tile-link" href="#/settings" aria-label={`Faltan ${daysLeft} días para el examen. Cambiar fecha`} style={{ justifyContent: 'space-between', minHeight: 168 }}>
            <span className="small" style={{ fontWeight: 500 }}>{daysLeft === 0 ? 'Examen' : 'Faltan'}</span>
            <span className="huge-number">{daysLeft === 0 ? 'Hoy' : daysLeft}</span>
            <span className="small" style={{ fontWeight: 500 }}>{daysLeft === 0 ? '¡suerte!' : `días · ${new Date(examDate + 'T09:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`}</span>
          </a>
        ) : (
          <a className="tile tile-lime tile-link" href="#/settings" style={{ justifyContent: 'space-between', minHeight: 168 }}>
            <span className="small" style={{ fontWeight: 500 }}>Fecha del examen</span>
            <span className="huge-number">—</span>
            <span className="small" style={{ fontWeight: 500 }}>Ponla en Ajustes</span>
          </a>
        )}

        <a className="tile tile-link" href="#/cards" style={{ justifyContent: 'space-between', minHeight: 168 }}>
          <span className="badge-icon"><Icon name="cards" size={20} /></span>
          <span>
            <span className="big-number" style={{ display: 'block' }}>{cards}</span>
            <span className="small muted">tarjetas{cards ? ` · ${Math.max(1, Math.round(cards * 0.35))} min` : ''}</span>
          </span>
        </a>

        <section className="tile span-2" aria-labelledby="ready-h" style={{ gap: 16 }}>
          <div className="row-between">
            <h2 id="ready-h" className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600, letterSpacing: 0 }}>Preparación estimada</h2>
            {ready && <ZoneChip zone={ready.zone} />}
          </div>
          {ready ? (
            <>
              <p className="big-number">{ready.scaledLo}–{ready.scaledHi}<span className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600, letterSpacing: 0 }}> / 1000</span></p>
              <ScaleBar est={ready} />
              <p className="small muted">{ready.n} preguntas vistas por primera vez, ponderadas por dominio. Aproximado: Anthropic no publica la conversión exacta.</p>
            </>
          ) : (
            <>
              <p className="big-number">—</p>
              <p className="small muted">Se calcula con tus primeros intentos en preguntas del banco. El diagnóstico previo (15/15) no cuenta: su patrón de respuestas era adivinable.</p>
            </>
          )}
        </section>

        {missed > 0 ? (
          <button className="tile tile-pink tile-link" onClick={() => start('missed')} aria-label={`Repasar ${missed} preguntas falladas`} style={{ justifyContent: 'space-between', minHeight: 150 }}>
            <span className="small" style={{ fontWeight: 500 }}>Repasar</span>
            <span><span className="big-number" style={{ display: 'block' }}>{missed}</span><span className="small">falladas</span></span>
          </button>
        ) : (
          <div className="tile tile-pink" style={{ justifyContent: 'space-between', minHeight: 150 }}>
            <span className="small" style={{ fontWeight: 500 }}>Repasar</span>
            <span><span className="big-number" style={{ display: 'block' }}>0</span><span className="small">falladas pendientes</span></span>
          </div>
        )}

        <a className="tile tile-lilac tile-link" href="#/domains" style={{ justifyContent: 'space-between', minHeight: 150 }}>
          <span className="small" style={{ fontWeight: 500 }}>Nuevas con IA</span>
          <span><span className="big-number" style={{ display: 'block' }}>{data.ai.enabled ? aiN : '—'}</span><span className="small">{data.ai.enabled ? 'preguntas en tu banco' : 'IA sin configurar'}</span></span>
        </a>

        <section className="tile span-2 d-domains" aria-labelledby="dom-h" style={{ gap: 4 }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <h2 id="dom-h" className="h-section">Dónde ganar puntos</h2>
            <a href="#/domains" className="small" style={{ fontWeight: 600 }}>Ver todos</a>
          </div>
          {ranked.slice(0, 3).map((d) => (
            <button key={d.name} className="dom-row" onClick={() => start('drill', d.name)} aria-label={`Drill de ${d.name}`}>
              <span className="row-between" style={{ flexWrap: 'nowrap', width: '100%', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500, fontSize: 15 }}>{d.name}</span>
                <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{d.first.n ? `${pct(d.first.c, d.first.n)} %` : 'sin empezar'}</span>
              </span>
              <span className="meter" style={{ width: '100%' }}><span style={{ width: `${d.first.n ? pct(d.first.c, d.first.n) : 0}%` }} /></span>
              <span className="tiny muted">Peso {fmt(d.weight)} %{d.first.n > 0 && d.first.n < 5 ? ' · pocas preguntas' : ''}</span>
            </button>
          ))}
        </section>

        {last && last.result ? (
          <a className="tile tile-sun tile-link span-2 d-last" href={`#/results/${last.id}`} style={{ justifyContent: 'space-between', gap: 16 }}>
            <span className="small" style={{ fontWeight: 500 }}>Último intento · {fmtDate(last.submittedAt ?? last.startedAt)}</span>
            <span className="row-between" style={{ alignItems: 'flex-end' }}>
              <span>
                <span className="h-tile" style={{ display: 'block' }}>{attemptTitle(last)}</span>
                <span className="small muted">{last.result.correct} de {last.result.total} correctas</span>
              </span>
              <span className="big-number">{pct(last.result.correct, last.result.total)}%</span>
            </span>
          </a>
        ) : (
          <a className="tile tile-sun tile-link span-2 d-last" href="#/exams" style={{ justifyContent: 'space-between', gap: 16 }}>
            <span className="small" style={{ fontWeight: 500 }}>Último intento</span>
            <span><span className="h-tile" style={{ display: 'block' }}>Aún no has terminado ninguno</span><span className="small muted">Elige un examen para empezar →</span></span>
          </a>
        )}
      </div>

      {news[0] && <p className="small muted" style={{ padding: '0 4px' }}>Novedades del programa: {news[0].title.split(':').slice(1).join(':').trim() || news[0].title}. <a href="#/notes" style={{ fontWeight: 500 }}>Ver más</a></p>}
    </>
  )
}
