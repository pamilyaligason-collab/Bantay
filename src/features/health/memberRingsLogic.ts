import { STEP_GOAL } from '../today/myWeekLogic'

export interface MemberRings {
  steps: { n: number; ring: number } | null
  meds: { taken: number; total: number; ring: number } | null
  checkedIn: boolean | null
}

const unit = (n: number, of: number) => Math.min(1, Math.max(0, n / of))

/** What one family row may show. Pure.
 *  - steps: today's steps against the Bantay goal; null when none were shared today (never 0).
 *  - meds: only when `canSeeDetail` (you, or a person you are a writer carer of, D-109, the same set that gets the flag lines); a read-only link never gets medicine numbers.
 *  - checkedIn: null until the check-ins are read, so nothing says "no check-in" before we know. */
export function memberRings(i: { canSeeDetail: boolean; stepsToday: number | null; doses: { taken: number; total: number } | null; checkedIn: boolean | null }): MemberRings {
  const steps = typeof i.stepsToday === 'number' && Number.isFinite(i.stepsToday) && i.stepsToday >= 0 ? { n: i.stepsToday, ring: unit(i.stepsToday, STEP_GOAL) } : null
  const meds = i.canSeeDetail && i.doses && i.doses.total > 0 ? { taken: i.doses.taken, total: i.doses.total, ring: unit(i.doses.taken, i.doses.total) } : null
  return { steps, meds, checkedIn: i.checkedIn }
}
