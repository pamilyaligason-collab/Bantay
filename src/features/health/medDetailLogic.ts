import type { MedTaken, Medication } from '../log/store'
import type { AlertRow } from '../notify/store'
import { lastDays } from '../today/myWeekLogic'
import { countDoses } from './doseCount'
import { dayOf, slotsFor } from './meds'
import { LOW_DAYS, daysLeft, unitsLeft } from './stock'

/** Medicine detail helpers (v8 health-meddetail). Pure: no React, no storage. Stock math is stock.ts, the dose counter is doseCount.ts. */

export interface StockInfo {
  kind: 'as-needed' | 'not-counted' | 'counted'
  left: number | null
  days: number | null
  unit: string
  /** A week or less left (stock.ts LOW_DAYS, <=): the chip turns amber. */
  low: boolean
  /** "Refill in 6 days" (low) or "24 days"; null when nothing is counted. */
  chip: string | null
  /** "6 tablets left" / "No count yet" / "Taken as needed, so not counted". */
  line: string
}

const plural = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`

export function stockInfo(m: Medication, now: Date): StockInfo {
  const unit = m.stockUnit || 'tablets'
  if (m.asNeeded) return { kind: 'as-needed', left: null, days: null, unit, low: false, chip: null, line: 'Taken as needed, so not counted' }
  const days = daysLeft(m, now)
  const units = unitsLeft(m, now)
  if (days == null || units == null) return { kind: 'not-counted', left: null, days: null, unit, low: false, chip: null, line: 'No count yet' }
  const left = Math.floor(units)
  const low = days <= LOW_DAYS // the Refill screen's own test (stock.ts stockRows), so the chip and Refill agree
  return { kind: 'counted', left, days, unit, low, chip: days <= 0 ? 'Runs out today' : low ? `Refill in ${plural(days, 'day')}` : `${plural(days, 'day')} left`, line: `${left} ${unit} left` }
}

export type CellState = 'taken' | 'missed' | 'not-due' | 'pending'
export interface DayCell { day: string; label: string; state: CellState }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const at = (day: string) => new Date(`${day}T12:00:00`)

/** The last 7 days (oldest first, ending today) of one medicine, every dose judged by countDoses (the ONE dose counter, so the strip and the list agree):
 *  taken (every due slot taken within 2 hours of its time, early or late), missed (a due slot was not), not due (no dose scheduled, or before it started) or pending (today, a slot still inside its 2 hours).
 *  A day with several slots shows its worst state. `taken` and `due` count doses, the same numbers countDoses gives for these 7 days. */
export function weekStrip(med: Medication, takes: MedTaken[], now: Date): { cells: DayCell[]; taken: number; due: number } {
  const today = dayOf(now)
  let taken = 0
  let due = 0
  const cells = lastDays(now).map((day): DayCell => {
    const n = countDoses({ meds: [med], takes, personId: med.personId, now, days: [day] })
    taken += n.done
    due += n.want
    const open = day === today && !(med.startedOn && med.startedOn.slice(0, 10) > day) && slotsFor([med], med.personId, day).length > n.want
    const state: CellState = n.want > n.done ? 'missed' : open ? 'pending' : n.want > 0 ? 'taken' : 'not-due'
    return { day, label: WD[at(day).getDay()]!, state }
  })
  return { cells, taken, due }
}

const clock = (iso: string) => { const d = new Date(iso); const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }

/** The newest missed day in the strip and whether this phone's user saw the family alert for it ("Thursday: missed. You saw the alert at 8:30 AM.").
 *  Only the viewer's own carer_alerts rows are on the phone, so it never claims what another carer saw. null when nothing was missed. */
export function missNote(cells: DayCell[], alerts: AlertRow[], med: Medication): string | null {
  const miss = [...cells].reverse().find((c) => c.state === 'missed')
  if (!miss) return null
  const head = `${WEEKDAY_LONG[at(miss.day).getDay()]}: missed.`
  const slots = slotsFor([med], med.personId, miss.day).map((s) => s.slot)
  const hit = alerts
    .filter((a) => a.kind === 'dose_missed' && a.personId === med.personId && !!a.ref && a.ref.includes(miss.day) && slots.some((sl) => a.ref!.includes(sl)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  if (!hit) return head
  return hit.seenAt ? `${head} You saw the alert at ${clock(hit.seenAt)}.` : `${head} The family was told. You have not opened the alert yet.`
}

/** "5 of 7 doses on time this week" for the list, from the one shared counter; null when no dose has come due yet. */
export function weekCounter(i: { meds: Medication[]; takes: MedTaken[]; personId: string; now: Date }): string | null {
  const { done, want } = countDoses({ ...i, days: lastDays(i.now) })
  return want > 0 ? `${done} of ${want} ${want === 1 ? 'dose' : 'doses'} on time this week` : null
}
