import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { ScaleBar, ZoneChip } from '../components/ui'
import { useQuestions } from '../App'
import { newsFor, repoQuestions } from '../lib/content'
import { activeAttempt, discardAttempt, startAttempt } from '../lib/actions'
import { attemptTitle, domainStats, exposures, fmtDate, fmtDuration, fmtNum, isCorrect, latestByQuestion, locale, pct, readiness } from '../lib/engine'
import { deck, queue, schedule } from '../lib/srs'
import { now, useStore } from '../lib/store'
import { errorText, useLang, useT } from '../i18n'

export default function Home() {
  const { data } = useStore()
  const t = useT()
  const lang = useLang()
  const fmt = (n: number) => fmtNum(n, lang)
  const news = newsFor(lang)
  const qs = useQuestions()
  const [err, setErr] = useState('')

  const exp = useMemo(() => exposures(data, qs), [data, qs])
  const ready = useMemo(() => readiness(exp, qs), [exp, qs])
  const domains = useMemo(() => domainStats(exp, qs), [exp, qs])
  const cards = useMemo(() => { const s = schedule(data, new Date(now())); const q = queue(deck(data, qs, lang), s); return q.due.length + q.fresh.length }, [data, qs, lang])
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
        <h1 className="h-page">{t.home.today}</h1>
        <p className="small muted">{t.home.examLine}</p>
      </div>

      {err && <p role="alert" className="callout callout-bad">{errorText(t, err)}</p>}

      <div className="bento">
        <section className="tile tile-blue span-2 row-2" aria-labelledby="next-h" style={{ justifyContent: 'space-between', gap: 24 }}>
          <div className="stack" style={{ gap: 14 }}>
            <p className="eyebrow">{active ? t.home.unfinished : t.home.nextStep}</p>
            {active ? (
              <>
                <h2 id="next-h" className="h-tile">{attemptTitle(active, t)}</h2>
                <p className="muted">
                  {t.home.answered(answeredN, active.questionIds.length)}
                  {active.deadline ? t.home.timeLeft(fmtDuration(active.deadline - now())) : '.'}
                </p>
              </>
            ) : submitted.length === 0 || !focus ? (
              <>
                <h2 id="next-h" className="h-tile">{t.home.firstMock}</h2>
                <p className="muted">{t.home.firstMockText}</p>
              </>
            ) : (
              <>
                <h2 id="next-h" className="h-tile">{t.home.drillOf(t.domains[focus.name])}</h2>
                <p className="muted">
                  {focus.first.n === 0
                    ? t.home.drillUnseen(fmt(focus.weight))
                    : t.home.drillWeak(fmt(focus.weight), pct(focus.first.c, focus.first.n))}
                </p>
              </>
            )}
          </div>
          <div className="row" style={{ gap: 12 }}>
            {active ? (
              <>
                <a className="btn btn-hero" href={`#/exam/${active.id}`}>{t.common.continue}<Icon name="arrowRight" size={18} /></a>
                <button className="btn btn-hero-ghost" onClick={() => { if (confirm(t.common.discardConfirm)) discardAttempt(active.id) }}>{t.common.discard}</button>
              </>
            ) : submitted.length === 0 || !focus ? (
              <>
                <button className="btn btn-hero" onClick={() => start('full')}>{t.home.startMock}<Icon name="arrowRight" size={18} /></button>
                <button className="btn btn-hero-ghost" onClick={() => start('quick')}>{t.home.quick15}</button>
              </>
            ) : (
              <>
                <button className="btn btn-hero" onClick={() => start('drill', focus.name)}>{t.home.startDrill}<Icon name="arrowRight" size={18} /></button>
                <a className="btn btn-hero-ghost" href="#/exams">{t.home.aFullMock}</a>
              </>
            )}
          </div>
        </section>

        {daysLeft != null && daysLeft >= 0 ? (
          <a className="tile tile-lime tile-link" href="#/settings" aria-label={t.home.daysLeftAria(daysLeft)} style={{ justifyContent: 'space-between', minHeight: 168 }}>
            <span className="small" style={{ fontWeight: 500 }}>{daysLeft === 0 ? t.home.exam : t.home.left}</span>
            <span className="huge-number">{daysLeft === 0 ? t.home.todayWord : daysLeft}</span>
            <span className="small" style={{ fontWeight: 500 }}>{daysLeft === 0 ? t.home.goodLuck : t.home.days(new Date(examDate + 'T09:00').toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' }))}</span>
          </a>
        ) : (
          <a className="tile tile-lime tile-link" href="#/settings" style={{ justifyContent: 'space-between', minHeight: 168 }}>
            <span className="small" style={{ fontWeight: 500 }}>{t.home.examDate}</span>
            <span className="huge-number">—</span>
            <span className="small" style={{ fontWeight: 500 }}>{t.home.setInSettings}</span>
          </a>
        )}

        <a className="tile tile-link" href="#/cards" style={{ justifyContent: 'space-between', minHeight: 168 }}>
          <span className="badge-icon"><Icon name="cards" size={20} /></span>
          <span>
            <span className="big-number" style={{ display: 'block' }}>{cards}</span>
            <span className="small muted">{t.home.cards}{cards ? ` · ${t.home.minutes(Math.max(1, Math.round(cards * 0.35)))}` : ''}</span>
          </span>
        </a>

        <section className="tile span-2" aria-labelledby="ready-h" style={{ gap: 16 }}>
          <div className="row-between">
            <h2 id="ready-h" className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600, letterSpacing: 0 }}>{t.home.readiness}</h2>
            {ready && <ZoneChip zone={ready.zone} />}
          </div>
          {ready ? (
            <>
              <p className="big-number">{ready.scaledLo}–{ready.scaledHi}<span className="small muted" style={{ fontFamily: 'var(--font)', fontWeight: 600, letterSpacing: 0 }}> / 1000</span></p>
              <ScaleBar est={ready} />
              <p className="small muted">{t.home.readinessNote(ready.n)}</p>
            </>
          ) : (
            <>
              <p className="big-number">—</p>
              <p className="small muted">{t.home.readinessEmpty}</p>
            </>
          )}
        </section>

        {missed > 0 ? (
          <button className="tile tile-pink tile-link" onClick={() => start('missed')} aria-label={t.home.reviewAria(missed)} style={{ justifyContent: 'space-between', minHeight: 150 }}>
            <span className="small" style={{ fontWeight: 500 }}>{t.home.review}</span>
            <span><span className="big-number" style={{ display: 'block' }}>{missed}</span><span className="small">{t.home.missed}</span></span>
          </button>
        ) : (
          <div className="tile tile-pink" style={{ justifyContent: 'space-between', minHeight: 150 }}>
            <span className="small" style={{ fontWeight: 500 }}>{t.home.review}</span>
            <span><span className="big-number" style={{ display: 'block' }}>0</span><span className="small">{t.home.missedPending}</span></span>
          </div>
        )}

        <a className="tile tile-lilac tile-link" href="#/domains" style={{ justifyContent: 'space-between', minHeight: 150 }}>
          <span className="small" style={{ fontWeight: 500 }}>{t.home.newAi}</span>
          <span><span className="big-number" style={{ display: 'block' }}>{data.ai.enabled ? aiN : '—'}</span><span className="small">{data.ai.enabled ? t.home.inBank : t.home.aiOff}</span></span>
        </a>

        <section className="tile span-2 d-domains" aria-labelledby="dom-h" style={{ gap: 4 }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <h2 id="dom-h" className="h-section">{t.home.whereToGain}</h2>
            <a href="#/progress" className="small" style={{ fontWeight: 600 }}>{t.home.seeAll}</a>
          </div>
          {ranked.slice(0, 3).map((d) => (
            <button key={d.name} className="dom-row" onClick={() => start('drill', d.name)} aria-label={t.home.drillAria(t.domains[d.name])}>
              <span className="row-between" style={{ flexWrap: 'nowrap', width: '100%', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500, fontSize: 15 }}>{t.domains[d.name]}</span>
                <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{d.first.n ? t.common.percent(pct(d.first.c, d.first.n)) : t.common.notStarted}</span>
              </span>
              <span className="meter" style={{ width: '100%' }}><span style={{ width: `${d.first.n ? pct(d.first.c, d.first.n) : 0}%` }} /></span>
              <span className="tiny muted">{t.home.weight(fmt(d.weight))}{d.first.n > 0 && d.first.n < 5 ? t.home.fewQuestions : ''}</span>
            </button>
          ))}
        </section>

        {last && last.result ? (
          <a className="tile tile-sun tile-link span-2 d-last" href={`#/results/${last.id}`} style={{ justifyContent: 'space-between', gap: 16 }}>
            <span className="small" style={{ fontWeight: 500 }}>{t.home.lastAttempt} · {fmtDate(last.submittedAt ?? last.startedAt, lang)}</span>
            <span className="row-between" style={{ alignItems: 'flex-end' }}>
              <span>
                <span className="h-tile" style={{ display: 'block' }}>{attemptTitle(last, t)}</span>
                <span className="small muted">{t.home.correctOf(last.result.correct, last.result.total)}</span>
              </span>
              <span className="big-number">{t.common.percent(pct(last.result.correct, last.result.total))}</span>
            </span>
          </a>
        ) : (
          <a className="tile tile-sun tile-link span-2 d-last" href="#/exams" style={{ justifyContent: 'space-between', gap: 16 }}>
            <span className="small" style={{ fontWeight: 500 }}>{t.home.lastAttempt}</span>
            <span><span className="h-tile" style={{ display: 'block' }}>{t.home.noneFinished}</span><span className="small muted">{t.home.pickExam}</span></span>
          </a>
        )}
      </div>

      {news[0] && <p className="small muted" style={{ padding: '0 4px' }}>{t.home.news} {news[0].title.split(':').slice(1).join(':').trim() || news[0].title}. <a href="#/notes" style={{ fontWeight: 500 }}>{t.home.more}</a></p>}
    </>
  )
}
