import { supabase } from '../../auth/client'
import { parseSchedule } from '../../health/meds'

// Calendar data for the web admin. Reads family_events, family_tasks, appointments, medicine times, follow-ups and expiries;
// writes only the family plan tables (same formats as the phone, so phones sync them) and appointment/medicine schedule fields.
// All days are Asia/Manila (UTC+8, no daylight saving), like every other admin page.
export type Kind = 'event' | 'task' | 'appointment' | 'dose' | 'followup' | 'expiry'
export const KINDS: { key: Kind; label: string; color: string }[] = [
  { key: 'event', label: 'Events', color: '--c-family' },
  { key: 'task', label: 'Tasks', color: '--c-safety' },
  { key: 'appointment', label: 'Appointments', color: '--c-vitals' },
  { key: 'dose', label: 'Medicine times', color: '--c-medicine' },
  { key: 'followup', label: 'Follow-ups', color: '--c-labs' },
  { key: 'expiry', label: 'Expiries', color: '--c-alert' }
]
export type AgendaItem = {
  kind: Kind
  id: string
  /** 'YYYY-MM-DD' when allDay, else an ISO instant (+08:00 for doses, Z for database timestamps). */
  when: string
  allDay: boolean
  title: string
  personId: string | null
  status: string
  source: string
  editable: boolean
  /** the source row id (doses: the medication id) */
  rowId: string
  endsAt?: string | null
  /** tasks */
  done?: boolean
  overdue?: boolean
  /** appointments: due_on when there is no exact time */
  dueOn?: string | null
  /** doses: the medication's raw schedule json */
  schedule?: unknown
}
export const DOSE_CAP_DAYS = 14

// ---- Manila day helpers (pure) ----
const OFF = 8 * 3600e3
const DAY = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
export const isDay = (s: unknown): s is string => typeof s === 'string' && DAY.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
export const isTime = (s: unknown): s is string => typeof s === 'string' && HHMM.test(s)
/** Manila calendar day of an instant (a plain day passes through). '' for garbage. */
export function manilaDay(v: string | Date): string {
  if (typeof v === 'string' && DAY.test(v)) return v
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? '' : new Date(t + OFF).toISOString().slice(0, 10)
}
export function manilaTime(v: string | Date): string {
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? '' : new Date(t + OFF).toISOString().slice(11, 16)
}
export const todayManila = (now: Date = new Date()) => manilaDay(now)
export const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
/** Monday = 0 ... Sunday = 6 */
export const dow = (day: string) => (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5)
/** Manila day + 'HH:MM' (or null = midnight) -> ISO instant. null when either is not real. */
export function toInstant(day: string, time: string | null): string | null {
  if (!isDay(day) || (time != null && !isTime(time))) return null
  return new Date(`${day}T${time ?? '00:00'}:00+08:00`).toISOString()
}
export const monthOf = (day: string) => day.slice(0, 7)
export const shiftMonth = (month: string, n: number) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7) }
/** The visible month grid: whole weeks (Monday first) covering the month, so leading and trailing days of the neighbour months appear. */
export function monthGrid(month: string): string[] {
  const first = month + '-01'
  const last = addDays(shiftMonth(month, 1) + '-01', -1)
  const start = addDays(first, -dow(first))
  const end = addDays(last, 6 - dow(last))
  return Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => addDays(start, i))
}
export const weekDays = (day: string) => Array.from({ length: 7 }, (_, i) => addDays(day, i - dow(day)))

/** Drop anything that belongs to an archived person (items with no person stay). */
export const withoutArchived = <T extends { person_id?: unknown; personId?: string | null }>(list: T[], archived: Set<string>): T[] =>
  archived.size ? list.filter((i) => { const id = i.personId ?? i.person_id; return typeof id !== 'string' || !archived.has(id) }) : list

export const itemDay = (i: AgendaItem) => manilaDay(i.when)
const sortKey = (i: AgendaItem) => itemDay(i) + (i.allDay ? '00:00' : manilaTime(i.when)) + i.title
export const sortItems = (list: AgendaItem[]) => [...list].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0))
export const itemsOn = (list: AgendaItem[], day: string) => list.filter((i) => itemDay(i) === day)

