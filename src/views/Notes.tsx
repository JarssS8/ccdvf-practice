import { useState } from 'react'
import { Markdown, REPO_ROOT, repoBase } from '../components/ui'
import { metaOf, newsFor, notesFor } from '../lib/content'
import { useCert } from '../lib/cert'
import { fmtDate } from '../lib/engine'
import { useLang, useT } from '../i18n'

const TABS = ['cheat', 'notes', 'news'] as const

export default function Notes() {
  const t = useT()
  const lang = useLang()
  const cert = useCert()
  const meta = metaOf(cert)
  const notes = notesFor(cert, lang)
  const news = newsFor(lang)
  const [tab, setTab] = useState<(typeof TABS)[number]>('cheat')
  return (
    <>
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <h1 className="h-page">{t.notesView.title}</h1>
        <p className="tiny muted">{t.notesView.meta(fmtDate(Date.parse(meta.syncedAt), lang), meta.factsVerified)}</p>
      </div>
      <div className="seg" role="group" aria-label={t.notesView.section}>
        {TABS.map((id) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{t.notesView.tabs[id]}</button>)}
      </div>
      <div className="card">
        {tab === 'cheat' && <Markdown source={notes.cheatSheet} base={repoBase(cert)} />}
        {tab === 'notes' && <Markdown source={notes.notes} base={repoBase(cert)} />}
        {tab === 'news' && (
          <div className="stack" style={{ gap: 28 }}>
            {news.map((n) => (
              <article key={n.title} className="stack" style={{ gap: 8 }}>
                <h2 className="h-section" style={{ fontSize: 19 }}>{n.title} · {n.year}</h2>
                <Markdown source={n.body} base={`${REPO_ROOT}guide/`} />
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
