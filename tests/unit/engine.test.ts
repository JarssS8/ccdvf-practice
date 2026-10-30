import { describe, expect, it } from 'vitest'
import { questionIndex, repoQuestions } from '../../src/lib/content'
import { buildAttempt, domainMisses, domainTrends, exposures, isCorrect, mostMissed, readiness, scoreAttempt } from '../../src/lib/engine'
import { answersCsv } from '../../src/lib/export'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'
import type { Data } from '../../src/lib/store'
import type { Attempt } from '../../src/lib/types'

const qs = questionIndex([])
const empty = (): Data => ({ user: null, attempts: {}, answers: {}, reviews: [], aiQuestions: [], settings: {}, ai: { enabled: false, usedToday: 0, dailyLimit: 0 } })

/** A submitted attempt over `ids`, answering right where `right(i)` is true. */
function withAttempt(d: Data, id: string, ids: string[], right: (i: number) => boolean, at: number, mode: Attempt['mode'] = 'drill') {
  d.attempts[id] = { id, mode, feedback: true, questionIds: ids, seed: 1, startedAt: at, deadline: null, status: 'submitted', submittedAt: at + 1000 }
  ids.forEach((qid, i) => {
    const q = qs.get(qid)!
    const wrong = (['A', 'B', 'C', 'D'] as const).find((l) => q.options[l] && !q.answer.includes(l))!
    d.answers[`${id}|${qid}`] = { attemptId: id, qid, choice: right(i) ? q.answer : [wrong], flagged: i === 0, updatedAt: at + i }
  })
  return d
}

describe('building attempts', () => {
  it('a full mock has 53 distinct questions and a deadline', () => {
    const a = buildAttempt('full', empty(), qs, { now: 0 })
    if ('error' in a) throw new Error(a.error)
    expect(a.questionIds).toHaveLength(53)
    expect(new Set(a.questionIds).size).toBe(53)
    expect(a.deadline).toBe(120 * 60_000)
    expect(a.lang).toBe('en')
  })
  it('missed review without history reports a code, not a sentence', () => {
    expect(buildAttempt('missed', empty(), qs, { now: 0 })).toEqual({ error: 'no_missed' })
  })
})

describe('scoring and stats', () => {
  const ids = repoQuestions.filter((q) => q.domain === 'Applications and Integration').slice(0, 10).map((q) => q.id)
  const d = withAttempt(empty(), 'a1', ids, (i) => i % 2 === 0, 1000)

  it('scores right, wrong and flagged answers', () => {
    const r = scoreAttempt(d.attempts.a1, d, qs, 5000)
    expect(r.total).toBe(10)
    expect(r.correct).toBe(5)
    expect(r.flagged).toBe(1)
    expect(r.byDomain['Applications and Integration']).toEqual({ n: 10, c: 5 })
  })
  it('miss rate per domain puts the domain with misses first', () => {
    const m = domainMisses(exposures(d, qs), qs)
    expect(m[0]).toMatchObject({ name: 'Applications and Integration', n: 10, wrong: 5, rate: 0.5 })
    expect(m.slice(1).every((r) => r.n === 0)).toBe(true)
  })
  it('trend has one point per answer and a rolling rate', () => {
    const t = domainTrends(exposures(d, qs), qs).find((x) => x.name === 'Applications and Integration')!
    expect(t.points).toHaveLength(10)
    expect(t.points[0].p).toBe(1)
    expect(t.points.at(-1)!.p).toBe(0.5)
  })
  it('most missed counts misses per question', () => {
    const d2 = withAttempt(structuredClone(d), 'a2', ids, () => false, 9000)
    const mm = mostMissed(exposures(d2, qs))
    expect(mm[0].wrong).toBe(2)
    expect(mm[0].lastWrong?.attemptId).toBe('a2')
  })
  it('readiness only exists once there are first attempts', () => {
    expect(readiness([], qs)).toBeNull()
    expect(readiness(exposures(d, qs), qs)?.n).toBe(10)
  })
  it('isCorrect needs the exact set of keys', () => {
    const q = qs.get(ids[0])!
    expect(isCorrect(q, q.answer)).toBe(true)
    expect(isCorrect(q, [])).toBe(false)
  })

  it('CSV export: BOM, separator per language, quoting, option text', () => {
    const esCsv = answersCsv(d, qs, es, 'es')
    expect(esCsv.charCodeAt(0)).toBe(0xfeff)
    const rows = esCsv.slice(1).trim().split('\r\n')
    expect(rows).toHaveLength(11)
    expect(rows[0].split(';')[0]).toBe('fecha')
    const enCsv = answersCsv(d, qs, en, 'en')
    expect(enCsv.slice(1).split('\r\n')[0].startsWith('date,attempt,mode')).toBe(true)
    const q = qs.get(ids[0])!
    expect(enCsv).toContain(q.options[q.answer[0]]!.includes(',') ? `"${q.options[q.answer[0]]}"` : q.options[q.answer[0]]!)
  })
})
