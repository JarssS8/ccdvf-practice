import { useRef } from 'react'
import { Icon } from './Icon'
import { CERTS, type CertDef } from '../shared/certs'
import { useCert } from '../lib/cert'
import { attemptsOf, pct } from '../lib/engine'
import { chooseCert, useStore, type Data } from '../lib/store'
import { useT, type Dict } from '../i18n'

/** What a certification you are not on looks like from here: an exam left open, your last mock, or nothing yet. */
function statusOf(data: Data, cert: CertDef, t: Dict) {
  const mine = attemptsOf(data, cert)
  if (mine.some((a) => a.status === 'active')) return t.cert.inProgress
  const mock = mine.filter((a) => a.status === 'submitted' && a.result && (a.mode === 'full' || a.mode === 'quick'))
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))[0]
  if (mock?.result) return t.cert.lastMock(pct(mock.result.correct, mock.result.total))
  return mine.length ? '' : t.cert.notStarted
}

/** The brand in the top bar names the certification being studied and switches it. */
export function CertSwitcher() {
  const cert = useCert()
  const { data } = useStore()
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const close = () => dialog.current?.close()
  const pick = (id: string) => { chooseCert(id); close() }

  return (
    <>
      <button type="button" className="brand-switch" aria-haspopup="dialog" aria-label={t.cert.trigger(cert.code)} onClick={() => dialog.current?.showModal()}>
        <span>{cert.code}</span>
        <Icon name="chevronDown" size={18} stroke={2.4} />
      </button>
      {/* A click on the backdrop lands on the dialog itself: the panel fills it edge to edge */}
      <dialog ref={dialog} className="cert-dialog" aria-labelledby="cert-dialog-h" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
        <div className="cert-panel">
          <div className="row-between" style={{ padding: '0 0 4px 12px', flexWrap: 'nowrap' }}>
            <h2 id="cert-dialog-h" className="eyebrow">{t.cert.title}</h2>
            <button type="button" className="btn btn-ghost icon-btn" aria-label={t.common.close} onClick={close}><Icon name="x" /></button>
          </div>
          {CERTS.map((c) => {
            const on = c.id === cert.id
            const status = on ? '' : statusOf(data, c, t)
            return (
              <button key={c.id} type="button" className="cert-opt" aria-current={on ? 'true' : undefined} onClick={() => pick(c.id)}>
                <span className="cert-sq" style={{ background: c.tint }} aria-hidden="true">{c.initials}</span>
                <span className="cert-txt">
                  <span className="cert-name">{c.short}</span>
                  <span className="cert-meta">{t.cert.rowFacts(c.code, c.items)}{status && ` · ${status}`}</span>
                </span>
                {on && <span className="cert-tick"><Icon name="check" size={14} stroke={3} label={t.cert.selected} /></span>}
              </button>
            )
          })}
          <p className="cert-meta" style={{ padding: '10px 12px 2px' }}>{t.cert.note}</p>
        </div>
      </dialog>
    </>
  )
}
