import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { SyncBadge } from '../components/ui'
import { meta } from '../lib/content'
import { fmtDate } from '../lib/engine'
import { deviceId, dispatch, exportBackup, logout, now, sync, useStore } from '../lib/store'

type Theme = 'auto' | 'light' | 'dark'
export const applyTheme = (t: Theme) => {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}
export const savedTheme = (): Theme => { try { return (localStorage.getItem('ccdvf_theme') as Theme) || 'auto' } catch { return 'auto' } }

export default function Settings() {
  const { data, status, pending, lastError } = useStore()
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const [date, setDate] = useState(data.settings.exam_date?.value ?? '')
  useEffect(() => { applyTheme(theme); try { localStorage.setItem('ccdvf_theme', theme) } catch { /* ignore */ } }, [theme])
  useEffect(() => setDate(data.settings.exam_date?.value ?? ''), [data.settings.exam_date?.value])

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `ccdvf-progreso-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <h1 className="h-page">Ajustes</h1>

      <section className="card" aria-labelledby="ex-h">
        <h2 id="ex-h" className="h-section">Examen</h2>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="exam-date">Fecha del examen</label>
          <input id="exam-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)}
            onBlur={() => { if (date !== (data.settings.exam_date?.value ?? '')) dispatch({ type: 'setting', key: 'exam_date', value: date, updatedAt: now() }) }} />
          <span className="tiny muted">Se sincroniza entre dispositivos. Para cambiar la cita en Pearson hay un plazo mínimo; compruébalo en la política oficial.</span>
        </div>
      </section>

      <section className="card" aria-labelledby="th-h">
        <h2 id="th-h" className="h-section">Apariencia</h2>
        <div className="seg" role="group" aria-label="Tema">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{{ auto: 'Automático', light: 'Claro', dark: 'Oscuro' }[t]}</button>
          ))}
        </div>
        <span className="tiny muted">Solo en este dispositivo.</span>
      </section>

      <section className="card" aria-labelledby="sy-h">
        <h2 id="sy-h" className="h-section">Sincronización</h2>
        <div className="row"><SyncBadge status={status} pending={pending} onClick={() => void sync()} /><button className="btn btn-sm" onClick={() => void sync()}><Icon name="refresh" size={16} />Sincronizar ahora</button></div>
        {lastError && <p className="small" style={{ color: 'var(--bad-ink)' }}>{lastError}</p>}
        <p className="small muted">Todo se guarda primero en este dispositivo y se sube a tu base de datos de Cloudflare en cuanto hay conexión. Dispositivo: <span className="mono">{deviceId.slice(0, 8)}</span></p>
        <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={download}><Icon name="download" size={16} />Descargar copia de seguridad</button>
      </section>

      <section className="card" aria-labelledby="ai-h">
        <h2 id="ai-h" className="h-section">IA (DeepSeek)</h2>
        {data.ai.enabled
          ? <p className="small">Activa · {data.ai.usedToday} de {data.ai.dailyLimit} llamadas hoy. El límite se reinicia a medianoche UTC.</p>
          : <p className="small muted">Sin configurar. Añade la clave como secreto del Worker: <code className="mono">npx wrangler secret put DEEPSEEK_API_KEY</code></p>}
      </section>

      <section className="card" aria-labelledby="ct-h">
        <h2 id="ct-h" className="h-section">Contenido</h2>
        <p className="small muted">
          {meta.counts.questions} preguntas y {meta.counts.flashcards} flashcards del repo, importadas el {fmtDate(Date.parse(meta.syncedAt))}.
          {meta.factsVerified && ` El repo verificó los datos oficiales el ${meta.factsVerified}.`} Para actualizar: <code className="mono">git pull</code> en el repo y <code className="mono">npm run deploy</code>.
        </p>
      </section>

      <section className="card" aria-labelledby="ss-h">
        <h2 id="ss-h" className="h-section">Sesión</h2>
        <div className="row">
          <button className="btn btn-sm" onClick={() => void logout(false)}><Icon name="logout" size={16} />Cerrar sesión aquí</button>
          <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('¿Cerrar la sesión en todos tus dispositivos?')) void logout(true) }}>Cerrar en todos los dispositivos</button>
        </div>
      </section>
    </>
  )
}
