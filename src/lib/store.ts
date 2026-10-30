// Local-first store: last server snapshot + an outbox of pending ops, both persisted in localStorage per account.
// The visible state is the snapshot with the outbox replayed on top; the server applies newest-wins.
import { useSyncExternalStore } from 'react'
import type { Letter } from '../shared/exam'
import type { AiQuestion } from './content'
import type { Answer, Attempt, AttemptResult, Review, Setting } from './types'
import { authClient } from './auth'

export interface Account { id: string; name: string; email: string; image: string | null; createdAt: string; aiConsentAt: number | null }

export interface Data {
  user: Account | null
  attempts: Record<string, Attempt>
  answers: Record<string, Answer> // key `${attemptId}|${qid}`
  reviews: Review[]
  aiQuestions: AiQuestion[]
  settings: Record<string, Setting>
  ai: { enabled: boolean; usedToday: number; dailyLimit: number }
}

type NewAttempt = Pick<Attempt, 'id' | 'mode' | 'label' | 'lang' | 'feedback' | 'questionIds' | 'seed' | 'startedAt' | 'deadline'>
export type Op = { opId: string } & (
  | { type: 'attempt.create'; attempt: NewAttempt }
  | { type: 'answer'; attemptId: string; qid: string; choice: Letter[]; flagged: boolean; updatedAt: number }
  | { type: 'attempt.lease'; attemptId: string }
  | { type: 'attempt.discard'; attemptId: string }
  | { type: 'attempt.submit'; attemptId: string; result: AttemptResult; submittedAt: number }
  | { type: 'review'; id: string; cardId: string; rating: number; reviewedAt: number }
  | { type: 'setting'; key: string; value: string; updatedAt: number }
  | { type: 'aiq.report'; id: string }
)
type OpInput = Op extends infer O ? (O extends Op ? Omit<O, 'opId'> : never) : never

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'error'

const emptyData = (): Data => ({ user: null, attempts: {}, answers: {}, reviews: [], aiQuestions: [], settings: {}, ai: { enabled: false, usedToday: 0, dailyLimit: 0 } })

// Per-account keys, so a shared device never mixes two people's progress
const LS = { uid: 'ccdvf_uid', offset: 'ccdvf_offset', device: 'ccdvf_device', base: (u: string) => `ccdvf_base:${u}`, outbox: (u: string) => `ccdvf_outbox:${u}` }
const load = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full or blocked */ } }
const drop = (k: string) => { try { localStorage.removeItem(k) } catch { /* blocked */ } }

// The single-user version kept its cache under these keys: never upload them into whoever signs in now
for (const k of ['ccdvf_base', 'ccdvf_outbox']) drop(k)

/** Removes every per-account trace on this device (snapshot, outbox, tutor chats, exam positions). */
function purgeLocal(uid: string | null) {
  if (uid) { drop(LS.base(uid)); drop(LS.outbox(uid)) }
  drop(LS.uid)
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ccdvf_tutor_') || k.startsWith('ccdvf_pos_')) localStorage.removeItem(k)
  } catch { /* blocked */ }
}

export const deviceId: string = (() => {
  let id = load<string | null>(LS.device, null)
  if (!id) { id = crypto.randomUUID(); save(LS.device, id) }
  return id
})()

let uid: string | null = load(LS.uid, null)
let base: Data = uid ? load(LS.base(uid), emptyData()) : emptyData()
let hasSnapshot = !!(uid && base.user)
let outbox: Op[] = uid ? load(LS.outbox(uid), []) : []
let offset: number = load(LS.offset, 0)
let status: SyncStatus = outbox.length ? 'pending' : 'synced'
let authed: boolean | null = null
let lastError = ''
let data: Data = replay(base, outbox)
let version = 0
const listeners = new Set<() => void>()

export const now = () => Date.now() + offset

function emit() { version++; listeners.forEach((l) => l()) }

