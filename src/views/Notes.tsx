import { Icon } from '../components/Icon'
import { Markdown, REPO_ROOT, repoBase } from '../components/ui'
import { guide, guideText, metaOf, newsFor, notesFor } from '../lib/content'
import { examDateOf, studyWeek, useCert } from '../lib/cert'
import { fmtDate } from '../lib/engine'
import { now, useStore } from '../lib/store'
import { useLang, useT } from '../i18n'

const NOTE_TABS = ['cheat', 'notes', 'confusions', 'courses', 'plan', 'news'] as const
type Tab = (typeof NOTE_TABS)[number]
const GUIDE_BASE = `${REPO_ROOT}guide/`


export default function Notes({ tab: wanted }: { tab?: string }) {
  const t = useT()
  const lang = useLang()
  const cert = useCert()
  const { data } = useStore()
  const tab: Tab = (NOTE_TABS as readonly string[]).includes(wanted ?? '') ? (wanted as Tab) : 'cheat'
  const meta = metaOf(cert)
  const notes = notesFor(cert, lang)
  const g = (key: string, en: string) => guideText(key, en, lang)

  return (
    <>
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <h1 className="h-page">{t.notesView.title}</h1>
        <p className="tiny muted">{t.notesView.meta(fmtDate(Date.parse(meta.syncedAt), lang), meta.factsVerified)}</p>
      </div>
      {/* Links, not buttons: each tab has its own address, so Home can point at the plan */}
      <nav className="seg seg-tabs" aria-label={t.notesView.section}>
        {NOTE_TABS.map((id) => <a key={id} href={`#/notes/${id}`} aria-current={tab === id ? 'page' : undefined}>{t.notesView.tabs[id]}</a>)}
      </nav>

      {tab === 'cheat' && <div className="card"><Markdown source={notes.cheatSheet} base={repoBase(cert)} /></div>}
      {tab === 'notes' && <div className="card"><Markdown source={notes.notes} base={repoBase(cert)} /></div>}

      {tab === 'confusions' && (
        <>
          <p className="muted" style={{ maxWidth: '68ch' }}>{t.guideView.confusionsIntro}</p>
          <div className="grid-auto">
            {guide.confusions.map((c) => (
              <article key={c.id} className="card" aria-labelledby={`cf-${c.id}`}>
                <h2 id={`cf-${c.id}`} className="h-section">{g(`confusion:${c.id}:title`, c.title)}</h2>
                <Markdown source={g(`confusion:${c.id}:body`, c.body)} base={GUIDE_BASE} />
              </article>
            ))}
          </div>
        </>
      )}

      {tab === 'courses' && <Courses />}
      {tab === 'plan' && <Plan examDate={examDateOf(data, cert)} />}

      {tab === 'news' && (
        <div className="card">
          <div className="stack" style={{ gap: 28 }}>
            {newsFor(lang).map((n) => (
              <article key={n.title} className="stack" style={{ gap: 8 }}>
                <h2 className="h-section" style={{ fontSize: 19 }}>{n.title} · {n.year}</h2>
                <Markdown source={n.body} base={GUIDE_BASE} />
              </article>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Courses() {
  const t = useT()
  const lang = useLang()
  const cert = useCert()
  const mine = guide.courses.filter((c) => c.certs.includes(cert.id))
  const others = guide.courses.filter((c) => !c.certs.includes(cert.id))
  const videos = guide.videos.filter((v) => v.certs.includes(cert.id))
  const path = guide.prepPaths[cert.id]
  const row = (c: (typeof guide.courses)[number]) => (
    <li key={c.id} className="course-row">
      <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={t.guideView.open(c.title)}>
        <span className="row" style={{ gap: 8 }}>
          <strong>{c.title}</strong>
          {c.extra && <span className="chip chip-accent">{t.guideView.newInAcademy}</span>}
        </span>
        <span className="small muted">{guideText(`course:${c.id}`, c.summary, lang)}</span>
      </a>
    </li>
  )
  return (
    <>
      {path && (
        <a className="tile tile-link tile-lilac" href={path} target="_blank" rel="noopener noreferrer" style={{ minHeight: 0 }}>
          <span className="row-between" style={{ width: '100%', flexWrap: 'nowrap' }}>
            <strong>{t.guideView.prepPath(cert.code)}</strong>
            <Icon name="arrowRight" size={18} />
          </span>
          <span className="small muted">{t.guideView.prepPathNote}</span>
        </a>
      )}
      <section className="card" aria-labelledby="cs-h">
        <div className="stack" style={{ gap: 4 }}>
          <h2 id="cs-h" className="h-section">{t.guideView.forCert(cert.code)}</h2>
          <p className="small muted">{t.guideView.coursesNote}</p>
        </div>
        <ul className="course-list">{mine.map(row)}</ul>
        {others.length > 0 && (
          <details className="course-more">
            <summary>{t.guideView.otherCourses(others.length)}</summary>
            <ul className="course-list">{others.map(row)}</ul>
          </details>
        )}
      </section>
      {videos.length > 0 && (
        <section className="card" aria-labelledby="vd-h">
          <h2 id="vd-h" className="h-section">{t.guideView.videos}</h2>
          <ul className="course-list">
            {videos.map((v) => (
              <li key={v.id} className="course-row">
                <a href={v.url} target="_blank" rel="noopener noreferrer" aria-label={t.guideView.watch(v.title)}>
                  <strong>{v.title}</strong>
                  {v.summary && <span className="small muted">{guideText(`video:${v.id}`, v.summary, lang)}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function Plan({ examDate }: { examDate: string | undefined }) {
  const t = useT()
  const lang = useLang()
  const cert = useCert()
  const g = (key: string, en: string) => guideText(key, en, lang)
  const s = guide.strategy
  const where = studyWeek(examDate, now())
  const emphasis = s.emphasis[cert.id]
  return (
    <>
      {emphasis && (
        <section className="tile tile-sun" aria-labelledby="pl-h">
          <h2 id="pl-h" className="h-section">{t.guideView.planFor(cert.code)}</h2>
          <Markdown source={g(`emphasis:${cert.id}`, emphasis)} base={GUIDE_BASE} />
        </section>
      )}
      <section className="stack" aria-labelledby="wk-h" style={{ gap: 12 }}>
        <div className="row-between">
          <h2 id="wk-h" className="h-section">{t.guideView.weeks}</h2>
          <span className="small muted">
            {!where ? <a href="#/settings">{t.guideView.noDate}</a> : 'past' in where ? t.guideView.past : 'far' in where ? t.guideView.farAway(where.far) : null}
          </span>
        </div>
        <div className="grid-auto">
          {s.weeks.map((w, i) => {
            const current = !!where && 'week' in where && where.week === i
            return (
              <article key={i} className={`card week-card${current ? ' current' : ''}`} aria-current={current ? 'step' : undefined}>
                <div className="row-between">
                  <h3 className="h-section" style={{ fontSize: 18 }}>{g(`week:${i}:title`, w.title)}</h3>
                  {current && <span className="chip chip-accent">{t.guideView.thisWeek}</span>}
                </div>
                <Markdown source={g(`week:${i}:body`, w.body)} base={GUIDE_BASE} />
              </article>
            )
          })}
        </div>
      </section>
      <div className="grid-auto">
        <section id="exam-week" className="card" aria-labelledby="ew-h">
          <h2 id="ew-h" className="h-section">{t.guideView.examWeek}</h2>
          <ul className="check-list">{s.examWeek.map((x, i) => <li key={i}><Icon name="check" size={16} /><span><Markdown source={g(`examWeek:${i}`, x)} base={GUIDE_BASE} /></span></li>)}</ul>
        </section>
        <section className="card" aria-labelledby="du-h">
          <h2 id="du-h" className="h-section">{t.guideView.during}</h2>
          <ul className="check-list">{s.during.map((x, i) => <li key={i}><Icon name="clock" size={16} /><span><Markdown source={g(`during:${i}`, x)} base={GUIDE_BASE} /></span></li>)}</ul>
        </section>
      </div>
      <p className="tiny muted">{t.guideView.source}</p>
    </>
  )
}
