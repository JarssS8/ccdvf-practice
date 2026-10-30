import { useEffect, useRef, useState } from 'react'
import { PASS_P, fmtDate, fmtNum, type domainMisses, type domainTrends } from '../lib/engine'
import { useLang, useT } from '../i18n'

const MISS_CUT = 1 - PASS_P // missing more than this share is below the pass mark

/** Horizontal bars: share of answers missed per domain, worst (in exam marks) first. One series: one hue, no legend. */
export function DomainMissBars({ rows }: { rows: ReturnType<typeof domainMisses> }) {
  const t = useT()
  const lang = useLang()
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(0.5, ...rows.map((r) => r.rate))
  const x = (v: number) => `${(v / max) * 100}%`
  return (
    <figure className="hbars" style={{ margin: 0 }} aria-label={t.progress.missChartAria}>
      {rows.map((r) => (
        <div key={r.name} className="hbar-row" tabIndex={0} onMouseEnter={() => setHover(r.name)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.name)} onBlur={() => setHover(null)}
          aria-label={r.n ? t.progress.missRowAria(t.domains[r.name], Math.round(r.rate * 100), r.wrong, r.n) : `${t.domains[r.name]}: ${t.common.noData}`}>
          <span className="hbar-label">{t.domains[r.name]}</span>
          <span className="hbar-track">
            {r.n > 0 && <span className="hbar-cut" style={{ left: x(MISS_CUT) }} aria-hidden="true" />}
            {r.n > 0 && <span className="hbar-fill" style={{ width: x(r.rate) }} />}
            {hover === r.name && r.n > 0 && (
              <span className="chart-tip" role="tooltip" style={{ left: x(r.rate), top: 0 }}>{t.progress.missTip(r.wrong, r.n, fmtNum(r.weight, lang))}</span>
            )}
          </span>
          <span className="hbar-value">{r.n ? t.common.percent(Math.round(r.rate * 100)) : <span className="muted">—</span>}</span>
        </div>
      ))}
      <figcaption className="tiny muted">{t.progress.missCaption(Math.round(MISS_CUT * 100))}</figcaption>
    </figure>
  )
}

/** Small multiples: per domain, hit rate over the last 10 answers, one point per answer. */
export function DomainTrendGrid({ trends }: { trends: ReturnType<typeof domainTrends> }) {
  const t = useT()
  return (
    <div className="trend-grid">
      {trends.map((d) => <Spark key={d.name} name={t.domains[d.name]} points={d.points} />)}
    </div>
  )
}

function Spark({ name, points }: { name: string; points: { at: number; p: number; n: number }[] }) {
  const t = useT()
  const lang = useLang()
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(240)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const H = 64, P = 6
  const last = points.at(-1)
  const x = (i: number) => P + (points.length < 2 ? (W - 2 * P) / 2 : (i / (points.length - 1)) * (W - 2 * P))
  const y = (p: number) => P + (1 - p) * (H - 2 * P)
  const d = points.map((pt, i) => `${i ? 'L' : 'M'}${x(i)},${y(pt.p)}`).join(' ')
  const move = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || !points.length) return
    const rel = (clientX - box.left - P) / Math.max(1, W - 2 * P)
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))))
  }
  const h = hover != null ? points[hover] : null
  return (
    <div className="trend-card">
      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 8, minHeight: 40 }}>
        <span className="small" style={{ fontWeight: 600, minWidth: 0, lineHeight: 1.3 }}>{name}</span>
        <span className="small mono" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{last ? t.common.percent(Math.round(last.p * 100)) : '—'}</span>
      </div>
      {points.length < 2 ? (
        <p className="tiny muted" style={{ height: H, display: 'grid', placeItems: 'center', margin: 0 }}>{points.length ? t.progress.trendFew : t.common.noData}</p>
      ) : (
        <div ref={ref} style={{ position: 'relative' }} onMouseMove={(e) => move(e.clientX)} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" style={{ display: 'block', overflow: 'visible' }}
            aria-label={t.progress.trendAria(name, Math.round(points[0].p * 100), Math.round(last!.p * 100), points.length)}>
            <line x1={P} x2={W - P} y1={y(PASS_P)} y2={y(PASS_P)} stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 4" />
            <path d={d} fill="none" stroke="var(--mark)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={P} y2={H - P} stroke="var(--line-strong)" strokeWidth={1} />}
            <circle cx={x(hover ?? points.length - 1)} cy={y((h ?? last!).p)} r={4} fill="var(--mark)" stroke="var(--surface)" strokeWidth={2} />
          </svg>
          {h && hover != null && (
            <div className="chart-tip" role="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.p) / H) * 100}%` }}>
              {fmtDate(h.at, lang)} · <strong>{t.common.percent(Math.round(h.p * 100))}</strong> {t.progress.trendTipOf(h.n)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
