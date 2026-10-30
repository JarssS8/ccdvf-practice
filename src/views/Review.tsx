import { useQuestions } from '../App'
import { Icon } from '../components/Icon'
import { Explanation, QuestionCard } from '../components/QuestionCard'
import { Tutor } from '../components/Tutor'
import { attemptTitle, isCorrect } from '../lib/engine'
import { go } from '../lib/router'
import { ADDED } from '../lib/srs'
import { dispatch, now, useStore } from '../lib/store'
import { localize } from '../lib/content'
import { useLang, useT } from '../i18n'

export default function ReviewView({ id, index }: { id: string; index: number }) {
  const { data } = useStore()
  const qs = useQuestions()
  const t = useT()
  const lang = useLang()
  const a = data.attempts[id]
  if (!a) return <main className="page"><p>{t.common.attemptNotFound}</p><a className="btn" href="#/progress">{t.nav.progress}</a></main>
  const total = a.questionIds.length
  const i = Math.max(0, Math.min(total - 1, index))
  const qid = a.questionIds[i]
  const orig = qs.get(qid)
  const q = orig ? localize(orig, lang) : undefined
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
            <a href={`#/results/${a.id}`} className="btn icon-btn" aria-label={t.review.back}> <Icon name="chevronLeft" /></a>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tiny muted" style={{ fontWeight: 500 }}>{t.review.title(attemptTitle(a, t))}</div>
              <div style={{ fontWeight: 600 }}>{t.review.position(i + 1, total)}</div>
            </div>
            <span className={`chip ${!choice.length ? '' : ok ? 'chip-ok' : 'chip-bad'}`}>
              <Icon name={ok ? 'check' : 'x'} size={14} stroke={2.4} />{!choice.length ? t.review.blank : ok ? t.review.right : t.review.wrong}
            </span>
          </div>
        </div>
      </header>

      <main className="exam-body" id="main">
        {!q ? <p>{t.review.gone}</p> : (
          <>
            <QuestionCard q={q} seed={a.seed} selected={choice} reveal showDomain />
            <Explanation q={q} seed={a.seed} />
            <div className="row">
              <button className="btn btn-sm" disabled={inDeck} onClick={() => dispatch({ type: 'review', id: crypto.randomUUID(), cardId: 'q:' + qid, rating: ADDED, reviewedAt: now() })}>
                <Icon name="cards" size={16} />{inDeck ? t.review.inDeck : t.review.addDeck}
              </button>
              {q.source === 'ai' && (
                <button className="btn btn-sm btn-danger" disabled={!!reported} onClick={() => dispatch({ type: 'aiq.report', id: q.id })}>
                  <Icon name="alert" size={16} />{reported ? t.review.reported : t.review.report}
                </button>
              )}
            </div>
            <div className="card card-tight"><Tutor question={q} seed={a.seed} choice={choice} storeKey={`${a.id}|${q.id}`} /></div>
          </>
        )}
      </main>

      <footer className="exam-foot">
        <div className="exam-foot-inner">
          <button className="btn" onClick={() => go(`/review/${a.id}/${i - 1}`, true)} disabled={i === 0}><Icon name="chevronLeft" size={18} />{t.common.previous}</button>
          <span style={{ flex: 1 }} />
          {i < total - 1
            ? <button className="btn btn-primary" onClick={() => go(`/review/${a.id}/${i + 1}`, true)}>{t.common.next}<Icon name="chevronRight" size={18} /></button>
            : <a className="btn btn-primary" href={`#/results/${a.id}`}>{t.review.finish}</a>}
        </div>
      </footer>
    </div>
  )
}
