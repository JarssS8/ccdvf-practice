import { Icon } from '../components/Icon'
import { CERTS, SCALE } from '../shared/certs'
import { chooseCert } from '../lib/store'
import { useT } from '../i18n'
import { LegalLinks } from './Legal'

const COMPARE = 'https://github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS/blob/main/guide/compared.md'

/** First run of a new account: which certification to prepare. Everything else follows from it. */
export default function CertPick() {
  const t = useT()
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand"><span className="brand-mark" aria-hidden="true">CC</span><span className="brand-name">{t.common.appName}</span></span>
        </div>
      </header>
      <main id="main" className="page pick-page">
        <div className="stack" style={{ gap: 10 }}>
          <p className="eyebrow">{t.cert.pickEyebrow}</p>
          <h1 className="h-page">{t.cert.pickTitle}</h1>
          <p className="muted" style={{ maxWidth: '56ch' }}>{t.cert.pickText}</p>
        </div>
        <div className="pick-grid">
          {CERTS.map((c) => (
            <button key={c.id} type="button" className="tile-link pick-tile" style={{ background: c.tint }} onClick={() => chooseCert(c.id)} aria-label={t.cert.pickAria(c.name)}>
              <span className="row-between" style={{ width: '100%', flexWrap: 'nowrap' }}>
                <span className="eyebrow">{c.code}</span>
                <span className="pick-go" aria-hidden="true"><Icon name="arrowRight" size={20} /></span>
              </span>
              <span className="stack" style={{ gap: 4 }}>
                <span className="h-tile">{c.short}</span>
                <span className="small muted">{t.cert.pickFacts(c.items, c.minutes, SCALE.pass)}</span>
              </span>
            </button>
          ))}
        </div>
        <a className="small" href={COMPARE} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, alignSelf: 'flex-start', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>{t.cert.compare}</a>
        <footer className="site-foot"><LegalLinks /></footer>
      </main>
    </>
  )
}