// ---- Medicine times ----
export type MedRow = { id: string; person_id: string; name: string; strength?: string | null; schedule: unknown; as_needed?: boolean | null; med_status?: string | null; deleted_at?: string | null; status?: string | null }
/** One dose item per active, scheduled medicine time per day. Capped at DOSE_CAP_DAYS from `from`; `capped` says it was cut. */
export function expandDoses(meds: MedRow[], from: string, to: string): { items: AgendaItem[]; capped: boolean } {
  const last = addDays(from, DOSE_CAP_DAYS - 1)
  const end = to < last ? to : last
  const items: AgendaItem[] = []
  for (const m of meds) {
    if (m.deleted_at || m.as_needed || m.med_status !== 'active' || m.status === 'rejected') continue
    const times = parseSchedule(m.schedule).times
    for (let d = from; d <= end; d = addDays(d, 1)) {
      for (const t of times) {
        items.push({ kind: 'dose', id: `${m.id}@${d}T${t}`, rowId: m.id, when: `${d}T${t}:00+08:00`, allDay: false, title: [m.name, m.strength].filter(Boolean).join(' '), personId: m.person_id, status: 'active', source: 'medications', editable: true, schedule: m.schedule })
      }
    }
  }
  return { items, capped: to > last }
}

/** HH:MM list from comma/space separated text: null when any entry is not a clock time. Sorted, no duplicates. */
export function parseTimesText(text: string): string[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean)
  if (!parts.every(isTime)) return null
  return [...new Set(parts)].sort()
}
/** New schedule json: keeps unrelated keys (review flags), sets v:1 and times; times now known, so needs_time goes. */
export function scheduleWithTimes(old: unknown, times: string[]): Record<string, unknown> {
  const o = old && typeof old === 'object' && !Array.isArray(old) ? { ...(old as Record<string, unknown>) } : {}
  if (times.length) delete o.needs_time
  return { ...o, v: 1, times }
}

// ---- Payloads (exact columns, nothing extra) ----
export type EventInput = { title: string; date: string; allDay: boolean; start?: string | null; end?: string | null; personId?: string | null }
const clean = (s: string | null | undefined) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 200) : null)
export function eventFields(i: EventInput) {
  const title = clean(i.title)
  const starts_at = toInstant(i.date, i.allDay ? null : (i.start ?? null))
  if (!title || !starts_at || (!i.allDay && !i.start)) return null
  const e = !i.allDay && i.end ? toInstant(i.date, i.end) : null
  return { title, starts_at, ends_at: e && e >= starts_at ? e : null, all_day: i.allDay, person_id: i.personId || null }
}
export function eventInsert(i: EventInput, uid: string, clientId: string = crypto.randomUUID()) {
  const f = eventFields(i)
  return f ? { client_id: clientId, ...f, created_by: uid } : null
}
export type TaskInput = { title: string; due?: string | null; assigneePersonId?: string | null }
export function taskFields(i: TaskInput) {
  const title = clean(i.title)
  if (!title || (i.due && !isDay(i.due))) return null
  return { title, due: i.due || null, assignee_person_id: i.assigneePersonId || null }
}
export function taskInsert(i: TaskInput, uid: string, clientId: string = crypto.randomUUID()) {
  const f = taskFields(i)
  return f ? { client_id: clientId, ...f, done: false, created_by: uid } : null
}

