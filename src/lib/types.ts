import type { Letter } from '../shared/exam'

export type Mode = 'full' | 'quick' | 'repo-mock-1' | 'repo-mock-2' | 'repo-mock-3' | 'guide' | 'drill' | 'missed' | 'ai' | 'flagged'

export interface DomainTally { n: number; c: number }
export interface AttemptResult {
  total: number
  correct: number
  blank: number
  flagged: number
  fresh: number
  freshCorrect: number
  timeUsedMs: number
  byDomain: Record<string, DomainTally>
}

export interface Attempt {
  id: string
  mode: Mode
  feedback: boolean
  questionIds: string[]
  seed: number
  startedAt: number
  deadline: number | null
  status: 'active' | 'submitted' | 'discarded'
  submittedAt?: number
  result?: AttemptResult
  leaseDevice?: string
  label?: string
}

export interface Answer { attemptId: string; qid: string; choice: Letter[]; flagged: boolean; updatedAt: number }
export interface Review { id: string; cardId: string; rating: number; reviewedAt: number }
export interface Setting { value: string; updatedAt: number }
