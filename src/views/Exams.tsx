import { useState } from 'react'
import { Icon } from '../components/Icon'
import { activeAttempt, discardAttempt, startAttempt } from '../lib/actions'
import { attemptTitle, attemptsOf, modeSpec } from '../lib/engine'
import { guideCount, isLoaded, questionIndex } from '../lib/content'
import { useCert } from '../lib/cert'
import { loteCounts, setLotes, useLotes } from '../lib/lotes'
import { errorText, useT } from '../i18n'
import { useStore } from '../lib/store'
import type { Mode } from '../lib/types'

const TONE: Partial<Record<Mode, string>> = { full: 'tile-blue', quick: 'tile-lime', guide: 'tile-lilac', missed: 'tile-pink', flagged: 'tile-sun' }

// Titles and notes in t.exams.sections, same order
const SECTIONS: Mode[][] = [['full', 'quick'], ['repo-mock-1', 'repo-mock-2', 'repo-mock-3', 'guide'], ['missed', 'flagged']]

export default function Exams() {
  const { data } = useStore()
  const t = useT()
  const [err, setErr] = useState('')
  const cert = useCert()
  const active = activeAttempt(cert)
  const mine = attemptsOf(data, cert)
  const count = (m: Mode) => mine.filter((a) => a.mode === m && a.status === 'submitted').length
  const detail = (m: Mode) => { const spec = modeSpec(m, cert); return t.modes[m].detail(spec.items, spec.minutes ?? 0) }
  // Lotes: shown only when the certification has more than the original bank; at least one stays selected
  const counts = isLoaded(cert.id) ? loteCounts(questionIndex(data.aiQuestions), cert) : {}
  const avail = Object.keys(counts).map(Number).sort()
  const saved = useLotes(cert.id)
  const chosen = saved.filter((n) => avail.includes(n))
  const eff = chosen.length ? chosen : [1]
  const toggle = (n: number) => {
    const next = eff.includes(n) ? eff.filter((x) => x !== n) : [...eff, n].sort()
    if (next.length) setLotes(cert.id, next)
  }

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="h-page">{t.exams.title}</h1>
        <p className="muted">{t.exams.intro} {t.common.examLangNote}</p>
      </div>
      {active && (
        <div className="callout callout-info row-between">
          <span><strong>{attemptTitle(active, t)}</strong> {t.exams.stillOpen}</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => { if (confirm(t.common.discardConfirm)) discardAttempt(active.id) }}>{t.common.discard}</button>
            <a className="btn btn-primary btn-sm" href={`#/exam/${active.id}`}>{t.common.continue}</a>
          </span>
        </div>
      )}
      {err && <p role="alert" className="callout callout-bad">{errorText(t, err)}</p>}
      {avail.length > 1 && (
        <section className="card stack" style={{ gap: 12 }} aria-labelledby="lotes-h">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="lotes-h" className="h-section">{t.lotes.title}</h2>
            <p className="small muted">{t.lotes.note}</p>
          </div>
          <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
            {avail.map((n) => (
              <label key={n} className="row small" style={{ gap: 8, minHeight: 48 }}>
                <input type="checkbox" checked={eff.includes(n)} onChange={() => toggle(n)} style={{ width: 20, height: 20 }} />
                <span><strong>{t.lotes.name(n)}</strong> <span className="muted">· {t.lotes.kind[n]} · {t.lotes.count(counts[n])}</span></span>
              </label>
            ))}
          </div>
        </section>
      )}
      {SECTIONS.map((modes, si) => (
        <section key={modes[0]} className="stack" style={{ gap: 14 }} aria-labelledby={`s-${modes[0]}`}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 id={`s-${modes[0]}`} className="h-section">{t.exams.sections[si].title}</h2>
            <p className="small muted">{t.exams.sections[si].note}</p>
          </div>
          <div className="grid-modes">
            {modes.filter((m) => m !== 'guide' || guideCount(cert) > 0).map((m) => (
              <button key={m} type="button" className={`tile-link ${TONE[m] ?? ''}`} onClick={() => setErr(startAttempt(m) ?? '')}>
                <span className="row-between" style={{ width: '100%' }}>
                  <strong>{t.modes[m].title}</strong>
                  {count(m) > 0 && <span className="chip">{t.exams.done(count(m))}</span>}
                </span>
                <span className="small muted" style={{ minHeight: 42 }}>{detail(m)}</span>
                <span className="row small" style={{ fontWeight: 700, gap: 6, marginTop: 'auto' }}>{t.exams.start}<Icon name="arrowRight" size={16} /></span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
