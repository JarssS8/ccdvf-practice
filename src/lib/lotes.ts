// Which lotes the exams and drills of a certification draw from (Lote 1 = the original bank, lotes 2 and 3 = long-scenario questions).
// A per-device convenience like the certification choice: kept in localStorage, never synced, wiped on sign-out (store.ts purgeLocal).
import { useSyncExternalStore } from 'react'
import { loteOf } from '../shared/exam'
import type { CertDef } from '../shared/certs'
import { inCert, type AiQuestion } from './content'
import { getData } from './store'

const key = (certId: string) => `ccdvf_lotes_${getData().user?.id ?? 'anon'}_${certId}`
let version = 0
const subs = new Set<() => void>()
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/** The saved choice, Lote 1 alone when nothing valid is saved. */
export function getLotes(certId: string): number[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key(certId)) ?? 'null')
    if (Array.isArray(v)) {
      const ok = [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 9))].sort()
      if (ok.length) return ok
    }
  } catch { /* blocked or corrupt */ }
  return [1]
}

export function setLotes(certId: string, lotes: number[]) {
  try { localStorage.setItem(key(certId), JSON.stringify(lotes)) } catch { /* blocked */ }
  version++
  subs.forEach((f) => f())
}

export function useLotes(certId: string): number[] {
  useSyncExternalStore(subscribe, () => version)
  return getLotes(certId)
}

/** How many bank questions each lote holds in this certification (AI-generated and reported ones are not in any lote). */
export function loteCounts(qs: Map<string, AiQuestion>, cert: CertDef): Record<number, number> {
  const out: Record<number, number> = {}
  for (const q of inCert(qs, cert).values()) if (q.source !== 'ai' && !q.reported) out[loteOf(q)] = (out[loteOf(q)] ?? 0) + 1
  return out
}

/** The saved choice restricted to the lotes this certification actually has (Lote 1 when none is left). */
export function effectiveLotes(qs: Map<string, AiQuestion>, cert: CertDef): number[] {
  const have = Object.keys(loteCounts(qs, cert)).map(Number)
  const chosen = getLotes(cert.id).filter((n) => have.includes(n))
  return chosen.length ? chosen : [1]
}
