import { questionIndex } from './content'
import { buildAttempt, scoreAttempt } from './engine'
import { go } from './router'
import { dispatch, getData, now } from './store'
import type { Attempt, Mode } from './types'

export function activeAttempt(): Attempt | undefined {
  return Object.values(getData().attempts).filter((a) => a.status === 'active').sort((a, b) => b.startedAt - a.startedAt)[0]
}

/** Starts a new attempt; returns an error message when the mode has no questions. */
export function startAttempt(mode: Mode, domain?: string, fromAttempt?: string): string | null {
  const data = getData()
  const qs = questionIndex(data.aiQuestions)
  const a = buildAttempt(mode, data, qs, { domain, fromAttempt, now: now() })
  if ('error' in a) return a.error
  dispatch({ type: 'attempt.create', attempt: a })
  go(`/exam/${a.id}`)
  return null
}

export function submitAttempt(id: string) {
  const data = getData()
  const a = data.attempts[id]
  if (!a || a.status !== 'active') return
  const at = now()
  dispatch({ type: 'attempt.submit', attemptId: id, result: scoreAttempt(a, data, questionIndex(data.aiQuestions), at), submittedAt: Math.min(at, a.deadline ?? at) })
}

export function discardAttempt(id: string) {
  dispatch({ type: 'attempt.discard', attemptId: id })
}

/** Timed attempts whose clock ran out on any device are closed with the answers saved before the deadline. */
export function closeExpired() {
  const t = now()
  for (const a of Object.values(getData().attempts)) {
    if (a.status === 'active' && a.deadline && t > a.deadline + 30_000) submitAttempt(a.id)
  }
}
