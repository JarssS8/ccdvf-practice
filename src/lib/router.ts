import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb) }
const get = () => window.location.hash.replace(/^#/, '') || '/'

export function useRoute() {
  const path = useSyncExternalStore(subscribe, get)
  return path.split('/').filter(Boolean)
}

export const go = (path: string, replace = false) => {
  if (replace) window.location.replace('#' + path)
  else window.location.hash = path
  window.scrollTo(0, 0)
}
