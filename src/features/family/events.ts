import { blank, fdb, newClientId, removeRow, saveRow, type FamilyEvent } from './store'

const pad = (n: number) => String(n).padStart(2, '0')
/** Local calendar day as yyyy-mm-dd (the family lives in one time zone, so the phone's day is the day). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const eventDay = (e: FamilyEvent) => dayKey(new Date(e.startsAt))
/** "2026-10-20" + "18:30" (or null for all day) -> ISO instant in the phone's time zone. null when the date is not a real day. */
export function instant(date: string, time: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T${time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00'}:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
export const timeLabel = (e: FamilyEvent) => (e.allDay ? 'All day' : new Date(e.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))

export interface EventInput { title: string; date: string; time?: string | null; allDay?: boolean; endTime?: string | null; personId?: string | null }
export function toEvent(i: EventInput, clientId = newClientId()): FamilyEvent | null {
  const title = blank(i.title)
  const startsAt = instant(i.date, i.allDay ? null : (i.time ?? null))
  if (!title || !startsAt) return null
  const end = !i.allDay && i.endTime ? instant(i.date, i.endTime) : null
  return { clientId, title, startsAt, endsAt: end && end >= startsAt ? end : null, allDay: !!i.allDay, personId: i.personId || null }
}
export async function addEvent(i: EventInput): Promise<FamilyEvent | null> {
  const e = toEvent(i)
  return e ? saveRow<FamilyEvent>('family_events', e) : null
}
export const saveEvent = (e: FamilyEvent) => saveRow<FamilyEvent>('family_events', e)
export const removeEvent = (e: FamilyEvent) => removeRow('family_events', e)
export const allEvents = () => fdb.events.toArray()

/** Events of one day, all-day first then by time. */
export const eventsOn = (list: FamilyEvent[], day: string) =>
  list.filter((e) => eventDay(e) === day).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt))
/** The next event at or after `from`, or null. */
export const nextEvent = (list: FamilyEvent[], from: Date) => [...list].filter((e) => new Date(e.startsAt) >= from).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null

/** Seven days starting Monday of the week holding `d`. */
export function weekOf(d: Date): Date[] {
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i))
}

/** The "Mine" layer: what is mine or for the whole family (null owner). */
export const isMine = (owner: string | null | undefined, selfId: string | null) => owner == null || owner === selfId