// ---- Reads ----
type Row = Record<string, unknown>
const ID_LABEL: Record<string, string> = { philsys: 'PhilSys ID', senior: 'Senior citizen ID', pwd: 'PWD ID', drivers: "Driver's licence", passport: 'Passport', umid: 'UMID', voters: "Voter's ID", postal: 'Postal ID', philhealth: 'PhilHealth ID', hmo: 'HMO card', tin: 'TIN ID', sss: 'SSS ID', other: 'ID' }
const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** `overdue`: also return open tasks due before `from` (the dashboard card shows them in amber). */
export async function loadAgenda(from: string, to: string, opts: { overdue?: boolean } = {}): Promise<{ items: AgendaItem[]; doseCapped: boolean; doseFrom: string; partial: boolean }> {
  if (!supabase) throw new Error('not_connected')
  const sb = supabase
  const t0 = toInstant(from, null)!, t1 = toInstant(addDays(to, 1), null)!
  const get = async (build: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[] | null> => {
    try { const { data, error } = await build(); return error ? null : ((data ?? []) as Row[]) } catch { return null }
  }
  const [ev, tk, ap, md, rx, ids, ins, gone] = await Promise.all([
    get(() => sb.from('family_events').select('id, title, starts_at, ends_at, all_day, person_id').is('deleted_at', null).gte('starts_at', t0).lt('starts_at', t1).limit(500)),
    get(() => {
      let q = sb.from('family_tasks').select('id, title, due, assignee_person_id, done').is('deleted_at', null).not('due', 'is', null).lte('due', to)
      q = opts.overdue ? q.or(`due.gte.${from},done.eq.false`) : q.gte('due', from)
      return q.limit(500)
    }),
    get(() => sb.from('appointments').select('id, person_id, starts_at, due_on, provider, facility, purpose, appt_status, status').neq('status', 'rejected').or(`and(starts_at.gte.${t0},starts_at.lt.${t1}),and(starts_at.is.null,due_on.gte.${from},due_on.lte.${to})`).limit(500)),
    get(() => sb.from('medications').select('id, person_id, name, strength, schedule, as_needed, med_status, deleted_at, status').is('deleted_at', null).eq('med_status', 'active').limit(500)),
    get(() => sb.from('prescriptions').select('id, person_id, prescriber, follow_up_on, status').neq('status', 'rejected').gte('follow_up_on', from).lte('follow_up_on', to).limit(500)),
    get(() => sb.from('person_identifiers').select('id, person_id, id_type, expires_on, status').neq('status', 'rejected').gte('expires_on', from).lte('expires_on', to).limit(500)), // never id_number
    get(() => sb.from('insurance_policies').select('id, person_id, carrier, plan, valid_to, status').neq('status', 'rejected').gte('valid_to', from).lte('valid_to', to).limit(500)), // never member_no
    get(() => sb.from('people').select('id, archived_at').limit(500)) // fails before migration 0022: then nobody is archived
  ])
  const all = [ev, tk, ap, md, rx, ids, ins]
  const away = new Set((gone ?? []).filter((r) => r.archived_at).map((r) => String(r.id)))
  if (all.every((r) => r === null)) throw new Error('not_connected')
  const today = todayManila()
  const items: AgendaItem[] = []
  for (const r of ev ?? []) items.push({ kind: 'event', id: `event:${r.id}`, rowId: String(r.id), when: String(r.starts_at), endsAt: str(r.ends_at), allDay: r.all_day === true, title: String(r.title), personId: str(r.person_id), status: 'planned', source: 'family_events', editable: true })
  for (const r of tk ?? []) {
    const due = String(r.due), done = r.done === true
    items.push({ kind: 'task', id: `task:${r.id}`, rowId: String(r.id), when: due, allDay: true, title: String(r.title), personId: str(r.assignee_person_id), status: done ? 'done' : 'open', source: 'family_tasks', editable: true, done, overdue: !done && due < today })
  }
  for (const r of ap ?? []) {
    const at = str(r.starts_at), due = str(r.due_on)
    items.push({ kind: 'appointment', id: `appointment:${r.id}`, rowId: String(r.id), when: at ?? due ?? '', allDay: !at, title: [str(r.purpose), str(r.provider), str(r.facility)].filter(Boolean)[0] ?? 'Appointment', personId: str(r.person_id), status: str(r.appt_status) ?? 'planned', source: 'appointments', editable: true, dueOn: due })
  }
  // A wide range shows its 14 dose days from today when today is inside it (what the family needs next), else from the start.
  const doseFrom = today >= from && today <= to ? today : from
  const d = expandDoses(withoutArchived((md ?? []) as unknown as MedRow[], away), doseFrom, to)
  items.push(...d.items)
  for (const r of rx ?? []) items.push({ kind: 'followup', id: `followup:${r.id}`, rowId: String(r.id), when: String(r.follow_up_on), allDay: true, title: r.prescriber ? `Follow-up with ${r.prescriber}` : 'Follow-up after prescription', personId: str(r.person_id), status: str(r.status) ?? 'draft', source: 'prescriptions', editable: false })
  for (const r of ids ?? []) items.push({ kind: 'expiry', id: `id:${r.id}`, rowId: String(r.id), when: String(r.expires_on), allDay: true, title: `${ID_LABEL[String(r.id_type)] ?? 'ID'} expires`, personId: str(r.person_id), status: str(r.status) ?? 'draft', source: 'person_identifiers', editable: false })
  for (const r of ins ?? []) items.push({ kind: 'expiry', id: `policy:${r.id}`, rowId: String(r.id), when: String(r.valid_to), allDay: true, title: `${str(r.carrier) ?? 'Insurance'}${r.plan ? ' ' + r.plan : ''} ends`, personId: str(r.person_id), status: str(r.status) ?? 'draft', source: 'insurance_policies', editable: false })
  return { items: sortItems(withoutArchived(items, away).filter((i) => i.when)), doseCapped: d.capped, doseFrom, partial: all.some((r) => r === null) }
}

// ---- Writes ----
export type Res<T = void> = { ok: true; data: T } | { ok: false; error: 'not_connected' | 'forbidden' | 'invalid' | 'failed' }
const fail = (e: unknown): Res<never> => {
  const c = (e as { code?: string } | null)?.code
  return { ok: false, error: c === '42501' || c === 'PGRST301' ? 'forbidden' : c && /^(22|23)/.test(c) ? 'invalid' : 'failed' }
}
export const writeError = (e: string) => e === 'not_connected' ? 'Not connected yet. Try again when you are online.' : e === 'forbidden' ? 'You do not have permission to change this.' : e === 'invalid' ? 'Check the date and times and try again.' : 'Could not save. Try again.'
async function run<T>(f: (s: NonNullable<typeof supabase>) => PromiseLike<{ data: unknown; error: unknown }>, pick: (d: unknown) => T): Promise<Res<T>> {
  if (!supabase) return { ok: false, error: 'not_connected' }
  try { const { data, error } = await f(supabase); return error ? fail(error) : { ok: true, data: pick(data) } } catch (e) { return fail(e) }
}
async function uid(): Promise<string | null> {
  if (!supabase) return null
  try { return (await supabase.auth.getSession()).data.session?.user.id ?? null } catch { return null }
}
const idOf = (d: unknown) => String((d as { id?: string } | null)?.id ?? '')
const nothing = () => undefined

export async function createEvent(i: EventInput): Promise<Res<string>> {
  const u = await uid(); if (!u) return { ok: false, error: 'not_connected' }
  const row = eventInsert(i, u); if (!row) return { ok: false, error: 'invalid' }
  return run((s) => s.from('family_events').insert(row).select('id').single(), idOf)
}
export async function createTask(i: TaskInput): Promise<Res<string>> {
  const u = await uid(); if (!u) return { ok: false, error: 'not_connected' }
  const row = taskInsert(i, u); if (!row) return { ok: false, error: 'invalid' }
  return run((s) => s.from('family_tasks').insert(row).select('id').single(), idOf)
}
export async function updateEvent(id: string, i: EventInput): Promise<Res> {
  const f = eventFields(i); if (!f) return { ok: false, error: 'invalid' }
  return run((s) => s.from('family_events').update(f).eq('id', id), nothing)
}
export async function updateTask(id: string, i: TaskInput): Promise<Res> {
  const f = taskFields(i); if (!f) return { ok: false, error: 'invalid' }
  return run((s) => s.from('family_tasks').update(f).eq('id', id), nothing)
}
/** Soft delete (the phone removes it on its next pull); restore = deleted:false. */
export const setDeleted = (table: 'family_events' | 'family_tasks', id: string, deleted: boolean): Promise<Res> =>
  run((s) => s.from(table).update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id), nothing)
