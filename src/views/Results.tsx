import { useState } from 'react'
import { useQuestions } from '../App'
import { Icon } from '../components/Icon'
import { Empty, Meter, ScaleBar, ZoneChip } from '../components/ui'
import { startAttempt } from '../lib/actions'
import { attemptTitle, estimate, fmtDate, fmtDuration, isCorrect, pct } from '../lib/engine'
import { useStore } from '../lib/store'
import { DOMAINS, EXAM } from '../shared/exam'
import { localize } from '../lib/content'
import { errorText, useLang, useT } from '../i18n'

export default function Results({ id, timeout }: { id: string; timeout?: boolean }) {
  const { data } = useStore()
  const qs = useQuestions()
  const t = useT()
  const lang = useLang()
  const [err, setErr] = useState('')
  const a = data.attempts[id]
  if (!a) return <Empty icon="alert" title={t.results.notFound}>{t.common.maybeSyncing}</Empty>
  if (a.status !== 'submitted' || !a.result) {
    return <div className="stack"><h1 className="h-page">{t.results.inProgress}</h1><a className="btn btn-primary" href={`#/exam/${a.id}`} style={{ alignSelf: 'flex-start' }}>{t.common.continue}</a></div>
  }
  const r = a.result
  const timedOut = timeout || (!!a.deadline && a.submittedAt === a.deadline)
  const repeat = r.fresh < r.total
  const est = estimate(r.correct, r.total)
  const exam = !a.feedback
  const rows = a.questionIds.map((qid, i) => {
    const orig = qs.get(qid)
    const q = orig && localize(orig, lang)
    const ans = data.answers[`${a.id}|${qid}`]
    return { i, q, ans, ok: q ? isCorrect(q, ans?.choice) : false }
  })
  const failed = rows.filter((x) => !x.ok).length
  const misses = rows.filter((x) => !x.ok || x.ans?.flagged)
  const perQ = r.total ? r.timeUsedMs / r.total : 0

  // The headline says in plain words where you stand
  const headline = !exam || !est ? t.results.done : t.results[est.zone]

  // Weakest first, so the list reads as "what to work on"
  const domainRows = DOMAINS.filter((d) => r.byDomain[d.name])
    .map((d) => ({ ...d, t: r.byDomain[d.name] }))
    .sort((x, y) => (1 - y.t.c / y.t.n) * y.weight - (1 - x.t.c / x.t.n) * x.weight)

  return (
    <>
      <div className="row">
        <a href="#/progress" className="btn btn-ghost btn-sm" style={{ paddingLeft: 8 }}><Icon name="chevronLeft" size={18} />{t.nav.progress}</a>
        <span className="small muted">{attemptTitle(a, t)} · {fmtDate(a.submittedAt ?? a.startedAt, lang)} · {t.results.questions(r.total)}</span>
      </div>

      {timedOut && <p className="callout callout-bad" role="status"><strong>{t.results.timedOut}</strong> {t.results.timedOutText}</p>}

      <section aria-labelledby="score-h" className="stack" style={{ gap: 18, maxWidth: 760, padding: '8px 4px' }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <h1 id="score-h" className="h-page" style={{ fontSize: 'clamp(38px, 7vw, 60px)' }}>{headline}</h1>
          {est && exam && <ZoneChip zone={est.zone} />}
        </div>
        <p style={{ fontSize: 18, color: 'var(--ink-2)' }}>
          {t.results.youGot} <strong style={{ color: 'var(--ink)' }}>{t.results.of(r.correct, r.total)}</strong> ({t.common.percent(pct(r.correct, r.total))})
          {est && exam && <>. {t.results.equals} <strong style={{ color: 'var(--ink)' }}>{est.scaledLo}–{est.scaledHi}</strong> {t.results.outOf(EXAM.scaleMax, EXAM.passScaled)}</>}
          {!exam && t.results.drillNoScore}
        </p>
        {est && exam && (
          <>
            <ScaleBar est={est} />
            <p className="small muted">
              {r.total < 30 ? t.results.fewQuestions : t.results.wide}
              {t.results.approx}
              {repeat ? t.results.repeat(r.total - r.fresh, r.total, r.fresh ? t.results.freshScore(pct(r.freshCorrect, r.fresh), r.fresh) : t.results.noneFresh) : t.results.allFresh(r.total)}
            </p>
          </>
        )}
      </section>

      {err && <p role="alert" className="callout callout-bad">{errorText(t, err)}</p>}

      <div className="bento">
        {failed > 0 ? (
          <section className="tile tile-blue span-2" aria-labelledby="next-h" style={{ justifyContent: 'space-between', gap: 20 }}>
            <div className="stack" style={{ gap: 8 }}>
              <p className="eyebrow">{t.results.biggestGain}</p>
              <h2 id="next-h" className="h-tile">{t.results.reviewMissed}</h2>
              <p className="muted">{t.results.reviewMissedText}</p>
            </div>
            <div className="row">
              <button className="btn btn-hero" onClick={() => setErr(startAttempt('missed', undefined, a.id) ?? '')}>{t.results.reviewN(failed)}<Icon name="arrowRight" size={18} /></button>
              <a className="btn btn-hero-ghost" href={`#/review/${a.id}/0`}>{t.results.seeAll}</a>
            </div>
          </section>
        ) : (
          <section className="tile tile-lime span-2" style={{ justifyContent: 'space-between', gap: 16 }}>
            <p className="eyebrow">{t.results.noMisses}</p>
            <h2 className="h-tile">{t.results.allCorrect}</h2>
            <a className="btn btn-ink" href="#/" style={{ alignSelf: 'flex-start' }}>{t.results.backToday}</a>
          </section>
        )}

        <div className="tile tile-lime" style={{ justifyContent: 'space-between', minHeight: 150 }}>
          <span className="small" style={{ fontWeight: 500 }}>{t.results.time}</span>
          <span><span className="big-number" style={{ display: 'block' }}>{fmtDuration(r.timeUsedMs)}</span><span className="small">{t.results.perQuestion((perQ / 60000).toFixed(1))}</span></span>
        </div>
        <div className="tile tile-pink" style={{ justifyContent: 'space-between', minHeight: 150 }}>
          <span className="small" style={{ fontWeight: 500 }}>{t.results.flaggedBlank}</span>
          <span><span className="big-number" style={{ display: 'block' }}>{r.flagged} · {r.blank}</span><span className="small">{t.results.realPace((EXAM.minutes / EXAM.items).toFixed(2))}</span></span>
        </div>

        <section className="tile span-2" aria-labelledby="bd-h" style={{ gap: 8 }}>
          <div style={{ marginBottom: 6 }}>
            <h2 id="bd-h" className="h-section">{t.results.byDomain}</h2>
            <p className="tiny muted" style={{ marginTop: 4 }}>{t.results.byDomainNote}</p>
          </div>
          {domainRows.map((d) => (
            <div key={d.name} className="stack" style={{ gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div className="row-between" style={{ flexWrap: 'nowrap', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500 }}>{t.domains[d.name]}</span>
                <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{d.t.c}/{d.t.n} · {t.common.percent(pct(d.t.c, d.t.n))}</span>
              </div>
              <Meter value={pct(d.t.c, d.t.n)} label={`${t.domains[d.name]}: ${d.t.c}/${d.t.n}`} />
            </div>
          ))}
        </section>

        <section className="tile span-2" aria-labelledby="miss-h" style={{ gap: 10 }}>
          <h2 id="miss-h" className="h-section">{t.results.toReview}</h2>
          {misses.length === 0 && <p className="small muted">{t.results.nothing}</p>}
          {misses.slice(0, 8).map(({ i, q, ok, ans }) => (
            <a key={i} href={`#/review/${a.id}/${i}`} className="list-item">
              <span className="tiny" style={{ fontWeight: 700, color: ok ? 'var(--muted)' : 'var(--bad-ink)', minWidth: 30 }}>#{i + 1}</span>
              <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{q?.question}</span>
              <span className="tiny" style={{ color: ok ? 'var(--muted)' : 'var(--bad-ink)', whiteSpace: 'nowrap', fontWeight: 600 }}>{!ans?.choice.length ? t.results.blank : ok ? t.results.flagged : t.results.missedWord}</span>
            </a>
          ))}
          {misses.length > 8 && <a href={`#/review/${a.id}/0`} className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>{t.results.seeN(misses.length)}</a>}
        </section>
      </div>
    </>
  )
}
