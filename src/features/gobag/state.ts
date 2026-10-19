import { ALL_IDS, RECHECK_DAYS } from './items'

export const KEY = 'gobag.state'
/** Ticked item ids, and when the person last ticked or unticked anything (ms). null = never. */
export interface BagState { done: string[]; checkedAt: number | null }
export const EMPTY: BagState = { done: [], checkedAt: null }

/** Read any stored shape; unknown ids (an old list) are dropped, a bad date is null. */
export function readState(raw: unknown): BagState {
  const r = raw as Partial<BagState> | null | undefined
  const done = Array.isArray(r?.done) ? ALL_IDS.filter((id) => (r!.done as unknown[]).includes(id)) : []
  const at = typeof r?.checkedAt === 'number' && Number.isFinite(r.checkedAt) && r.checkedAt > 0 ? r.checkedAt : null
  return { done, checkedAt: at }
}

export const toggle = (s: BagState, id: string, now: number): BagState => ({
  done: s.done.includes(id) ? s.done.filter((x) => x !== id) : [...s.done, id],
  checkedAt: now
})

/** True when never checked, or the last check is 3 months or more ago. */
export const dueAgain = (s: BagState, now: number): boolean => s.checkedAt === null || now - s.checkedAt >= RECHECK_DAYS * 86_400_000
