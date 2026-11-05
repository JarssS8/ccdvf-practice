import { describe, expect, it } from 'vitest'
import { ensureAll, inCert, questionIndex, questionsOf, repoQuestions as allQuestions } from '../../src/lib/content'
import { attemptsOf, buildAttempt, countsForReadiness, isCalibratedBank, domainMisses, domainStats, domainTrends, exposures, isCorrect, latestByQuestion, modeSpec, mostMissed, readiness, resultOf, scoreAttempt } from '../../src/lib/engine'
import { deck, queue, schedule } from '../../src/lib/srs'
import { currentCertId, studyWeek } from '../../src/lib/cert'
import { CERTS, certById, certOfQuestion } from '../../src/shared/certs'
import { answersCsv } from '../../src/lib/export'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'
import type { Data } from '../../src/lib/store'
import type { Attempt } from '../../src/lib/types'

// Content arrives per certification on demand; these tests use all of it
await ensureAll()
const repoQuestions = allQuestions()
const qs = questionIndex([])
const DV = certById('developer-foundations')
const AF = certById('architect-foundations')
const empty = (): Data => ({ user: null, attempts: {}, answers: {}, reviews: [], aiQuestions: [], settings: {}, ai: { enabled: false, usedToday: 0, dailyLimit: 0 } })

/** A submitted attempt over `ids`, answering right where `right(i)` is true. */
function withAttempt(d: Data, id: string, ids: string[], right: (i: number) => boolean, at: number, mode: Attempt['mode'] = 'drill', cert?: string) {
  d.attempts[id] = { id, cert, mode, feedback: true, questionIds: ids, seed: 1, startedAt: at, deadline: null, status: 'submitted', submittedAt: at + 1000 }
  ids.forEach((qid, i) => {
    const q = qs.get(qid)!
    const wrong = (['A', 'B', 'C', 'D'] as const).find((l) => q.options[l] && !q.answer.includes(l))!
    d.answers[`${id}|${qid}`] = { attemptId: id, qid, choice: right(i) ? q.answer : [wrong], flagged: i === 0, updatedAt: at + i }
  })
  return d
}

describe('building attempts', () => {
  it('a full mock has the exam length in distinct questions of its own certification, and a deadline', () => {
    for (const c of CERTS) {
      const a = buildAttempt('full', empty(), qs, { cert: c, now: 0 })
      if ('error' in a) throw new Error(a.error)
      expect(a.cert).toBe(c.id)
      expect(a.questionIds).toHaveLength(c.items)
      expect(new Set(a.questionIds).size).toBe(c.items)
      expect(a.questionIds.every((id) => certOfQuestion(qs.get(id)!) === c.id)).toBe(true)
      expect(a.deadline).toBe(120 * 60_000)
      expect(a.lang).toBe('en')
    }
  })
  it('every certification has its repo mocks and guide samples', () => {
    for (const c of CERTS) {
      for (const m of ['repo-mock-1', 'repo-mock-2', 'repo-mock-3', 'guide'] as const) {
        const a = buildAttempt(m, empty(), qs, { cert: c, now: 0 })
        if ('error' in a) throw new Error(`${c.code} ${m}: ${a.error}`)
        expect(a.questionIds.length).toBe(m === 'guide' ? modeSpec('guide', c).items : 15)
      }
    }
  })
  it('missed review without history reports a code, not a sentence', () => {
    expect(buildAttempt('missed', empty(), qs, { cert: DV, now: 0 })).toEqual({ error: 'no_missed' })
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
    const m = domainMisses(exposures(d, qs, DV), qs, DV)
    expect(m[0]).toMatchObject({ name: 'Applications and Integration', n: 10, wrong: 5, rate: 0.5 })
    expect(m.slice(1).every((r) => r.n === 0)).toBe(true)
  })
  it('trend has one point per answer and a rolling rate', () => {
    const t = domainTrends(exposures(d, qs, DV), qs, DV).find((x) => x.name === 'Applications and Integration')!
    expect(t.points).toHaveLength(10)
    expect(t.points[0].p).toBe(1)
    expect(t.points.at(-1)!.p).toBe(0.5)
  })
  it('most missed counts misses per question', () => {
    const d2 = withAttempt(structuredClone(d), 'a2', ids, () => false, 9000)
    const mm = mostMissed(exposures(d2, qs, DV))
    expect(mm[0].wrong).toBe(2)
    expect(mm[0].lastWrong?.attemptId).toBe('a2')
  })
  it('readiness only exists once there are first attempts', () => {
    expect(readiness([], qs, DV)).toBeNull()
    // In a calibrated bank, answers given before it was calibrated don't count
    expect(readiness(exposures(d, qs, DV), qs, DV)?.n ?? null).toBe(isCalibratedBank(inCert(qs, DV)) ? null : 10)
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
    expect(enCsv.slice(1).split('\r\n')[0].startsWith('date,certification,attempt,mode')).toBe(true)
    expect(enCsv).toContain(',CCDV-F,')
    const q = qs.get(ids[0])!
    expect(enCsv).toContain(q.options[q.answer[0]]!.includes(',') ? `"${q.options[q.answer[0]]}"` : q.options[q.answer[0]]!)
  })
})

