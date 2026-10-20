import type { Medication } from '../log/store'
import { dayOf, isLive, parseSchedule } from './meds'

/** Stock math for the Refill screen (public.medications stock_qty, per_day, stock_set_at). Pure: no React, no storage.
 *  Counts go down by per_day each day since stock_set_at; days left = what is left / per_day. A medicine taken as needed has no daily use and is not counted. */

export const LOW_DAYS = 7
const DAY = 86_400_000
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Mon 27 Oct" */
export const dateWords = (d: Date) => `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`

/** Units used a day: the saved per_day, else the number of times a day it is scheduled. null for as-needed or when it cannot be told. */
export function perDayOf(m: Medication): number | null {
  if (m.asNeeded) return null
  if (typeof m.perDay === 'number' && m.perDay > 0) return m.perDay
  const n = parseSchedule(m.schedule).times.length
  return n > 0 ? n : null
}

/** Whole local calendar days from `a` to `b`. */
const calendarDays = (a: Date, b: Date) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / DAY)

/** Units left now. null when no count was ever set. */
export function unitsLeft(m: Medication, now: Date): number | null {
  if (typeof m.stockQty !== 'number' || !Number.isFinite(m.stockQty)) return null
  const per = perDayOf(m)
  const set = m.stockSetAt ? Date.parse(m.stockSetAt) : NaN
  const elapsed = per != null && Number.isFinite(set) ? Math.max(0, calendarDays(new Date(set), now)) : 0 // whole days: a count taken this morning has used nothing yet
  return Math.max(0, m.stockQty - (per ?? 0) * elapsed)
}

/** Whole days of medicine left (0 = runs out today). null when not counted. */
export function daysLeft(m: Medication, now: Date): number | null {
  const per = perDayOf(m)
  const left = unitsLeft(m, now)
  if (per == null || left == null) return null
  return Math.floor(left / per)
}

export const refillBy = (days: number, now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)

export interface StockRow { med: Medication; name: string; left: number; perDay: number; days: number; by: Date; low: boolean; unit: string }

/** The live, counted medicines of a person, fewest days first. */
export function stockRows(meds: Medication[], personId: string, now: Date): StockRow[] {
  const rows: StockRow[] = []
  for (const med of meds) {
    if (med.personId !== personId || !isLive(med)) continue
    const days = daysLeft(med, now)
    const per = perDayOf(med)
    if (days == null || per == null) continue
    rows.push({ med, name: [med.name, med.strength].filter(Boolean).join(' '), left: Math.floor(unitsLeft(med, now) ?? 0), perDay: per, days, by: refillBy(days, now), low: days <= LOW_DAYS, unit: med.stockUnit || 'tablets' })
  }
  return rows.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
}

/** Live medicines with a daily use but no count yet: "set stock" candidates. */
export const uncounted = (meds: Medication[], personId: string): Medication[] =>
  meds.filter((m) => m.personId === personId && isLive(m) && perDayOf(m) != null && (typeof m.stockQty !== 'number')).sort((a, b) => a.name.localeCompare(b.name))

/** As-needed medicines are not counted: the screen says so. */
export const asNeededNames = (meds: Medication[], personId: string): string[] => meds.filter((m) => m.personId === personId && isLive(m) && m.asNeeded).map((m) => m.name)

export function refillLine(days: number, by: Date): string {
  if (days <= 0) return `Runs out today: refill now`
  return `${days} ${days === 1 ? 'day' : 'days'} left: refill by ${dateWords(by)}`
}

/** The Plan task for a refill: title and the day it is due (YYYY-MM-DD). */
export const refillTask = (name: string, by: Date) => ({ title: `Refill ${name}`, due: dayOf(by) })
