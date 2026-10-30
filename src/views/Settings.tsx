import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { LangPicker, SyncBadge } from '../components/ui'
import { meta } from '../lib/content'
import { fmtDate } from '../lib/engine'
import { api, deleteAccount, deviceId, dispatch, exportBackup, logout, now, setAiConsent, sync, useStore } from '../lib/store'
import { errorText, ownText, useLang, useT } from '../i18n'
import { answersCsv } from '../lib/export'
import { useQuestions } from '../App'

type Theme = 'auto' | 'light' | 'dark'
export const applyTheme = (t: Theme) => {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}
export const savedTheme = (): Theme => { try { return (localStorage.getItem('ccdvf_theme') as Theme) || 'auto' } catch { return 'auto' } }

export default function Settings() {
  const { data, status, pending, lastError } = useStore()
  const t = useT()
  const lang = useLang()
  const qs = useQuestions()
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const [date, setDate] = useState(data.settings.exam_date?.value ?? '')
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { applyTheme(theme); try { localStorage.setItem('ccdvf_theme', theme) } catch { /* ignore */ } }, [theme])
  useEffect(() => setDate(data.settings.exam_date?.value ?? ''), [data.settings.exam_date?.value])

  const save = (content: string, type: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url; a.download = `ccdvf-${ext === 'csv' ? 'answers' : 'data'}-${new Date().toISOString().slice(0, 10)}.${ext}`; a.click()
    URL.revokeObjectURL(url)
  }

  const consent = async (on: boolean) => {
    setBusy(true); setErr('')
    try { const r = await api<{ aiConsentAt: number | null }>('/api/ai/consent', { method: 'POST', body: JSON.stringify({ consent: on }) }); setAiConsent(r.aiConsentAt) }
    catch (e) { setErr(errorText(t, (e as Error).message)) }
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true); setErr('')
    try { await deleteAccount(password || undefined) } catch (e) {
      const code = (e as Error).message
      setErr(code === 'SESSION_EXPIRED' ? t.settings.deleteFresh : ownText(t.auth.errors, code) ?? errorText(t, code))
    }
    setBusy(false)
  }

  const user = data.user
  return (
    <>
      <h1 className="h-page">{t.settings.title}</h1>
      {err && <p role="alert" className="callout callout-bad">{err}</p>}

      <section className="card" aria-labelledby="ac-h">
        <h2 id="ac-h" className="h-section">{t.settings.account}</h2>
        {user && <p className="small">{t.settings.signedInAs(user.email)}</p>}
        <div className="row">
          <button className="btn btn-sm" onClick={() => void logout(false)}><Icon name="logout" size={16} />{t.settings.signOut}</button>
          <button className="btn btn-sm" onClick={() => { if (confirm(t.settings.signOutAllConfirm)) void logout(true) }}>{t.settings.signOutAll}</button>
        </div>
      </section>

      <section className="card" aria-labelledby="ln-h">
        <h2 id="ln-h" className="h-section">{t.settings.language}</h2>
        <LangPicker />
        <span className="tiny muted">{t.common.examLangNote}</span>
      </section>

      <section className="card" aria-labelledby="ex-h">
        <h2 id="ex-h" className="h-section">{t.settings.exam}</h2>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="exam-date">{t.settings.examDate}</label>
          <input id="exam-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)}
            onBlur={() => { if (date !== (data.settings.exam_date?.value ?? '')) dispatch({ type: 'setting', key: 'exam_date', value: date, updatedAt: now() }) }} />
          <span className="tiny muted">{t.settings.examDateNote}</span>
        </div>
      </section>

      <section className="card" aria-labelledby="th-h">
        <h2 id="th-h" className="h-section">{t.settings.appearance}</h2>
        <div className="seg" role="group" aria-label={t.settings.theme}>
          {(['auto', 'light', 'dark'] as Theme[]).map((x) => (
            <button key={x} aria-pressed={theme === x} onClick={() => setTheme(x)}>{t.settings.themes[x]}</button>
          ))}
        </div>
        <span className="tiny muted">{t.settings.thisDevice}</span>
      </section>

      <section className="card" aria-labelledby="ai-h">
        <h2 id="ai-h" className="h-section">{t.settings.ai}</h2>
        {!data.ai.enabled ? <p className="small muted">{t.settings.aiOff}</p> : (
          <>
            <p className="small">{t.settings.aiOn(data.ai.usedToday, data.ai.dailyLimit)}</p>
            {user?.aiConsentAt ? (
              <div className="row-between">
                <p className="small muted">{t.settings.aiConsented(fmtDate(user.aiConsentAt, lang))}</p>
                <button className="btn btn-sm" disabled={busy} onClick={() => void consent(false)}>{t.settings.aiWithdraw}</button>
              </div>
            ) : (
              <div className="row-between">
                <p className="small muted">{t.settings.aiNotConsented} <a href="#/legal/privacidad">{t.tutor.privacyLink}</a></p>
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void consent(true)}>{t.settings.aiAccept}</button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card" aria-labelledby="sy-h">
        <h2 id="sy-h" className="h-section">{t.settings.sync}</h2>
        <div className="row"><SyncBadge status={status} pending={pending} onClick={() => void sync()} /><button className="btn btn-sm" onClick={() => void sync()}><Icon name="refresh" size={16} />{t.settings.syncNow}</button></div>
        {lastError && <p className="small" style={{ color: 'var(--bad-ink)' }}>{errorText(t, lastError)}</p>}
        <p className="small muted">{t.settings.syncText(deviceId.slice(0, 8))}</p>
      </section>

      <section className="card" aria-labelledby="dt-h">
        <h2 id="dt-h" className="h-section">{t.settings.yourData}</h2>
        <p className="small muted">{t.settings.exportText} {t.settings.exportCsvText}</p>
        <div className="row">
          <button className="btn btn-sm" onClick={() => save(exportBackup(), 'application/json', 'json')}><Icon name="download" size={16} />{t.settings.export}</button>
          <button className="btn btn-sm" onClick={() => save(answersCsv(data, qs, t, lang), 'text/csv;charset=utf-8', 'csv')}><Icon name="download" size={16} />{t.settings.exportCsv}</button>
        </div>
      </section>

      <section className="card" aria-labelledby="ct-h">
        <h2 id="ct-h" className="h-section">{t.settings.content}</h2>
        <p className="small muted">{t.settings.contentText(meta.counts.questions, meta.counts.flashcards, fmtDate(Date.parse(meta.syncedAt), lang), meta.factsVerified)}</p>
      </section>

      <section className="card" aria-labelledby="del-h">
        <h2 id="del-h" className="h-section">{t.settings.deleteTitle}</h2>
        <p className="small muted">{t.settings.deleteText}</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="del-confirm">{t.settings.deleteConfirmLabel(t.settings.deleteWord)}</label>
            <input id="del-confirm" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="del-pw">{t.settings.deletePassword}</label>
            <input id="del-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn btn-danger" disabled={busy || confirmText.trim().toUpperCase() !== t.settings.deleteWord} onClick={() => void remove()}>{t.settings.delete}</button>
        </div>
      </section>
    </>
  )
}