describe('certifications never mix', () => {
  // A Developer drill (stored before certifications: no cert) and an Architect – Foundations one
  const dvIds = questionsOf(DV).filter((q) => q.source === 'practice').slice(0, 6).map((q) => q.id)
  const afIds = questionsOf(AF).filter((q) => q.source === 'practice').slice(0, 4).map((q) => q.id)
  const d = withAttempt(withAttempt(empty(), 'dv', dvIds, () => false, 1000), 'af', afIds, (i) => i > 0, 2000, 'drill', AF.id)

  it('attempts, exposures and readiness belong to one certification', () => {
    expect(attemptsOf(d, DV).map((a) => a.id)).toEqual(['dv'])
    expect(attemptsOf(d, AF).map((a) => a.id)).toEqual(['af'])
    expect(exposures(d, qs, DV)).toHaveLength(6)
    expect(exposures(d, qs, AF)).toHaveLength(4)
    // In a calibrated bank, answers given before it was calibrated don't measure readiness
    expect(readiness(exposures(d, qs, AF), inCert(qs, AF), AF)?.n ?? null).toBe(isCalibratedBank(inCert(qs, AF)) ? null : 4)
    expect(domainStats(exposures(d, qs, AF), qs, AF).map((x) => x.name)).toEqual(AF.domains.map((x) => x.name))
  })
  it('missed questions and the deck only show the certification being studied', () => {
    expect([...latestByQuestion(d, DV).keys()].sort()).toEqual([...dvIds].sort())
    const miss = buildAttempt('missed', d, qs, { cert: AF, now: 5000 })
    if ('error' in miss) throw new Error(miss.error)
    expect(miss.questionIds).toEqual([afIds[0]])
    const cards = deck(d, qs, 'en', AF)
    expect(cards.filter((c) => c.origin === 'missed').map((c) => c.id)).toEqual(['q:' + afIds[0]])
  })
  it('the daily allowance of new cards is per deck', () => {
    const at = new Date(2026, 10, 3, 12)
    const dvDeck = deck(empty(), qs, 'en', DV).filter((c) => c.origin === 'repo' && !c.id.startsWith('q:'))
    const reviewed = empty()
    const dvOnly = dvDeck.filter((c) => !deck(empty(), qs, 'en', AF).some((x) => x.id === c.id)).slice(0, 15)
    dvOnly.forEach((c, i) => reviewed.reviews.push({ id: 'r' + i, cardId: c.id, rating: 3, reviewedAt: at.getTime() - 1000 }))
    const s = schedule(reviewed, at)
    expect(queue(deck(reviewed, qs, 'en', DV), s).fresh).toHaveLength(0)
    expect(queue(deck(reviewed, qs, 'en', AF), s).fresh.length).toBeGreaterThan(0)
  })
  it('a result scored by a client that could not see the questions is recomputed', () => {
    const a = { ...d.attempts.af, result: { total: 4, correct: 0, blank: 0, flagged: 0, fresh: 0, freshCorrect: 0, timeUsedMs: 1, byDomain: {} } }
    expect(resultOf(a, d, qs)?.correct).toBe(3)
  })
})

describe('which certification is studied', () => {
  it('this device first, then the account default, then Developer for existing progress, else none', () => {
    expect(currentCertId(empty(), 'architect-professional')).toBe('architect-professional')
    const synced = empty(); synced.settings.cert = { value: 'associate-foundations', updatedAt: 1 }
    expect(currentCertId(synced, null)).toBe('associate-foundations')
    expect(currentCertId(synced, '__proto__')).toBe('associate-foundations')
    const legacy = withAttempt(empty(), 'x', [repoQuestions[0].id], () => true, 1)
    expect(currentCertId(legacy, null)).toBe('developer-foundations')
    expect(currentCertId(empty(), null)).toBeNull()
  })
})

