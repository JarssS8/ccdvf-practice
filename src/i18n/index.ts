// Two languages, typed dictionaries, no library. Exam simulations override the language to English
// through LangOverride, so everything rendered inside one reads like the real exam.
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { en } from './en'
import { es } from './es'

export type Lang = 'es' | 'en'
export type Dict = typeof en
export const DICTS: Record<Lang, Dict> = { en, es }
export const LANGS: { id: Lang; label: string }[] = [{ id: 'es', label: 'Español' }, { id: 'en', label: 'English' }]

const KEY = 'ccdvf_lang'
const initial = (): Lang => {
  try { const v = localStorage.getItem(KEY); if (v === 'es' || v === 'en') return v } catch { /* storage blocked */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

let lang: Lang = initial()
const listeners = new Set<() => void>()
const apply = () => { if (typeof document !== 'undefined') document.documentElement.lang = lang }
apply()

export const getLang = () => lang
export function setLang(l: Lang) {
  lang = l
  try { localStorage.setItem(KEY, l) } catch { /* storage blocked */ }
  apply()
  listeners.forEach((f) => f())
}

const subscribe = (f: () => void) => { listeners.add(f); return () => listeners.delete(f) }
const Override = createContext<Lang | null>(null)

/** Renders children in a fixed language (exam simulations: always English). */
export function LangOverride({ lang: l, children }: { lang: Lang; children: ReactNode }) {
  return createElement(Override.Provider, { value: l }, children)
}

export function useLang(): Lang {
  const global = useSyncExternalStore(subscribe, getLang)
  return useContext(Override) ?? global
}

export function useT(): Dict {
  return DICTS[useLang()]
}

/** Server and client error codes → message. Unknown codes are shown as they come. */
export function errorText(t: Dict, code: string) {
  return (t.errors as Record<string, string>)[code] ?? code
}
