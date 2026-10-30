import { useEffect, useMemo, type ReactNode } from 'react'
import { Icon } from './components/Icon'
import { SyncBadge } from './components/ui'
import { questionIndex } from './lib/content'
import { useRoute } from './lib/router'
import { checkSession, sync, useStore } from './lib/store'
import { closeExpired } from './lib/actions'
import { useT } from './i18n'
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
import AuthView from './views/Auth'
import Legal, { LegalLinks } from './views/Legal'

const NAV = [
  { path: '', key: 'home', icon: 'home' },
  { path: 'exams', key: 'exams', icon: 'exam' },
  { path: 'domains', key: 'domains', icon: 'target' },
  { path: 'cards', key: 'cards', icon: 'cards' },
  { path: 'progress', key: 'progress', icon: 'chart' },
] as const

export function useQuestions() {
  const { data } = useStore()
  return useMemo(() => questionIndex(data.aiQuestions), [data.aiQuestions])
}

function Shell({ section, children }: { section: string; children: ReactNode }) {
  const { status, pending } = useStore()
  const t = useT()
  const isActive = (p: string) => (p === '' ? section === '' : section === p)
  return (
    <>
      <a href="#main" className="sr-only">{t.common.skip}</a>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand"><span className="brand-mark" aria-hidden="true">CC</span><span className="brand-name">CCDV-F</span></a>
          <nav className="topnav" aria-label={t.nav.main}>
            {[...NAV, { path: 'notes', key: 'notes', icon: 'book' } as const].map((n) => (
              <a key={n.path} href={`#/${n.path}`} aria-current={isActive(n.path) ? 'page' : undefined}>{t.nav[n.key]}</a>
            ))}
          </nav>
          <div className="row" style={{ marginLeft: 'auto', gap: 4, flexWrap: 'nowrap' }}>
            <SyncBadge status={status} pending={pending} onClick={() => void sync()} />
            <a href="#/notes" className="btn btn-ghost icon-btn mobile-only" aria-label={t.nav.notes}><Icon name="book" /></a>
            <a href="#/settings" className="btn btn-ghost icon-btn" aria-label={t.nav.settings}><Icon name="settings" /></a>
          </div>
        </div>
      </header>
      <main id="main" className="page">
        {children}
        <footer className="site-foot"><LegalLinks /></footer>
      </main>
      <nav className="tabbar" aria-label={t.nav.main}>
        {NAV.map((n) => (
          <a key={n.path} href={`#/${n.path}`} aria-current={isActive(n.path) ? 'page' : undefined}><Icon name={n.icon} size={22} /><span className="tab-label">{t.nav[n.key]}</span></a>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  const route = useRoute()
  const t = useT()
  const { authed, hasSnapshot, data } = useStore()
  useEffect(() => { void checkSession() }, [])
  // Timed attempts that ran out anywhere are closed wherever the app is open
  useEffect(() => {
    closeExpired()
    const id = setInterval(closeExpired, 15_000)
    return () => clearInterval(id)
  }, [data])

  const [section = '', id, extra] = route
  // Legal pages are public: readable before signing up
  if (section === 'legal') return <Legal page={id ?? 'aviso'} />
  if (authed === false) return <AuthView />
  if (authed === null && !hasSnapshot) return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} aria-busy="true"><p className="muted">{t.common.loading}</p></main>

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
