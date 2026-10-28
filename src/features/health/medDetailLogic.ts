import type { MedTaken, Medication } from '../log/store'
import type { AlertRow } from '../notify/store'
import { lastDays } from '../today/myWeekLogic'
import { countDoses, ON_TIME_MIN } from './doseCount'
import { dayOf, normaliseDrug, slotsFor } from './meds'
import { LOW_DAYS, daysLeft, unitsLeft } from './stock'

/** Medicine detail helpers (v8 health-meddetail). Pure: no React, no storage. Stock math is stock.ts, the dose counter is doseCount.ts. */

export interface StockInfo {
  kind: 'as-needed' | 'not-counted' | 'counted'
  left: number | null
  days: number | null
  unit: string
  /** Under a week left: the chip turns amber. */
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
  const low = days < LOW_DAYS // "under a week" (the Refill screen's own test is <=; v8 says under)
  return { kind: 'counted', left, days, unit, low, chip: days <= 0 ? 'Runs out today' : low ? `Refill in ${plural(days, 'day')}` : plural(days, 'day'), line: `${left} ${unit} left` }
}

export type CellState = 'taken' | 'late' | 'missed' | 'not-due' | 'pending'
export interface DayCell { day: string; label: string; state: CellState }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const at = (day: string) => new Date(`${day}T12:00:00`)
const lc = (s: string) => normaliseDrug(s) ?? s.trim().toLowerCase()
const MIN = 60_000

/** The last 7 days (oldest first, ending today) of one medicine: taken (within 2 hours of the slot), late, missed, not due (no dose scheduled, or before it started) or pending (today, still inside its 2 hours).
 *  A day with several slots shows its worst state. A take is matched to a slot by clock distance, so a 23:30 dose taken at 00:10 counts for the day it was due. `taken` counts taken and late days; `due` skips not-due and pending. */
export function weekStrip(med: Medication, takes: MedTaken[], now: Date): { cells: DayCell[]; taken: number; due: number } {
  const mine = takes.filter((t) => t.personId === med.personId && !t.skipped && ((med.serverId && t.medicationId === med.serverId) || (!t.medicationId && lc(t.name) === lc(med.name))))
  const used = new Set<MedTaken>()
  const cells = lastDays(now).map((day): DayCell => {
    const label = WD[at(day).getDay()]!
    const slots = slotsFor([med], med.personId, day)
    if (!slots.length) return { day, label, state: 'not-due' }
    const states: CellState[] = slots.map((s) => {
      const due = new Date(`${day}T${s.slot}:00`).getTime()
      const fits = (t: MedTaken) => !used.has(t) && (!t.medicationId || t.slot === s.slot)
      const near = mine.filter(fits).find((t) => Math.abs(Date.parse(t.takenAt) - due) <= ON_TIME_MIN * MIN)
      const same = near ?? mine.filter(fits).find((t) => dayOf(t.takenAt) === day)
      if (same) { used.add(same); return same === near ? 'taken' : 'late' }
      return day === dayOf(now) && due + ON_TIME_MIN * MIN > now.getTime() ? 'pending' : 'missed'
    })
    const state = (['missed', 'pending', 'late'] as const).find((k) => states.includes(k)) ?? 'taken'
    return { day, label, state }
  })
  return { cells, taken: cells.filter((c) => c.state === 'taken' || c.state === 'late').length, due: cells.filter((c) => c.state !== 'not-due' && c.state !== 'pending').length }
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
