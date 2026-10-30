import { useEffect, useState, type FormEvent } from 'react'
import { authClient, PROVIDERS, type Provider } from '../lib/auth'
import { signedIn } from '../lib/store'
import { useT } from '../i18n'
import { LangPicker } from '../components/ui'
import { LegalLinks } from './Legal'

type Mode = 'in' | 'up'

export default function AuthView() {
  const t = useT()
  const [mode, setMode] = useState<Mode>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  // OAuth errors come back as ?error=<code>
  const [err, setErr] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    return code ? t.auth.errors[code] ?? t.auth.errors.generic : ''
  })
  const [providers, setProviders] = useState<Provider[]>([])

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then((c: { providers?: Provider[] }) => setProviders(c.providers ?? [])).catch(() => {})
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  }, [])

  const message = (e: { code?: string; message?: string } | null | undefined) => t.auth.errors[e?.code ?? ''] ?? e?.message ?? t.auth.errors.generic

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
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

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="stack" style={{ width: '100%', maxWidth: 440, gap: 16 }}>
        <div className="row-between">
          <div className="row"><span className="brand-mark" aria-hidden="true">CC</span><strong style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{t.common.appName}</strong></div>
          <LangPicker />
        </div>

        <section className="card" aria-labelledby="auth-h">
          <div className="stack" style={{ gap: 6 }}>
            <h1 id="auth-h" style={{ fontSize: 24 }}>{t.auth.tagline}</h1>
            <p className="small muted">{t.auth.intro}</p>
          </div>

          <div className="seg" role="group" aria-label={t.auth.signIn + ' / ' + t.auth.signUp}>
            <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setErr('') }}>{t.auth.signIn}</button>
            <button type="button" aria-pressed={mode === 'up'} onClick={() => { setMode('up'); setErr('') }}>{t.auth.signUp}</button>
          </div>

          {providers.length > 0 && (
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
            <div className="field">
              <label htmlFor="email">{t.auth.email}</label>
              <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
            </div>
            <div className="field">
              <label htmlFor="password">{t.auth.password}</label>
              <input id="password" className="input" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'up' ? 10 : undefined} maxLength={128}
                aria-describedby={mode === 'up' ? 'pw-hint' : undefined} />
              {mode === 'up' && <span id="pw-hint" className="tiny muted">{t.auth.passwordHint}</span>}
            </div>
            {mode === 'up' && (
              <label className="row small" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required style={{ width: 20, height: 20, flex: 'none', marginTop: 2 }} />
                <span>{t.auth.accept} <a href="#/legal/terminos">{t.auth.terms}</a> {t.auth.and} <a href="#/legal/privacidad">{t.auth.privacy}</a>.</span>
              </label>
            )}
            {err && <p role="alert" className="small" style={{ color: 'var(--bad-ink)' }}>{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || (mode === 'up' && !accepted)}>
              {busy ? t.auth.working : mode === 'up' ? t.auth.signUp : t.auth.signIn}
            </button>
            <p className="tiny muted">{t.auth.noReset}{providers.length > 0 ? ' ' + t.auth.oauthReplacesPassword : ''}</p>
          </form>
        </section>

        <footer className="site-foot"><LegalLinks /></footer>
      </div>
    </main>
  )
}
