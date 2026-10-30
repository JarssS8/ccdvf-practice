import { useMemo, type ReactNode } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Icon } from './Icon'
import { PASS_P, type Estimate } from '../lib/engine'
import { EXAM } from '../shared/exam'
import type { SyncStatus } from '../lib/store'
import { LANGS, setLang, useLang, useT } from '../i18n'

export function Meter({ value, bad, label }: { value: number; bad?: boolean; label: string }) {
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
      <span className={bad ? 'bad' : undefined} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

/** 100–1000 scale with the 95% interval, the point estimate and the 720 cut. */
export function ScaleBar({ est }: { est: Estimate }) {
  const t = useT()
  const pos = (p: number) => `${p * 100}%`
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="scale" aria-hidden="true">
        <div className="range" style={{ left: pos(est.lo), width: pos(est.hi - est.lo) }} />
        <div className="cut" style={{ left: pos(PASS_P) }} />
        <div className="point" style={{ left: pos(est.p) }} />
      </div>
      <div className="row-between tiny muted">
        <span>{EXAM.scaleMin}</span>
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.ui.cut(EXAM.passScaled)}</span>
        <span>{EXAM.scaleMax}</span>
      </div>
    </div>
  )
}

export function ZoneChip({ zone }: { zone: Estimate['zone'] }) {
  const t = useT()
  if (zone === 'likely') return <span className="chip chip-ok"><Icon name="check" size={14} stroke={2.4} />{t.ui.likely}</span>
  if (zone === 'below') return <span className="chip chip-bad"><Icon name="alert" size={14} />{t.ui.below}</span>
  return <span className="chip chip-accent"><Icon name="target" size={14} />{t.ui.borderline}</span>
}

export function SyncBadge({ status, pending, onClick }: { status: SyncStatus; pending: number; onClick?: () => void }) {
  const t = useT()
  const map: Record<SyncStatus, { icon: string; text: string; color: string }> = {
    synced: { icon: 'check', text: t.sync.synced, color: 'var(--ok)' },
    syncing: { icon: 'refresh', text: t.sync.syncing, color: 'var(--muted)' },
    pending: { icon: 'cloud', text: t.sync.pending(pending), color: 'var(--muted)' },
    offline: { icon: 'cloudOff', text: t.sync.offline(pending), color: 'var(--bad)' },
    error: { icon: 'alert', text: t.sync.error, color: 'var(--bad)' },
  }
  const s = map[status]
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={onClick} aria-label={`${s.text}. ${t.sync.now}`} title={t.sync.now} style={{ color: 'var(--muted)', fontWeight: 500 }}>
      <span style={{ color: s.color, display: 'inline-flex' }}><Icon name={s.icon} size={16} /></span>
      <span className="tiny">{s.text}</span>
    </button>
  )
}

export const REPO_BASE = 'https://github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS/blob/main/developer-foundations/'

export function Markdown({ source, base = REPO_BASE }: { source: string; base?: string }) {
  const html = useMemo(() => {
    const clean = DOMPurify.sanitize(marked.parse(source, { async: false }) as string)
    // Relative links point into the upstream repo
    return clean.replace(/href="(?!https?:|#|mailto:)([^"]+)"/g, (_, href) => `href="${new URL(href, base).href}" target="_blank" rel="noopener noreferrer"`)
  }, [source, base])
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 8px', gap: 8 }}>
      <span className="badge-icon"><Icon name={icon} /></span>
      <strong>{title}</strong>
      {children && <div className="small muted" style={{ maxWidth: 420 }}>{children}</div>}
    </div>
  )
}

export function LangPicker() {
  const lang = useLang()
  const t = useT()
  return (
    <div className="seg" role="group" aria-label={t.common.language}>
      {LANGS.map((l) => <button key={l.id} type="button" lang={l.id} aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>{l.label}</button>)}
    </div>
  )
}
