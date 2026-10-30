import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuestions } from '../App'
import { Icon } from '../components/Icon'
import { Explanation, QuestionCard } from '../components/QuestionCard'
import { Tutor } from '../components/Tutor'
import { discardAttempt, submitAttempt } from '../lib/actions'
import { attemptLang, attemptTitle, fmtDuration, isCorrect, optionOrder } from '../lib/engine'
import { localize } from '../lib/content'
import { LangOverride, useLang, useT } from '../i18n'
import { go } from '../lib/router'
import { dispatch, leaseLost, now, useStore } from '../lib/store'
import type { Letter } from '../shared/exam'

const posKey = (id: string) => `ccdvf_pos_${id}`

/** Exam simulations render in English whatever the app language (attemptLang). */
export default function ExamView({ id }: { id: string }) {
  const { data } = useStore()
  const a = data.attempts[id]
  return <LangOverride lang={a ? attemptLang(a) : 'en'}><Attempt id={id} /></LangOverride>
}

function Attempt({ id }: { id: string }) {
  const { data, status } = useStore()
  const t = useT()
  const lang = useLang()
  const qs = useQuestions()
  const a = data.attempts[id]
  const [idx, setIdx] = useState(() => { try { return Number(localStorage.getItem(posKey(id)) ?? 0) } catch { return 0 } })
  const [draft, setDraft] = useState<Letter[]>([])
  const [tick, setTick] = useState(now())
  const [announce, setAnnounce] = useState('')
  const [showTutor, setShowTutor] = useState(false)
  const gridRef = useRef<HTMLDialogElement>(null)
  const submitRef = useRef<HTMLDialogElement>(null)
  const warned = useRef<Set<number>>(new Set())

  const total = a?.questionIds.length ?? 0
  const qid = a?.questionIds[Math.min(idx, total - 1)]
  const orig = qid ? qs.get(qid) : undefined
  const q = orig ? localize(orig, lang) : undefined
  const saved = a && qid ? data.answers[`${a.id}|${qid}`] : undefined
  const remaining = a?.deadline ? a.deadline - tick : null
  const lost = a ? leaseLost(a.id) : false
  const checked = !!a?.feedback && !!saved?.choice.length
  const selected = a?.feedback ? (checked ? saved!.choice : draft) : saved?.choice ?? []

  useEffect(() => { try { localStorage.setItem(posKey(id), String(idx)) } catch { /* ignore */ } }, [id, idx])
  useEffect(() => { setDraft([]); setShowTutor(false) }, [qid])

  // Clock: wall time, so it keeps running across reloads and devices
  useEffect(() => {
    if (!a?.deadline || a.status !== 'active') return
    const t = setInterval(() => setTick(now()), 1000)
    return () => clearInterval(t)
  }, [a?.deadline, a?.status])

  useEffect(() => {
    if (remaining == null || !a || a.status !== 'active') return
    for (const m of [15, 5, 1]) {
      if (remaining <= m * 60_000 && remaining > (m - 1) * 60_000 && !warned.current.has(m)) {
        warned.current.add(m)
        setAnnounce(t.exam.minutesLeft(m))
      }
    }
    if (remaining <= 0) { submitAttempt(a.id); go(`/results/${a.id}/timeout`, true) }
  }, [remaining, a, t])

  useEffect(() => {
    if (a?.status === 'submitted') go(`/results/${a.id}`, true)
    else if (a?.status === 'discarded') go('/', true)
  }, [a?.status, a?.id])

  const save = useCallback((choice: Letter[], flagged: boolean) => {
    if (!a || !qid) return
    dispatch({ type: 'answer', attemptId: a.id, qid, choice, flagged, updatedAt: now() })
  }, [a, qid])

  const toggle = useCallback((l: Letter) => {
    if (!q || lost || checked) return
    const n = q.answer.length
    const cur = selected
    const next = n === 1 ? [l] : cur.includes(l) ? cur.filter((x) => x !== l) : cur.length < n ? [...cur, l] : cur
    if (a?.feedback) setDraft(next)
    else save(next, saved?.flagged ?? false)
  }, [q, lost, checked, selected, a?.feedback, save, saved?.flagged])

  const flag = useCallback(() => { if (!lost) save(saved?.choice ?? [], !saved?.flagged) }, [lost, save, saved])
  const check = useCallback(() => { if (draft.length === q?.answer.length) save(draft, saved?.flagged ?? false) }, [draft, q, save, saved?.flagged])
  const move = useCallback((d: number) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d))), [total])

  const answeredCount = a ? a.questionIds.filter((x) => data.answers[`${a.id}|${x}`]?.choice.length).length : 0
  const flaggedCount = a ? a.questionIds.filter((x) => data.answers[`${a.id}|${x}`]?.flagged).length : 0

  const openSubmit = () => submitRef.current?.showModal()
  const finish = () => { if (!a) return; submitAttempt(a.id); go(`/results/${a.id}`, true) }

  // Keyboard: 1-5 / A-E choose, ←/→ or J/K move, F flags, Enter checks or advances
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input[type=text], textarea, dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (!q || !a) return
      const order = optionOrder(q, a.seed)
      const k = e.key.toLowerCase()
      const n = '12345'.indexOf(k) >= 0 ? '12345'.indexOf(k) : 'abcde'.indexOf(k)
      if (n >= 0 && n < order.length) { e.preventDefault(); toggle(order[n]) }
      else if (k === 'arrowright' || k === 'j') { e.preventDefault(); move(1) }
      else if (k === 'arrowleft' || k === 'k') { e.preventDefault(); move(-1) }
      else if (k === 'f') { e.preventDefault(); flag() }
      else if (k === 'enter' && t.tagName !== 'BUTTON') {
        e.preventDefault()
        if (a.feedback && !checked) check()
        else if (idx < total - 1) move(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, a, toggle, move, flag, check, checked, idx, total])

  if (!a) {
    return (
      <main className="page" style={{ maxWidth: 560 }}>
        <h1 className="h-page">{t.common.attemptNotFound}</h1>
        <p className="muted">{status === 'offline' ? t.common.offlineNotHere : t.common.maybeSyncing}</p>
        <a className="btn" href="#/">{t.common.backHome}</a>
      </main>
    )
  }
  if (!q) return <main className="page"><p>{t.common.questionUnavailable}</p><a className="btn" href="#/">{t.common.home}</a></main>

  const last = idx === total - 1
  const warn = remaining != null && remaining <= 5 * 60_000

  return (
    <div className="exam">
      <header className="exam-head">
        <div className="exam-head-inner">
          <div className="row-between" style={{ flexWrap: 'nowrap' }}>
            <a href="#/" className="btn icon-btn" aria-label={a.deadline ? t.exam.exitTimed : t.exam.exit}> <Icon name="x" /></a>
            <div style={{ textAlign: 'center', minWidth: 0 }}>
              <div className="tiny muted" style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attemptTitle(a, t)}</div>
              <button type="button" className="btn btn-ghost btn-sm mono" onClick={() => gridRef.current?.showModal()} aria-label={t.exam.position(idx + 1, total)} style={{ minHeight: 32, padding: '0 8px' }}>
                {idx + 1} / {total} <Icon name="grid" size={14} />
              </button>
            </div>
            {remaining != null ? (
              <div className={`timer ${warn ? 'warn' : ''}`} role="timer" aria-label={t.exam.timeLeft(fmtDuration(remaining))}>
                <Icon name="clock" size={16} />{fmtDuration(remaining)}
              </div>
            ) : (
              <span className="chip">{t.exam.practice}</span>
            )}
          </div>
          <div className="meter" aria-hidden="true" style={{ height: 6 }}><span style={{ width: `${(answeredCount / total) * 100}%` }} /></div>
        </div>
        <div className="sr-only" aria-live="assertive">{announce}</div>
      </header>

      <main className="exam-body" id="main">
        {lost && (
          <div className="callout callout-info" role="alert">
            <strong>{t.exam.otherDevice}</strong>
            <p className="small">{t.exam.otherDeviceText}</p>
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => dispatch({ type: 'attempt.lease', attemptId: a.id })}>{t.exam.continueHere}</button>
          </div>
        )}

        <QuestionCard q={q} seed={a.seed} selected={selected} onToggle={lost ? undefined : toggle} reveal={checked} showDomain={a.feedback} />

        {a.feedback && checked && (
          <>
            <div className={`callout ${isCorrect(q, saved!.choice) ? 'callout-ok' : 'callout-bad'}`} role="status">
              <strong className="row" style={{ gap: 6, color: isCorrect(q, saved!.choice) ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>
                <Icon name={isCorrect(q, saved!.choice) ? 'check' : 'x'} size={18} stroke={2.4} />{isCorrect(q, saved!.choice) ? t.exam.correct : t.exam.incorrect}
              </strong>
            </div>
            <Explanation q={q} seed={a.seed} />
            {showTutor
              ? <div className="card card-tight"><Tutor question={q} seed={a.seed} choice={saved!.choice} storeKey={`${a.id}|${q.id}`} /></div>
              : data.ai.enabled && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowTutor(true)}><Icon name="sparkle" size={18} />{t.exam.askTutor}</button>}
          </>
        )}

        <p className="tiny muted desktop-only row" style={{ gap: 6 }}>
          <Icon name="keyboard" size={16} /><span className="kbd">1</span>–<span className="kbd">4</span> {t.exam.keysChoose} · <span className="kbd">←</span><span className="kbd">→</span> {t.exam.keysMove} · <span className="kbd">F</span> {t.exam.keysFlag} · <span className="kbd">Enter</span> {a.feedback ? t.exam.keysCheck : t.exam.keysNext}
        </p>
      </main>

      <footer className="exam-foot">
        <div className="exam-foot-inner">
          <button type="button" className="btn icon-btn" onClick={() => move(-1)} disabled={idx === 0} aria-label={t.exam.previous}><Icon name="chevronLeft" /></button>
          <button type="button" className={`btn ${saved?.flagged ? 'flag-on' : ''}`} onClick={flag} aria-pressed={!!saved?.flagged} disabled={lost}>
            <Icon name="flag" size={18} />{saved?.flagged ? t.exam.flagged : t.exam.flag}
          </button>
          {a.feedback && !checked ? (
            <button type="button" className="btn btn-ink" style={{ flex: 1 }} onClick={check} disabled={draft.length !== q.answer.length || lost}>{t.exam.check}</button>
          ) : last ? (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={openSubmit}>{t.common.submit}</button>
          ) : (
            <button type="button" className="btn btn-ink" style={{ flex: 1 }} onClick={() => move(1)}>{t.common.next}<Icon name="chevronRight" size={18} /></button>
          )}
        </div>
      </footer>

      <dialog ref={gridRef} aria-labelledby="grid-h" onClick={(e) => { if (e.target === gridRef.current) gridRef.current?.close() }}>
        <div className="dialog-body">
          <div className="row-between"><h2 id="grid-h" className="h-section">{t.exam.map}</h2><button className="btn btn-ghost icon-btn" aria-label={t.common.close} onClick={() => gridRef.current?.close()}><Icon name="x" /></button></div>
          <p className="small muted">{t.exam.mapSummary(answeredCount, flaggedCount, total - answeredCount)}</p>
          <div className="qgrid">
            {a.questionIds.map((x, i) => {
              const s = data.answers[`${a.id}|${x}`]
              const st = [s?.choice.length ? 'answered' : '', s?.flagged ? 'flagged' : '', i === idx ? 'current' : ''].join(' ')
              return <button key={x} className={st} onClick={() => { setIdx(i); gridRef.current?.close() }} aria-label={t.exam.mapItem(i + 1, !!s?.choice.length, !!s?.flagged)}>{i + 1}</button>
            })}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-danger" onClick={() => { if (confirm(t.common.discardConfirm)) { discardAttempt(a.id); go('/', true) } }}>{t.exam.discardAttempt}</button>
            <button className="btn btn-primary" onClick={() => { gridRef.current?.close(); openSubmit() }}>{t.common.submit}</button>
          </div>
        </div>
      </dialog>

      <dialog ref={submitRef} aria-labelledby="sub-h">
        <div className="dialog-body">
          <h2 id="sub-h" className="h-section">{t.exam.submitTitle(a.feedback)}</h2>
          {total - answeredCount > 0
            ? <p className="callout callout-bad small"><strong>{t.exam.blank(total - answeredCount)}</strong> {t.exam.blankText}</p>
            : <p className="small muted">{t.exam.allAnswered}</p>}
          {flaggedCount > 0 && <p className="small">{t.exam.flaggedForReview(flaggedCount)}</p>}
          {remaining != null && <p className="small muted">{t.exam.timeRemaining(fmtDuration(remaining))}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => submitRef.current?.close()}>{t.exam.keepGoing}</button>
            <button className="btn btn-primary" onClick={finish}>{t.common.submit}</button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
