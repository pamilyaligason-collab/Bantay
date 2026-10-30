import type { IconName } from '../shell/Icon'
import type { Hue } from '../look/cardParts'
import { dayKey, eventDay, timeLabel } from './events'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'

/** Family calendar rows (S16 L4, mockup family-s16). Pure: the screen passes what it read, this decides what shows on which day. */
export type CalKind = 'dose' | 'visit' | 'event' | 'task' | 'note'
/** Icon + label + hue per kind (colour plus shape plus word, D-96). */
export const KIND: Record<CalKind, { label: string; icon: IconName; hue: Hue }> = {
  dose: { label: 'Dose', icon: 'pill', hue: 'green' },
  visit: { label: 'Visit', icon: 'cross', hue: 'blue' },
  event: { label: 'Event', icon: 'calendar', hue: 'amber' },
  task: { label: 'Task', icon: 'check', hue: 'terra' },
  note: { label: 'Note', icon: 'file', hue: 'lilac' }
}
export const KIND_ORDER: CalKind[] = ['dose', 'visit', 'event', 'task', 'note']

export interface CalDose { personId: string; name: string; dose: string | null; slot: string }
export interface CalAppt { personId: string; startsAt?: string; dueOn?: string; provider?: string; facility?: string; purpose?: string; apptStatus?: string }
export interface CalRow { key: string; kind: CalKind; title: string; sub: string; sort: string; done: boolean }
export interface CalSource {
  events: FamilyEvent[]
  tasks: FamilyTask[]
  notes: FamilyNote[]
  appts: CalAppt[]
  /** Doses due on one day for the people this viewer may read (D-82). */
  doses: (day: string) => CalDose[]
  nameOf: (personId: string | null | undefined) => string
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const clock = (hm: string) => { const [h, m] = hm.split(':').map(Number); return new Date(2000, 0, 1, h ?? 0, m ?? 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }

/** Seven days Sunday to Saturday around `d` (the mockup strip). */
export function weekSun(d: Date): Date[] {
  const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
  return Array.from({ length: 7 }, (_, i) => new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i))
}

/** The month grid holding `d`: whole Sunday-first weeks, each cell flagged in / out of the month. */
export function monthCells(d: Date): { day: string; num: number; inMonth: boolean }[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  const n = Math.ceil((first.getDay() + last.getDate()) / 7) * 7
  return Array.from({ length: n }, (_, i) => {
    const c = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { day: dayKey(c), num: c.getDate(), inMonth: c.getMonth() === d.getMonth() }
  })
}

export const monthName = (d: Date) => d.toLocaleDateString('en', { month: 'long' })

const given = (n: string) => n.trim().split(/\s+/)[0] || n

/** What is on one day, earliest first: doses, visits, events, tasks (open ones overdue show on today), pinned notes (today only). */
export function rowsOn(day: string, s: CalSource, today: string = dayKey(new Date())): CalRow[] {
  const out: CalRow[] = []
  for (const d of s.doses(day)) {
    const label = d.dose && !d.name.toLowerCase().includes(d.dose.toLowerCase()) ? `${d.name} ${d.dose}` : d.name
    out.push({ key: `dose|${d.personId}|${d.name}|${d.slot}`, kind: 'dose', title: label, sub: `${given(s.nameOf(d.personId))} · ${clock(d.slot)}`, sort: d.slot, done: false })
  }
  s.appts.forEach((a, i) => {
    if (a.apptStatus === 'cancelled') return
    const at = a.startsAt ? new Date(a.startsAt) : null
    const aDay = at && !Number.isNaN(at.getTime()) ? dayKey(at) : a.dueOn ?? null
    if (aDay !== day) return
    const time = at && !Number.isNaN(at.getTime()) ? ` · ${clock(hhmm(a.startsAt!))}` : ''
    const where = a.facility || a.provider || given(s.nameOf(a.personId))
    out.push({ key: `visit|${i}|${a.startsAt ?? a.dueOn}`, kind: 'visit', title: a.purpose || a.provider || 'Doctor visit', sub: `${where}${time}`, sort: at && !Number.isNaN(at.getTime()) ? hhmm(a.startsAt!) : '00:00', done: a.apptStatus === 'done' })
  })
  for (const e of s.events) {
    if (eventDay(e) !== day) continue
    const who = e.personId ? given(s.nameOf(e.personId)) : 'Whole family'
    out.push({ key: `event|${e.clientId}`, kind: 'event', title: e.title, sub: `${who} · ${timeLabel(e)}`, sort: e.allDay ? '00:00' : hhmm(e.startsAt), done: false })
  }
  for (const t of s.tasks) {
    const overdue = !t.done && !!t.due && t.due < today && day === today
    if (t.due !== day && !overdue) continue
    const who = t.assigneePersonId ? given(s.nameOf(t.assigneePersonId)) : 'Everyone'
    out.push({ key: `task|${t.clientId}`, kind: 'task', title: t.title, sub: overdue ? `${who} · Overdue` : who, sort: '24:00', done: t.done })
  }
  if (day === today) {
    for (const n of s.notes) if (n.pinned) out.push({ key: `note|${n.clientId}`, kind: 'note', title: n.body.split('\n')[0] ?? '', sub: 'Pinned note', sort: '25:00', done: false })
  }
  return out.sort((a, b) => a.sort.localeCompare(b.sort) || a.title.localeCompare(b.title))
}

/** The kinds present on a day (the dots under the date), in the fixed KIND_ORDER. */
export function kindsOn(day: string, s: CalSource, today: string = dayKey(new Date())): CalKind[] {
  const have = new Set(rowsOn(day, s, today).map((r) => r.kind))
  return KIND_ORDER.filter((k) => have.has(k))
}
