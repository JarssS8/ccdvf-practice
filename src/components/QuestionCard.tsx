import { displayLetter, optionOrder, relabel, stemParts, type Letter, type Question } from '../shared/exam'
import { useT } from '../i18n'
import { Icon } from './Icon'

interface Props {
  q: Question
  seed: number
  selected: Letter[]
  onToggle?: (l: Letter) => void
  reveal?: boolean
  showDomain?: boolean
}

/** A stem's prose and its ``` code blocks, as text (never HTML). The first prose part is the page heading when `heading`. */
export function Stem({ text, heading = true }: { text: string; heading?: boolean }) {
  return <>{stemParts(text).map((p, i) => p.code
    ? <pre key={i} className="stem-code"><code>{p.text}</code></pre>
    : i === 0 && heading ? <h1 key={i}>{p.text}</h1> : <p key={i}>{p.text}</p>)}</>
}

/** Renders a question with options in the attempt's shuffled order; letters are relabelled for display. */
export function QuestionCard({ q, seed, selected, onToggle, reveal, showDomain }: Props) {
  const t = useT()
  const order = optionOrder(q, seed)
  const multi = q.answer.length > 1
  const name = `q-${q.id}`
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 8 }}>
        {showDomain && <span className="chip chip-accent">{t.domains[q.domain] ?? q.domain}</span>}
        <span className="chip">{t.question.selectN(q.answer.length)}</span>
        {q.source === 'ai' && <span className="chip"><Icon name="sparkle" size={12} />{t.sources.ai}</span>}
        {q.source === 'app' && <span className="chip">{t.sources.app}</span>}
        {q.source === 'lote' && <span className="chip">{t.lotes.name(q.lote ?? 2)}</span>}
      </div>
      <div className="q-stem" id={`${name}-stem`}><Stem text={q.question} /></div>
      <fieldset className="options" aria-labelledby={`${name}-stem`}>
        <legend className="sr-only">{t.question.chooseN(q.answer.length)}</legend>
        {order.map((orig, i) => {
          const on = selected.includes(orig)
          const correct = q.answer.includes(orig)
          const cls = reveal ? (correct ? 'correct' : on ? 'wrong' : '') : on ? 'selected' : ''
          return (
            <label key={orig} className={`option ${cls} ${reveal || !onToggle ? 'locked' : ''}`}>
              <input type={multi ? 'checkbox' : 'radio'} name={name} checked={on} disabled={reveal || !onToggle}
                onChange={() => onToggle?.(orig)} aria-describedby={reveal ? `${name}-${orig}-mark` : undefined} />
              <span className="key" aria-hidden="true">{displayLetter(i)}</span>
              <span className="txt"><span className="sr-only">{displayLetter(i)}. </span>{q.options[orig]}</span>
              {reveal && (correct || on) && (
                <span id={`${name}-${orig}-mark`} className="mark" style={{ color: correct ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>
                  <Icon name={correct ? 'check' : 'x'} size={14} stroke={2.4} />{correct ? t.question.correct : t.question.yourAnswer}
                </span>
              )}
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}

export function Explanation({ q, seed }: { q: Question; seed: number }) {
  const t = useT()
  return (
    <section className="card card-tight" aria-label={t.question.explanation}>
      <div className="eyebrow">{t.question.explanation} · {t.sources[q.source] ?? q.source}</div>
      <p style={{ fontSize: 15 }}>{relabel(q.rationale, q, seed)}</p>
      {q.evidence && <p className="small muted">{q.ref ? t.question.evidenceNote(q.evidence) : t.question.evidence(q.evidence)}</p>}
      {q.ref && /^https:\/\//.test(q.ref) && <a className="small" href={q.ref} target="_blank" rel="noopener noreferrer">{t.question.officialSource}</a>}
    </section>
  )
}
