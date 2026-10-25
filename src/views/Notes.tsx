import { useState } from 'react'
import { Markdown, REPO_BASE } from '../components/ui'
import { meta, news, notes } from '../lib/content'
import { fmtDate } from '../lib/engine'

const TABS = [
  { id: 'cheat', label: 'Cheat sheet' },
  { id: 'notes', label: 'Apuntes' },
  { id: 'news', label: 'Novedades' },
] as const

export default function Notes() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('cheat')
  return (
    <>
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <h1 className="h-page">Apuntes</h1>
        <p className="tiny muted">Del repo · sincronizado {fmtDate(Date.parse(meta.syncedAt))}{meta.factsVerified ? ` · datos verificados ${meta.factsVerified}` : ''}</p>
      </div>
      <div className="seg" role="group" aria-label="Sección">
        {TABS.map((t) => <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <div className="card">
        {tab === 'cheat' && <Markdown source={notes.cheatSheet} />}
        {tab === 'notes' && <Markdown source={notes.notes} />}
        {tab === 'news' && (
          <div className="stack" style={{ gap: 28 }}>
            {news.map((n) => (
              <article key={n.title} className="stack" style={{ gap: 8 }}>
                <h2 className="h-section" style={{ fontSize: 19 }}>{n.title} · {n.year}</h2>
                <Markdown source={n.body} base={new URL('../guide/', REPO_BASE).href} />
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
