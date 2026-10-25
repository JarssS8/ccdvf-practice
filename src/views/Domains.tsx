import { useMemo, useState } from 'react'
import { useQuestions } from '../App'
import { Icon } from '../components/Icon'
import { Meter } from '../components/ui'
import { groupOf } from '../lib/content'
import { startAttempt } from '../lib/actions'
import { domainStats, exposures, pct } from '../lib/engine'
import { addAiQuestions, api, sync, useStore } from '../lib/store'
import { DOMAINS, type Question } from '../shared/exam'

interface GenResult { accepted: Question[]; rejected: { question: string; reason: string }[] }

export default function Domains() {
  const { data } = useStore()
  const qs = useQuestions()
  const [err, setErr] = useState('')
  const [genDomain, setGenDomain] = useState<string>(DOMAINS[0].name)
  const [multi, setMulti] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gen, setGen] = useState<GenResult | null>(null)
  const exp = useMemo(() => exposures(data, qs), [data, qs])
  const stats = useMemo(() => domainStats(exp, qs), [exp, qs])
  const seen = useMemo(() => new Set(exp.map((e) => e.group)), [exp])
  const all = [...qs.values()]
  const aiActive = all.filter((q) => q.source === 'ai' && !q.reported)

  const generate = async () => {
    setBusy(true); setErr(''); setGen(null)
    try {
      const r = await api<GenResult>('/api/ai/generate', { method: 'POST', body: JSON.stringify({ domain: genDomain, count: 4, multi }) })
      addAiQuestions(r.accepted)
      void sync()
      setGen(r)
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="h-page">Por dominio</h1>
        <p className="muted">Drills de 10 con corrección al momento. Priorizan lo que no has visto y lo que hace más tiempo que no ves.</p>
      </div>
      {err && <p role="alert" className="callout callout-bad">{err}</p>}

      <section className="card" aria-labelledby="dl-h">
        <h2 id="dl-h" className="sr-only">Dominios</h2>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Dominio</th><th className="num">Peso</th><th className="num">Banco</th><th className="num">Sin ver</th><th>Primer intento</th><th className="num">Últimas 60</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {stats.map((d) => {
                const pool = all.filter((q) => q.domain === d.name && q.source !== 'ai')
                const groups = new Set(pool.map(groupOf))
                const unseen = [...groups].filter((g) => !seen.has(g)).length
                const aiN = aiActive.filter((q) => q.domain === d.name).length
                return (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 500, minWidth: 180 }}>{d.name}</td>
                    <td className="num">{d.weight.toLocaleString('es-ES')} %</td>
                    <td className="num">{groups.size}{aiN ? <span className="muted"> +{aiN} IA</span> : null}</td>
                    <td className="num">{unseen}</td>
                    <td style={{ minWidth: 140 }}>
                      {d.first.n ? (
                        <div className="stack" style={{ gap: 4 }}>
                          <span className="mono tiny">{pct(d.first.c, d.first.n)} % · {d.first.c}/{d.first.n}</span>
                          <Meter value={pct(d.first.c, d.first.n)} bad={d.first.n >= 3 && d.first.c / d.first.n < 0.69} label={`${d.name} primer intento`} />
                        </div>
                      ) : <span className="tiny muted">sin datos</span>}
                    </td>
                    <td className="num">{d.recent.n ? `${pct(d.recent.c, d.recent.n)} %` : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => setErr(startAttempt('drill', d.name) ?? '')}>Drill</button>
                        {aiN > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setErr(startAttempt('ai', d.name) ?? '')} aria-label={`Drill IA de ${d.name}`}><Icon name="sparkle" size={16} />IA</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">«Banco» cuenta conceptos distintos: las preguntas casi idénticas entre práctica y mocks cuentan una vez.</p>
      </section>

      <section className="card" aria-labelledby="ai-h">
        <div className="row-between">
          <h2 id="ai-h" className="h-section row" style={{ gap: 8 }}><span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Icon name="sparkle" /></span>Preguntas nuevas con IA</h2>
          {data.ai.enabled && <span className="tiny muted mono">{data.ai.usedToday}/{data.ai.dailyLimit} llamadas hoy</span>}
        </div>
        {!data.ai.enabled ? (
          <p className="small muted">Sin configurar. Cuando añadas la clave de DeepSeek como secreto de Cloudflare se activará aquí.</p>
        ) : (
          <>
            <p className="small muted">
              DeepSeek escribe preguntas a partir de tus apuntes y del temario oficial del dominio. Solo se guardan si pasan todos los filtros: citan literalmente una de esas fuentes, la correcta no es la opción más larga y un segundo modelo, sin ver la clave, llega a la misma respuesta y confirma que encaja en el dominio.
              Aun así pueden estar mal: no cuentan para tu estimación y puedes reportarlas.
            </p>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 260px' }}>
                <label htmlFor="gen-d">Dominio</label>
                <select id="gen-d" className="input" value={genDomain} onChange={(e) => setGenDomain(e.target.value)}>
                  {DOMAINS.map((d) => <option key={d.name}>{d.name}</option>)}
                </select>
              </div>
              <label className="row small" style={{ gap: 8, minHeight: 48 }}>
                <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} style={{ width: 20, height: 20 }} />
                Incluir respuesta múltiple
              </label>
              <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>{busy ? 'Generando y verificando…' : 'Generar 4'}</button>
            </div>
            {gen && (
              <div className="callout callout-info small" role="status">
                <strong>{gen.accepted.length} aceptada{gen.accepted.length === 1 ? '' : 's'}, {gen.rejected.length} descartada{gen.rejected.length === 1 ? '' : 's'}.</strong>
                {gen.rejected.map((r, i) => <span key={i} className="muted">· {r.reason}{r.question ? `: ${r.question}…` : ''}</span>)}
                {gen.accepted.length > 0 && <button className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setErr(startAttempt('ai', genDomain) ?? '')}>Practicarlas</button>}
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}
