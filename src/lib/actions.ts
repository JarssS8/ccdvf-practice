import { ensureCert, isLoaded, questionIndex } from './content'
import { attemptsOf, buildAttempt, scoreAttempt } from './engine'
import { currentCert } from './cert'
import { go } from './router'
import { dispatch, getData, now } from './store'
import { certOfAttempt, type CertDef } from '../shared/certs'
import type { Attempt, Mode } from './types'

/** The newest unfinished attempt of a certification (the one being studied unless given). */
export function activeAttempt(cert: CertDef = currentCert()): Attempt | undefined {
  return attemptsOf(getData(), cert).filter((a) => a.status === 'active').sort((a, b) => b.startedAt - a.startedAt)[0]
}

/** Starts a new attempt in the certification being studied; returns an error message when the mode has no questions. */
export function startAttempt(mode: Mode, domain?: string, fromAttempt?: string): string | null {
  const data = getData()
  const cert = currentCert()
  if (!isLoaded(cert.id)) return 'loading'
  const qs = questionIndex(data.aiQuestions)
  const a = buildAttempt(mode, data, qs, { cert, domain, fromAttempt, now: now() })
  if ('error' in a) return a.error
  dispatch({ type: 'attempt.create', attempt: a })
  go(`/exam/${a.id}`)
  return null
}

const submitting = new Set<string>()

/** Scores and closes an attempt. The server keeps the first result it gets, so its questions are loaded before scoring. */
export async function submitAttempt(id: string) {
  const first = getData().attempts[id]
  if (!first || first.status !== 'active' || submitting.has(id)) return
  submitting.add(id)
  try {
    await ensureCert(certOfAttempt(first))
    const data = getData()
    const a = data.attempts[id]
    if (!a || a.status !== 'active') return
    const at = now()
    dispatch({ type: 'attempt.submit', attemptId: id, result: scoreAttempt(a, data, questionIndex(data.aiQuestions), at), submittedAt: Math.min(at, a.deadline ?? at) })
  } finally {
    submitting.delete(id)
  }
}

export function discardAttempt(id: string) {
  dispatch({ type: 'attempt.discard', attemptId: id })
}

/** Timed attempts whose clock ran out on any device are closed with the answers saved before the deadline. */
export function closeExpired() {
  const t = now()
  for (const a of Object.values(getData().attempts)) {
    if (a.status === 'active' && a.deadline && t > a.deadline + 30_000) void submitAttempt(a.id).catch(() => { /* content not reachable now: next tick */ })
  }
}
