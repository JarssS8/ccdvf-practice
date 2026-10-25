import type { Letter, Question } from '../shared/exam'
import { displayLetter, optionOrder } from '../lib/engine'
import { SOURCE_LABEL } from '../lib/content'
import { Icon } from './Icon'

interface Props {
  q: Question
  seed: number
  selected: Letter[]
  onToggle?: (l: Letter) => void
  reveal?: boolean
  showDomain?: boolean
}

/** Renders a question with options in the attempt's shuffled order; letters are relabelled for display. */
export function QuestionCard({ q, seed, selected, onToggle, reveal, showDomain }: Props) {
  const order = optionOrder(q, seed)
  const multi = q.answer.length > 1
  const name = `q-${q.id}`
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 8 }}>
        {showDomain && <span className="chip chip-accent">{q.domain}</span>}
        <span className="chip">{multi ? `Selecciona ${q.answer.length}` : 'Selecciona 1'}</span>
        {q.source === 'ai' && <span className="chip"><Icon name="sparkle" size={12} />{SOURCE_LABEL.ai}</span>}
      </div>
      <h1 className="q-stem" id={`${name}-stem`}>{q.question}</h1>
      <fieldset className="options" aria-labelledby={`${name}-stem`}>
        <legend className="sr-only">{multi ? `Elige ${q.answer.length} opciones` : 'Elige una opción'}</legend>
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
                  <Icon name={correct ? 'check' : 'x'} size={14} stroke={2.4} />{correct ? 'Correcta' : 'Tu respuesta'}
                </span>
              )}
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}

/** Rationales cite options as "(B)" or "(A, C)" by original letter; rewrite them to the shuffled display letters. */
export function relabel(text: string, q: Question, seed: number) {
  const order = optionOrder(q, seed)
  const map = (l: string) => { const i = order.indexOf(l as Letter); return i < 0 ? l : displayLetter(i) }
  return text.replace(/\(([A-E](?:,\s*[A-E])*)\)/g, (_, inner: string) => `(${inner.split(/,\s*/).map(map).sort().join(', ')})`)
}

/** The question as the viewer sees it (shuffled order, display letters): what the tutor must talk about. */
export function asDisplayed(q: Question, seed: number, choice: Letter[]) {
  const order = optionOrder(q, seed)
  const to = (l: Letter) => displayLetter(order.indexOf(l))
  const options: Question['options'] = {}
  order.forEach((orig, i) => { options[displayLetter(i)] = q.options[orig] })
  return {
    question: { ...q, options, answer: q.answer.map(to).sort(), rationale: relabel(q.rationale, q, seed) },
    choice: choice.map(to).sort(),
  }
}

export function Explanation({ q, seed }: { q: Question; seed: number }) {
  return (
    <section className="card card-tight" aria-label="Explicación">
      <div className="eyebrow">Explicación · {SOURCE_LABEL[q.source] ?? q.source}</div>
      <p style={{ fontSize: 15 }}>{relabel(q.rationale, q, seed)}</p>
      {q.evidence && <p className="small muted">Fuente citada (apuntes o temario oficial): «{q.evidence}»</p>}
    </section>
  )
}