export const setTaskDone = (id: string, done: boolean): Promise<Res> => run((s) => s.from('family_tasks').update({ done }).eq('id', id), nothing)
export const APPT_STATUSES = ['planned', 'done', 'missed', 'cancelled'] as const
export async function updateAppointment(id: string, day: string, time: string | null, apptStatus: string): Promise<Res> {
  const at = time ? toInstant(day, time) : null
  if ((time && !at) || !DAY.test(day) || !(APPT_STATUSES as readonly string[]).includes(apptStatus)) return { ok: false, error: 'invalid' }
  // No time: a date-only appointment (due_on). With a time: starts_at, and the stale due_on is cleared.
  return run((s) => s.from('appointments').update({ starts_at: at, due_on: at ? null : day, appt_status: apptStatus }).eq('id', id), nothing)
}
export const setApptStatus = (id: string, apptStatus: string): Promise<Res> => run((s) => s.from('appointments').update({ appt_status: apptStatus }).eq('id', id), nothing)
export const restoreAppointment = (id: string, startsAt: string | null, dueOn: string | null, apptStatus: string): Promise<Res> =>
  run((s) => s.from('appointments').update({ starts_at: startsAt, due_on: dueOn, appt_status: apptStatus }).eq('id', id), nothing)
export async function updateMedTimes(id: string, oldSchedule: unknown, times: string[]): Promise<Res> {
  if (!times.every(isTime)) return { ok: false, error: 'invalid' }
  return run((s) => s.from('medications').update({ schedule: scheduleWithTimes(oldSchedule, times) }).eq('id', id), nothing)
}
/** Undo for the schedule: put the old json back untouched. */
export const restoreMedSchedule = (id: string, schedule: unknown): Promise<Res> => run((s) => s.from('medications').update({ schedule }).eq('id', id), nothing)

// ---- Labels ----
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** 'Today', 'Tomorrow', 'Yesterday' or 'Fri 23 Oct'. */
export function dayLabel(day: string, today: string = todayManila()): string {
  const n = daysBetween(today, day)
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : `${WEEKDAYS[dow(day)]} ${Number(day.slice(8))} ${MO[Number(day.slice(5, 7)) - 1]}`
}
/** '3:30 PM' for a Manila 'HH:MM'. */
export const clock12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
export const timeText = (i: AgendaItem) => (i.allDay ? 'All day' : clock12(manilaTime(i.when)))
