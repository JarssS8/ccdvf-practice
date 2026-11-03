// Which certification is being studied: this device's choice, else the account's synced default,
// else Developer for accounts that already studied it before there was a choice, else none yet (first-run picker).
import { DEFAULT_CERT, certById, examDateKey, isCertId, type CertDef } from '../shared/certs'
import { getData, getLocalCert, useStore, type Data } from './store'

export function currentCertId(data: Data, local: string | null): string | null {
  if (isCertId(local)) return local
  const synced = data.settings.cert?.value
  if (isCertId(synced)) return synced
  const studied = Object.keys(data.attempts).length || data.reviews.length || data.aiQuestions.length || data.settings.exam_date
  return studied ? DEFAULT_CERT : null
}

/** The certification in use outside React (actions). */
export const currentCert = (): CertDef => certById(currentCertId(getData(), getLocalCert()))

export function useCert(): CertDef {
  const { data, certLocal } = useStore()
  return certById(currentCertId(data, certLocal))
}

/** A new account (snapshot loaded, nothing studied, nothing chosen) picks its certification first. */
export function useNeedsCertPick(): boolean {
  const { data, certLocal, hasSnapshot } = useStore()
  return hasSnapshot && currentCertId(data, certLocal) === null
}

export const examDateOf = (data: Data, cert: CertDef) => {
  const key = examDateKey(cert.id)
  return Object.hasOwn(data.settings, key) ? data.settings[key].value || undefined : undefined
}
