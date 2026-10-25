import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from './components/Icon'
import { SyncBadge } from './components/ui'
import { questionIndex } from './lib/content'
import { useRoute } from './lib/router'
import { checkSession, login, sync, useStore } from './lib/store'
import { closeExpired } from './lib/actions'
import Home from './views/Home'
import Exams from './views/Exams'
import ExamView from './views/Exam'
import Results from './views/Results'
import ReviewView from './views/Review'
import Domains from './views/Domains'
import Cards from './views/Cards'
import Notes from './views/Notes'
import Progress from './views/Progress'
import Settings from './views/Settings'

const NAV = [
  { path: '', label: 'Inicio', icon: 'home' },
  { path: 'exams', label: 'Exámenes', icon: 'exam' },
  { path: 'domains', label: 'Dominios', icon: 'target' },
  { path: 'cards', label: 'Tarjetas', icon: 'cards' },
  { path: 'progress', label: 'Progreso', icon: 'chart' },
]

export function useQuestions() {
  const { data } = useStore()
  return useMemo(() => questionIndex(data.aiQuestions), [data.aiQuestions])
}

function Shell({ section, children }: { section: string; children: ReactNode }) {
  const { status, pending } = useStore()
  const isActive = (p: string) => (p === '' ? section === '' : section === p)
  return (
    <>
      <a href="#main" className="sr-only">Saltar al contenido</a>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand"><span className="brand-mark" aria-hidden="true">CC</span><span className="brand-name">CCDV-F Practice</span></a>
          <nav className="topnav" aria-label="Principal">
            {[...NAV, { path: 'notes', label: 'Apuntes', icon: 'book' }].map((n) => (
              <a key={n.path} href={`#/${n.path}`} aria-current={isActive(n.path) ? 'page' : undefined}>{n.label}</a>
            ))}
          </nav>
          <div className="row" style={{ marginLeft: 'auto', gap: 4, flexWrap: 'nowrap' }}>
            <SyncBadge status={status} pending={pending} onClick={() => void sync()} />
            <a href="#/notes" className="btn btn-ghost icon-btn mobile-only" aria-label="Apuntes"><Icon name="book" /></a>
            <a href="#/settings" className="btn btn-ghost icon-btn" aria-label="Ajustes"><Icon name="settings" /></a>
          </div>
        </div>
      </header>
      <main id="main" className="page">{children}</main>
      <nav className="tabbar" aria-label="Principal">
        {NAV.map((n) => (
          <a key={n.path} href={`#/${n.path}`} aria-current={isActive(n.path) ? 'page' : undefined}><Icon name={n.icon} size={22} />{n.label}</a>
        ))}
      </nav>
    </>
  )
}

function Login() {
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await login(pass) } catch (x) { setErr((x as Error).message === 'auth' ? 'Frase de acceso incorrecta.' : (x as Error).message) }
    setBusy(false)
  }
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div className="row"><span className="brand-mark" aria-hidden="true">CC</span><h1 style={{ fontSize: 22 }}>CCDV-F Practice</h1></div>
        <p className="small muted">Tu progreso vive en tu cuenta de Cloudflare. Entra con tu frase de acceso para sincronizarlo en este dispositivo.</p>
        <div className="field">
          <label htmlFor="pass">Frase de acceso</label>
          <input id="pass" className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        </div>
        {err && <p role="alert" className="small" style={{ color: 'var(--bad-ink)' }}>{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !pass}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  )
}

export default function App() {
  const route = useRoute()
  const { authed, hasSnapshot, data } = useStore()
  useEffect(() => { void checkSession() }, [])
  // Timed attempts that ran out anywhere are closed wherever the app is open
  useEffect(() => {
    closeExpired()
    const t = setInterval(closeExpired, 15_000)
    return () => clearInterval(t)
  }, [data])

  if (authed === false) return <Login />
  if (authed === null && !hasSnapshot) return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} aria-busy="true"><p className="muted">Cargando…</p></main>

  const [section = '', id, extra] = route
  if (section === 'exam' && id) return <ExamView id={id} />
  if (section === 'review' && id) return <ReviewView id={id} index={Number(extra ?? 0)} />

  let view: ReactNode
  switch (section) {
    case 'exams': view = <Exams />; break
    case 'results': view = id ? <Results id={id} timeout={extra === 'timeout'} /> : <Progress />; break
    case 'domains': view = <Domains />; break
    case 'cards': view = <Cards />; break
    case 'notes': view = <Notes />; break
    case 'progress': view = <Progress />; break
    case 'settings': view = <Settings />; break
    default: view = <Home />
  }
  return <Shell section={section === 'results' ? 'progress' : section}>{view}</Shell>
}
