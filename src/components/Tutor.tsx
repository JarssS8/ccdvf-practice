import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Letter, Question } from '../shared/exam'
import { api, setAiConsent, useStore } from '../lib/store'
import { isCorrect } from '../lib/engine'
import { errorText, useLang, useT } from '../i18n'
import { Icon } from './Icon'
import { Markdown } from './ui'

type Msg = { role: 'user' | 'assistant'; content: string }

// Conversations are kept per question on this device (and wiped on sign-out)
const keyOf = (k: string) => `ccdvf_tutor_${k}`
const loadMsgs = (k: string): Msg[] => { try { return JSON.parse(localStorage.getItem(keyOf(k)) ?? '[]') as Msg[] } catch { return [] } }
const saveMsgs = (k: string, m: Msg[]) => { try { localStorage.setItem(keyOf(k), JSON.stringify(m.slice(-20))) } catch { /* storage full */ } }

/** The server rebuilds the question from its id and the attempt's seed, so only ids and letters leave the device. */
export function Tutor({ question, seed, choice, storeKey }: { question: Question; seed: number; choice: Letter[]; storeKey: string }) {
  const { data } = useStore()
  const t = useT()
  const lang = useLang()
  const [msgs, setMsgs] = useState<Msg[]>(() => loadMsgs(storeKey))
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { setMsgs(loadMsgs(storeKey)); setErr('') }, [storeKey])

  if (!data.ai.enabled) return <p className="small muted">{t.tutor.disabled}</p>

  if (!data.user?.aiConsentAt) {
    const accept = async () => {
      setBusy(true); setErr('')
      try { const r = await api<{ aiConsentAt: number }>('/api/ai/consent', { method: 'POST', body: JSON.stringify({ consent: true }) }); setAiConsent(r.aiConsentAt) }
      catch (e) { setErr(errorText(t, (e as Error).message)) }
      setBusy(false)
    }
    return (
      <section className="stack" aria-label={t.tutor.title} style={{ gap: 10 }}>
        <div className="eyebrow row" style={{ gap: 6 }}><span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Icon name="sparkle" size={16} /></span>{t.tutor.title}</div>
        <p className="small">{t.tutor.needConsent} <a href="#/legal/privacidad">{t.tutor.privacyLink}</a></p>
        {err && <p role="alert" className="small" style={{ color: 'var(--bad-ink)' }}>{err}</p>}
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void accept()}>{t.tutor.accept}</button>
      </section>
    )
  }

  const ask = async (q: string) => {
    if (!q.trim() || busy) return
    const history: Msg[] = [...msgs, { role: 'user', content: q.trim() }]
    setMsgs([...history, { role: 'assistant', content: '' }])
    setText(''); setBusy(true); setErr('')
    abort.current = new AbortController()
    try {
      const res = await fetch('/api/ai/tutor', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: abort.current.signal,
        body: JSON.stringify({ qid: question.id, seed, choice, lang, messages: history }),
      })
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = '', out = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content
            if (delta) { out += delta; setMsgs([...history, { role: 'assistant', content: out }]) }
          } catch { /* keep-alive or partial line */ }
        }
      }
      if (!out) throw new Error('empty_answer')
      saveMsgs(storeKey, [...history, { role: 'assistant', content: out }])
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setErr(errorText(t, (e as Error).message)); setMsgs(history) }
    } finally { setBusy(false) }
  }

  const correct = isCorrect(question, choice)
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text) }

  return (
    <section className="stack" aria-label={t.tutor.title} style={{ gap: 10 }}>
      <div className="eyebrow row" style={{ gap: 6 }}><span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Icon name="sparkle" size={16} /></span>{t.tutor.title}</div>
      <div className="stack" style={{ gap: 8 }} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'me' : 'ai'}`}>
            {!m.content ? <span className="muted">{t.tutor.thinking}</span> : m.role === 'assistant' ? <Markdown source={m.content} /> : m.content}
          </div>
        ))}
      </div>
      {err && <p role="alert" className="small" style={{ color: 'var(--bad-ink)' }}>{t.tutor.failed(err)}</p>}
      {msgs.length === 0 && (
        <div className="row" style={{ gap: 8 }}>
          {(correct ? t.tutor.quickRight : t.tutor.quickWrong).map((q) => <button key={q} type="button" className="btn btn-sm" onClick={() => void ask(q)} disabled={busy}>{q}</button>)}
        </div>
      )}
      <form onSubmit={submit} className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
        <label htmlFor={`ask-${question.id}`} className="sr-only">{t.tutor.label}</label>
        <input id={`ask-${question.id}`} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.tutor.placeholder} maxLength={1500} />
        <button className="btn btn-primary icon-btn" aria-label={t.tutor.send} disabled={busy || !text.trim()} style={{ width: 48, height: 48 }}><Icon name="send" size={18} /></button>
      </form>
      <p className="tiny muted">{t.tutor.disclaimer}</p>
    </section>
  )
}