function apply(d: Data, op: Op) {
  switch (op.type) {
    case 'attempt.create':
      if (!d.attempts[op.attempt.id]) d.attempts[op.attempt.id] = { ...op.attempt, status: 'active', leaseDevice: deviceId }
      break
    case 'attempt.lease': {
      const a = d.attempts[op.attemptId]
      if (a && a.status === 'active') d.attempts[op.attemptId] = { ...a, leaseDevice: deviceId }
      break
    }
    case 'answer': {
      const k = `${op.attemptId}|${op.qid}`
      const prev = d.answers[k]
      if (!prev || op.updatedAt > prev.updatedAt) d.answers[k] = { attemptId: op.attemptId, qid: op.qid, choice: op.choice, flagged: op.flagged, updatedAt: op.updatedAt }
      break
    }
    case 'attempt.discard': {
      const a = d.attempts[op.attemptId]
      if (a && a.status === 'active') d.attempts[op.attemptId] = { ...a, status: 'discarded' }
      break
    }
    case 'attempt.submit': {
      const a = d.attempts[op.attemptId]
      if (a && a.status === 'active') d.attempts[op.attemptId] = { ...a, status: 'submitted', result: op.result, submittedAt: op.submittedAt }
      break
    }
    case 'review':
      if (!d.reviews.some((r) => r.id === op.id)) d.reviews.push({ id: op.id, cardId: op.cardId, rating: op.rating, reviewedAt: op.reviewedAt })
      break
    case 'setting': {
      const prev = d.settings[op.key]
      if (!prev || op.updatedAt > prev.updatedAt) d.settings[op.key] = { value: op.value, updatedAt: op.updatedAt }
      break
    }
    case 'aiq.report':
      d.aiQuestions = d.aiQuestions.map((q) => (q.id === op.id ? { ...q, reported: true } : q))
      break
  }
}

function replay(b: Data, ops: Op[]): Data {
  const d: Data = { ...b, attempts: { ...b.attempts }, answers: { ...b.answers }, reviews: [...b.reviews], settings: { ...b.settings }, aiQuestions: [...b.aiQuestions] }
  for (const op of ops) apply(d, op)
  return d
}

function recompute() { data = replay(base, outbox); emit() }

// ---------- server mapping ----------

type Row = Record<string, unknown>
const parse = <T,>(v: unknown, fallback: T): T => { try { return v == null ? fallback : (JSON.parse(String(v)) as T) } catch { return fallback } }

function fromServer(s: Row): Data {
  const d = emptyData()
  d.user = s.user as Account
  for (const r of s.attempts as Row[]) {
    d.attempts[r.id as string] = {
      id: r.id as string, mode: r.mode as Attempt['mode'], label: (r.label as string) ?? undefined, lang: r.lang === 'es' ? 'es' : 'en', feedback: !!r.feedback,
      questionIds: parse(r.question_ids, []), seed: r.seed as number, startedAt: r.started_at as number,
      deadline: (r.deadline as number) ?? null, status: r.status as Attempt['status'],
      submittedAt: (r.submitted_at as number) ?? undefined, result: parse(r.result, undefined), leaseDevice: (r.lease_device as string) ?? undefined,
    }
  }
  for (const r of s.answers as Row[]) {
    d.answers[`${r.attempt_id}|${r.qid}`] = { attemptId: r.attempt_id as string, qid: r.qid as string, choice: parse(r.choice, []), flagged: !!r.flagged, updatedAt: r.updated_at as number }
  }
  d.reviews = (s.reviews as Row[]).map((r) => ({ id: r.id as string, cardId: r.card_id as string, rating: r.rating as number, reviewedAt: r.reviewed_at as number }))
  d.aiQuestions = s.aiQuestions as AiQuestion[]
  for (const r of s.settings as Row[]) d.settings[r.key as string] = { value: r.value as string, updatedAt: r.updated_at as number }
  d.ai = s.ai as Data['ai']
  return d
}

// ---------- network ----------

class AuthError extends Error {}

/** API errors carry the server's code (`ai_limit`, `bad_request`…); the views translate it. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  if (res.status === 401) { authed = false; emit(); throw new AuthError('auth') }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  return body as T
}

let inflight: Promise<void> | null = null
const rejectedLease = new Set<string>()

/** Adopts the account the session belongs to; switching accounts drops the previous one's local data. */
function adopt(next: string) {
  if (uid === next) return
  if (uid) purgeLocal(uid)
  uid = next
  save(LS.uid, uid)
  base = load(LS.base(uid), emptyData())
  outbox = load(LS.outbox(uid), [])
}

