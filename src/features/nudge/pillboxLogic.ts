import { dayOf, matchDoses, slotsFor, type DoseState } from '../health/meds'
import { lastDays } from '../today/myWeekLogic'
import { recentlyTaken } from '../today/useDueMeds'
import { ldb, logDose, type MedTaken, type Medication } from '../log/store'

/** The weekly pillbox: the 7 days ending today, each split into morning (before 12:00) and evening (12:00 on). Pure, except `logHalf`.
 *  A cell is 'none' (no dose due), 'done' (all taken), 'skipped' (answered, some skipped), 'open' (today, still to take) or 'missed' (a past day with a dose not logged; shown gently as "Not logged", never red). */
export type CellState = 'none' | 'done' | 'skipped' | 'open' | 'missed'
export type Half = 'am' | 'pm'
export interface PillCell { state: CellState; doses: DoseState[] }
export interface PillDay { day: string; today: boolean; am: PillCell; pm: PillCell }

const NOON = 12 * 60
const halfOf = (at: number): Half => (at < NOON ? 'am' : 'pm')

export function pillbox(i: { personId: string; meds: Medication[]; takes: Pick<MedTaken, 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped' | 'personId'>[]; now: Date }): PillDay[] {
  const today = dayOf(i.now)
  const mine = i.takes.filter((t) => t.personId === i.personId)
  return lastDays(i.now).map((day) => {
    const doses = matchDoses(slotsFor(i.meds, i.personId, day), mine, day)
    const cell = (h: Half): PillCell => {
      const ds = doses.filter((d) => halfOf(d.at) === h)
      if (!ds.length) return { state: 'none', doses: ds }
      const pending = ds.some((d) => d.state === 'pending')
      const state: CellState = pending ? (day === today ? 'open' : 'missed') : ds.some((d) => d.state === 'skipped') ? 'skipped' : 'done'
      return { state, doses: ds }
    }
    return { day, today: day === today, am: cell('am'), pm: cell('pm') }
  })
}

/** Log the still-open doses of TODAY's morning or evening for this person, through the same logDose the Taken button uses. Re-reads the local tables first, so a dose already logged
 *  (here, from a reminder or on another screen) is never logged twice. Resolves to the rows logged. Only today's cells can be logged. */
export async function logHalf(personId: string, half: Half, now = new Date()): Promise<number> {
  const day = dayOf(now)
  const yest = new Date(now); yest.setHours(0, 0, 0, 0); yest.setDate(yest.getDate() - 1)
  const [meds, takes] = await Promise.all([ldb.medications.filter((m) => m.personId === personId).toArray(), ldb.meds.where('takenAt').aboveOrEqual(yest.toISOString()).filter((t) => t.personId === personId).toArray()])
  // Same rule as markTaken: the day match alone misses a dose just after midnight tapped before midnight.
  const open = matchDoses(slotsFor(meds, personId, day), takes, day).filter((d) => halfOf(d.at) === half && d.state === 'pending' && !recentlyTaken(takes, personId, d, now.getTime()))
  for (const d of open) await logDose({ personId, name: d.name, serverId: d.medicationId ?? undefined }, d.slot, { at: now })
  return open.length
}
