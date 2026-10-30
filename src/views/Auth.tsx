import { useEffect, useState, type FormEvent } from 'react'
import { authClient, PROVIDERS, type Provider } from '../lib/auth'
import { logout, signedIn } from '../lib/store'
import { ownText, setLang, useLang, useT } from '../i18n'
import { LangPicker } from '../components/ui'
import { LegalLinks } from './Legal'

type Mode = 'in' | 'up' | 'forgot' | 'reset'

// The reset link lands on /?lang=xx&token=… (or ?error=INVALID_TOKEN); OAuth errors on ?error=<code>
const query = new URLSearchParams(window.location.search)
const resetToken = query.get('token')
let resetPending = !!resetToken
/** True while a reset link is being handled: shown even if this browser has a session. */
export const isResetPending = () => resetPending

export default function AuthView() {
  const t = useT()
  const lang = useLang()
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [err, setErr] = useState(() => {
    const code = query.get('error')
    return code ? ownText(t.auth.errors, code) ?? t.auth.errors.generic : ''
  })
  const [providers, setProviders] = useState<Provider[]>([])
  const [canReset, setCanReset] = useState(false)

  useEffect(() => {
    const l = query.get('lang')
    if (l === 'es' || l === 'en') setLang(l)
    fetch('/api/config').then((r) => r.json()).then((c: { providers?: Provider[]; recovery?: boolean }) => {
      setProviders(c.providers ?? []); setCanReset(!!c.recovery)
    }).catch(() => {})
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  }, [])

  const message = (e: { code?: string; message?: string } | null | undefined) => ownText(t.auth.errors, e?.code) ?? e?.message ?? t.auth.errors.generic
  const go = (m: Mode) => { if (m !== 'reset') resetPending = false; setMode(m); setErr(''); setNotice('') }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(''); setNotice('')
    if (mode === 'forgot') {
      const r = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `/?lang=${lang}` })
      if (r.error) setErr(message(r.error))
      else setNotice(t.auth.linkSent)
      setBusy(false); return
    }
    if (mode === 'reset') {
      const r = await authClient.resetPassword({ newPassword: password, token: resetToken ?? '' })
      setBusy(false)
      if (r.error) { setErr(message(r.error)); return }
      // Every session was revoked, this one included: sign in again with the new password
      resetPending = false
      await logout().catch(() => {})
      setPassword(''); setMode('in'); setNotice(t.auth.passwordChanged)
      return
    }
    const r = mode === 'up'
      ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
      : await authClient.signIn.email({ email: email.trim(), password })
    if (r.error) { setErr(message(r.error)); setBusy(false); return }
    await signedIn()
    setBusy(false)
  }

  const social = async (provider: Provider) => {
    setBusy(true); setErr('')
    const r = await authClient.signIn.social({ provider, callbackURL: '/', errorCallbackURL: '/' })
    if (r?.error) { setErr(message(r.error)); setBusy(false) }
  }

  const tabs = mode === 'in' || mode === 'up'
  const label = { in: t.auth.signIn, up: t.auth.signUp, forgot: t.auth.sendLink, reset: t.auth.setPassword }[mode]

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="stack" style={{ width: '100%', maxWidth: 440, gap: 16 }}>
        <div className="row-between">
          <div className="row"><span className="brand-mark" aria-hidden="true">CC</span><strong style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{t.common.appName}</strong></div>
          <LangPicker />
        </div>

        <section className="card" aria-labelledby="auth-h">
          {tabs ? (
            <div className="stack" style={{ gap: 6 }}>
              <h1 id="auth-h" style={{ fontSize: 24 }}>{t.auth.tagline}</h1>
              <p className="small muted">{t.auth.intro}</p>
            </div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <h1 id="auth-h" style={{ fontSize: 24 }}>{mode === 'forgot' ? t.auth.forgotTitle : t.auth.resetTitle}</h1>
              <p className="small muted">{mode === 'forgot' ? t.auth.forgotText : t.auth.resetText}</p>
            </div>
          )}

          {tabs && (
            <div className="seg" role="group" aria-label={t.auth.signIn + ' / ' + t.auth.signUp}>
              <button type="button" aria-pressed={mode === 'in'} onClick={() => go('in')}>{t.auth.signIn}</button>
              <button type="button" aria-pressed={mode === 'up'} onClick={() => go('up')}>{t.auth.signUp}</button>
            </div>
          )}

          {tabs && providers.length > 0 && (
            <>
              <div className="stack" style={{ gap: 8 }}>
                {PROVIDERS.filter((p) => providers.includes(p.id)).map((p) => (
                  <button key={p.id} type="button" className="btn btn-block" disabled={busy} onClick={() => void social(p.id)}>{t.auth.continueWith(p.label)}</button>
                ))}
                <p className="tiny muted">{t.auth.oauthNotice}</p>
              </div>
              <div className="row tiny muted" style={{ gap: 10 }} aria-hidden="true"><span className="rule" />{t.auth.or}<span className="rule" /></div>
            </>
          )}

          <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
            {mode === 'up' && (
              <div className="field">
                <label htmlFor="name">{t.auth.name}</label>
                <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
              </div>
            )}
            {mode !== 'reset' && (
              <div className="field">
                <label htmlFor="email">{t.auth.email}</label>
                <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
              </div>
            )}
            {mode !== 'forgot' && (
              <div className="field">
                <div className="row-between">
                  <label htmlFor="password">{mode === 'reset' ? t.auth.newPassword : t.auth.password}</label>
                  {mode === 'in' && canReset && <button type="button" className="btn-link small" onClick={() => go('forgot')}>{t.auth.forgot}</button>}
                </div>
                <input id="password" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'in' ? undefined : 10} maxLength={128}
                  aria-describedby={mode === 'in' ? undefined : 'pw-hint'} />
                {mode !== 'in' && <span id="pw-hint" className="tiny muted">{t.auth.passwordHint}</span>}
              </div>
            )}
            {mode === 'up' && (
              <label className="row small" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required style={{ width: 20, height: 20, flex: 'none', marginTop: 2 }} />
                <span>{t.auth.accept} <a href="#/legal/terminos">{t.auth.terms}</a> {t.auth.and} <a href="#/legal/privacidad">{t.auth.privacy}</a>.</span>
              </label>
            )}
            {notice && <p role="status" className="callout callout-ok small">{notice}</p>}
            {err && <p role="alert" className="small" style={{ color: 'var(--bad-ink)' }}>{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || (mode === 'up' && !accepted) || (mode === 'forgot' && !!notice)}>
              {busy ? t.auth.working : label}
            </button>
            {!tabs && <button type="button" className="btn btn-ghost btn-block" onClick={() => go('in')}>{t.auth.backToSignIn}</button>}
            {tabs && <p className="tiny muted">{canReset ? '' : t.auth.noReset + ' '}{providers.length > 0 ? t.auth.oauthReplacesPassword : ''}</p>}
          </form>
        </section>

        <footer className="site-foot"><LegalLinks /></footer>
      </div>
    </main>
  )
}