export function sync(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    status = 'syncing'; emit()
    try {
      if (outbox.length && uid) {
        const sent = outbox.slice(0, 100)
        const res = await api<{ rejected: { opId: string; reason: string }[] }>('/api/sync', { method: 'POST', body: JSON.stringify({ deviceId, userId: uid, ops: sent }) })
        for (const r of res.rejected) {
          if (r.reason === 'lease') {
            const op = sent.find((o) => o.opId === r.opId)
            if (op && op.type === 'answer') rejectedLease.add(op.attemptId)
          }
        }
        const sentIds = new Set(sent.map((o) => o.opId))
        outbox = outbox.filter((o) => !sentIds.has(o.opId))
        save(LS.outbox(uid), outbox)
      }
      const s = await api<Row & { serverNow: number; user: Account }>('/api/state')
      adopt(s.user.id)
      offset = s.serverNow - Date.now()
      save(LS.offset, offset)
      base = fromServer(s)
      hasSnapshot = true
      save(LS.base(uid!), base)
      authed = true
      lastError = ''
      status = outbox.length ? 'pending' : 'synced'
    } catch (e) {
      const msg = (e as Error).message
      if (e instanceof AuthError) status = 'error'
      else if (msg === 'user_mismatch') { purgeLocal(uid); uid = null; base = emptyData(); outbox = []; hasSnapshot = false; authed = null; status = 'synced'; void sync() }
      else if (e instanceof TypeError || !navigator.onLine) status = 'offline'
      else { status = 'error'; lastError = msg }
    } finally {
      inflight = null
      recompute()
      if (outbox.length && status === 'pending') schedule()
    }
  })()
  return inflight
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedule(ms = 800) { clearTimeout(timer); timer = setTimeout(() => void sync(), ms) }

export function dispatch(input: OpInput) {
  if (!uid) return
  const op = { ...input, opId: crypto.randomUUID() } as Op
  if (op.type === 'answer') {
    // Collapse pending writes for the same question
    outbox = outbox.filter((o) => !(o.type === 'answer' && o.attemptId === op.attemptId && o.qid === op.qid))
  }
  if (op.type === 'attempt.lease') rejectedLease.delete(op.attemptId)
  outbox.push(op)
  save(LS.outbox(uid), outbox)
  status = 'pending'
  recompute()
  schedule(op.type === 'answer' ? 800 : 50)
}

export function addAiQuestions(qs: AiQuestion[]) {
  base = { ...base, aiQuestions: [...base.aiQuestions, ...qs] }
  if (uid) save(LS.base(uid), base)
  recompute()
}

export function setAiConsent(at: number | null) {
  if (!base.user) return
  base = { ...base, user: { ...base.user, aiConsentAt: at } }
  if (uid) save(LS.base(uid), base)
  recompute()
}

/** Called after Better Auth signs someone in on this page. */
export async function signedIn() {
  authed = true
  await sync()
}

function forget() {
  purgeLocal(uid)
  uid = null; base = emptyData(); outbox = []; hasSnapshot = false; authed = false
  recompute()
}

export async function logout(all = false) {
  if (all) await authClient.revokeSessions().catch(() => {})
  await authClient.signOut().catch(() => {})
  forget()
}

export async function deleteAccount(password?: string) {
  const r = await authClient.deleteUser(password ? { password } : {})
  if (r.error) throw new Error(r.error.code ?? r.error.message ?? 'server')
  forget()
}

export const checkSession = () => sync()

export function leaseLost(attemptId: string) {
  const a = data.attempts[attemptId]
  return rejectedLease.has(attemptId) || (!!a && a.status === 'active' && !!a.leaseDevice && a.leaseDevice !== deviceId)
}

/** Everything stored about the account: profile and progress (right of access and portability). */
export function exportBackup() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), account: data.user, data: { ...data, user: undefined }, pending: outbox }, null, 1)
}

// Keep fresh while open
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void sync())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && authed) void sync() })
  setInterval(() => { if (document.visibilityState === 'visible' && authed) void sync() }, 30_000)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
const getVersion = () => version

export function useStore() {
  useSyncExternalStore(subscribe, getVersion)
  return { data, status, authed, hasSnapshot, pending: outbox.length, lastError }
}

export const getData = () => data
