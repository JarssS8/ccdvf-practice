import { Icon } from '../components/Icon'
import { LangPicker, Markdown } from '../components/ui'
import { useLang, useT } from '../i18n'
import { en } from '../legal/en'
import { es } from '../legal/es'
import { LEGAL_INFO } from '../legal/info'
import { fmtDate } from '../lib/engine'

const PAGES = ['aviso', 'privacidad', 'cookies', 'terminos'] as const

export function LegalLinks() {
  const t = useT()
  const label = { aviso: t.footer.legal, privacidad: t.footer.privacy, cookies: t.footer.cookies, terminos: t.footer.terms }
  return (
    <>
      {PAGES.map((p) => <a key={p} href={`#/legal/${p}`}>{label[p]}</a>)}
      <span className="note">{t.footer.notAffiliated}</span>
    </>
  )
}

/** Public pages: readable without an account. */
export default function Legal({ page }: { page: string }) {
  const t = useT()
  const lang = useLang()
  const id = (PAGES as readonly string[]).includes(page) ? page : 'aviso'
  const text = (lang === 'es' ? es : en)[id]
  return (
    <main className="legal-page stack" id="main">
      <div className="row-between">
        <button type="button" className="btn btn-ghost btn-sm" style={{ paddingLeft: 8 }} onClick={() => (history.length > 1 ? history.back() : location.assign('#/'))}>
          <Icon name="chevronLeft" size={18} />{t.legal.back}
        </button>
        <LangPicker />
      </div>
      <article className="card" lang={lang}>
        <h1 className="h-page">{t.legal.titles[id]}</h1>
        <p className="tiny muted">{t.legal.updated(fmtDate(Date.parse(LEGAL_INFO.updated), lang))}</p>
        <Markdown source={text} />
      </article>
      <footer className="site-foot"><LegalLinks /></footer>
    </main>
  )
}