describe('questions written by the app', () => {
  const CCARP = certById('architect-professional')
  const app = questionsOf(CCARP).filter((q) => q.source === 'app')

  it('fill the thin domains and stay out of duplicate groups', () => {
    expect(app.length).toBeGreaterThanOrEqual(10)
    expect(app.every((q) => !q.dupGroup)).toBe(true)
    expect(questionsOf(DV).filter((q) => q.source === 'app' && q.domain === 'Claude Code').length).toBeGreaterThanOrEqual(4)
  })
  it('are practice: mocks may use them, readiness never counts them', () => {
    expect(countsForReadiness(app[0])).toBe(false)
    expect(countsForReadiness({ source: 'ai' })).toBe(false)
    expect(countsForReadiness({ source: 'practice' })).toBe(true)
    const d = withAttempt(empty(), 'x', app.map((q) => q.id), () => true, 1, 'drill', CCARP.id)
    expect(exposures(d, qs, CCARP)).toHaveLength(app.length)
    expect(readiness(exposures(d, qs, CCARP), qs, CCARP)).toBeNull()
  })
  it('a full mock of a formerly thin certification keeps the domain quotas', () => {
    const a = buildAttempt('full', empty(), qs, { cert: CCARP, now: 0 })
    if ('error' in a) throw new Error(a.error)
    const per = (name: string) => a.questionIds.filter((id) => qs.get(id)!.domain === name).length
    expect(per('Claude Models, Prompting & Context Engineering')).toBe(8)
    expect(per('Governance, Safety & Risk Management')).toBe(9)
  })
})

// The rewritten bank is switched off by default (scripts/calibrated-bank.json); these checks run for the certifications that serve it
describe.skipIf(!isCalibratedBank(inCert(qs, certById('developer-foundations'))))('a calibrated bank', () => {
  const dv = questionsOf(DV)
  const since = Math.max(...dv.filter((q) => q.calibrated).map((q) => Date.parse(q.calibrated!)))
  // One per duplicate group, so each is a first exposure of its own
  const cal = dv.filter((q) => q.calibrated && q.source !== 'guide' && q.source !== 'curated')
    .filter((q, i, a) => a.findIndex((x) => (x.dupGroup ?? x.id) === (q.dupGroup ?? q.id)) === i).slice(0, 8).map((q) => q.id)
  const curated = dv.filter((q) => q.source === 'curated').slice(0, 5).map((q) => q.id)

  it('has curated items', () => {
    expect(curated.length).toBe(5)
  })
  it('counts only calibrated questions answered after their calibration', () => {
    const later = withAttempt(empty(), 'late', [...cal, ...curated], (i) => i % 2 === 0, since + 60_000)
    expect(readiness(exposures(later, qs, DV), qs, DV)?.n).toBe(cal.length + curated.length)
    const early = withAttempt(empty(), 'early', cal, () => true, since - 60_000)
    expect(readiness(exposures(early, qs, DV), qs, DV)).toBeNull()
  })
  it('a question already seen before the rebuild never counts as fresh again', () => {
    const d = withAttempt(withAttempt(empty(), 'old', cal.slice(0, 3), () => true, since - 60_000), 'new', cal, () => true, since + 60_000)
    expect(readiness(exposures(d, qs, DV), qs, DV)?.n).toBe(cal.length - 3)
  })
  it('app-written and uncalibrated questions stay out; other banks keep the old rule', () => {
    const app = dv.find((q) => q.source === 'app')!
    expect(countsForReadiness(app, since + 1, true)).toBe(false)
    expect(countsForReadiness({ source: 'practice' }, since + 1, true)).toBe(false)
    expect(countsForReadiness({ source: 'practice' }, 0, false)).toBe(true)
  })
  it('curated questions never share a duplicate group', () => {
    expect(dv.filter((q) => q.source === 'curated').every((q) => !q.dupGroup)).toBe(true)
  })
})

describe('study plan week', () => {
  const at = new Date('2026-11-03T09:00').getTime()
  it('three weeks counted back from the exam date', () => {
    expect(studyWeek(undefined, at)).toBeNull()
    expect(studyWeek('2026-11-30', at)).toEqual({ far: 27 })
    expect(studyWeek('2026-11-24', at)).toEqual({ week: 0 })
    expect(studyWeek('2026-11-14', at)).toEqual({ week: 1 })
    expect(studyWeek('2026-11-05', at)).toEqual({ week: 2 })
    expect(studyWeek('2026-11-03', at)).toEqual({ week: 2 })
    expect(studyWeek('2026-11-01', at)).toEqual({ past: true })
  })
})
