import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts: no request (and no visitor IP) goes to Google
import '@fontsource-variable/inter'
import '@fontsource/bricolage-grotesque/600.css'
import '@fontsource/bricolage-grotesque/700.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, savedTheme } from './views/Settings.tsx'

applyTheme(savedTheme())

// A tab left open across a deploy asks for content chunks that no longer exist: load the new version once
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('ccdvf_reloaded')) return
    sessionStorage.setItem('ccdvf_reloaded', '1')
  } catch { return }
  e.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js') })
}
