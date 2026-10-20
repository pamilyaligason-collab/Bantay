import { enqueue } from '../../db'
import { track } from '../admin/events'
import { ldb, type MedStatus, type Medication } from '../log/store'
import { clock } from './model'
import { dayOf, normaliseDrug, toMinutes } from './meds'

/** Writes for the live medicine list (public.medications, 0014): the local Dexie row first, then one outbox upsert on client_id.
 *  The upsert carries only the fields that changed (plus the keys and the two NOT NULL ones), so an edit on this phone never rewrites
 *  what another phone or the server changed meanwhile. A delete is soft: the local row goes and the server gets deleted_at. Works offline. */

export const TIME_CHIPS: { label: string; time: string }[] = [
  { label: 'Morning', time: '08:00' }, { label: 'Noon', time: '12:00' }, { label: 'Afternoon', time: '14:00' },
  { label: 'Late afternoon', time: '16:00' }, { label: 'Evening', time: '20:00' }, { label: 'Night', time: '21:00' }
]
export const PRESET_TIMES = new Set(TIME_CHIPS.map((c) => c.time))
export const DEFAULT_TIME = '08:00'

/** 'HH:MM' -> '8:00 AM'. */
export const clock12 = (hhmm: string): string => { const m = toMinutes(hhmm); return m == null ? hhmm : clock(m) }

export interface Draft { name: string; strength: string; dose: string; times: string[]; asNeeded: boolean }

/** The same drug is already on this person's list (any status): the add is refused, the caller offers to open it or start it again. */
export class DuplicateMedication extends Error {
  constructor(public existing: Medication) { super('duplicate_medication') }
}

/** A local row (not deleted, any status) with the same normalised drug name for this person. */
export async function findDuplicate(personId: string, name: string, exceptClientId?: string): Promise<Medication | undefined> {
  const q = normaliseDrug(name)
  if (!q) return undefined
  const rows = await ldb.medications.where('personId').equals(personId).toArray()
  return rows.find((m) => !(m as { deletedAt?: unknown }).deletedAt && m.clientId !== exceptClientId && (normaliseDrug(m.name) === q || normaliseDrug(m.genericName) === q))
}

/** The v1 schedule for a draft. Keeps keys this app does not know, drops the "still taking it / needs a time / check the name" flags (saving settles them). */
export function buildSchedule(prev: unknown, times: string[], asNeeded: boolean): Record<string, unknown> {
  const o = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...(prev as Record<string, unknown>) } : {}
  for (const k of ['review', 'review_since', 'needs_time', 'needs_check']) delete o[k]
  return { ...o, v: 1, times: asNeeded ? [] : [...new Set(times)].sort() }
}

const blank = (s: string) => s.trim() || undefined
const asObj = (s: unknown): Record<string, unknown> => (s && typeof s === 'object' && !Array.isArray(s) ? { ...(s as Record<string, unknown>) } : { v: 1, times: Array.isArray(s) ? s : [] })
const FIELDS = ['genericName', 'strength', 'form', 'dose', 'schedule', 'asNeeded', 'perDay', 'stockQty', 'stockUnit', 'stockSetAt', 'medStatus', 'startedOn', 'stoppedOn', 'status'] as const

/** Local row + outbox upsert of what changed. `mode` 'delete' removes the local copy and sends deleted_at; 'restore' sends deleted_at null. */
async function write(old: Medication | null, next: Medication, mode: 'save' | 'delete' | 'restore' = 'save'): Promise<Medication> {
  const cid = next.clientId ?? crypto.randomUUID()
  const r: Medication = { ...next, clientId: cid }
  if (mode === 'delete') { if (r.id != null) await ldb.medications.delete(r.id) }
  else if (r.id != null) await ldb.medications.put(r)
  else r.id = await ldb.medications.add(r)
  const payload: Record<string, unknown> = { client_id: cid, clientId: cid, serverId: r.serverId, personId: r.personId, name: r.name }
  for (const k of FIELDS) {
    if (mode === 'restore' || !old || JSON.stringify(old[k] ?? (k === 'asNeeded' ? false : null)) !== JSON.stringify(r[k] ?? (k === 'asNeeded' ? false : null))) payload[k] = r[k] ?? null
  }
  if (mode === 'delete') payload.deletedAt = new Date().toISOString()
  else if (mode === 'restore' || !old) payload.deletedAt = null
  await enqueue('medications', 'upsert', payload)
  return r
}

/** A new manual medicine: confirmed, with a server id minted now so doses can point at it before the first sync. Throws DuplicateMedication when the drug is already listed. */
export async function addMedication(personId: string, d: Draft): Promise<Medication> {
  const dup = await findDuplicate(personId, d.name)
  if (dup) throw new DuplicateMedication(dup)
  void track('action', 'med_added')
  return write(null, {
    clientId: crypto.randomUUID(), serverId: crypto.randomUUID(), personId, name: d.name.trim(), strength: blank(d.strength), dose: blank(d.dose),
    schedule: buildSchedule(null, d.times, d.asNeeded), asNeeded: d.asNeeded, medStatus: 'active', status: 'confirmed'
  })
}

export async function editMedication(m: Medication, d: Draft): Promise<Medication> {
  const dup = await findDuplicate(m.personId, d.name, m.clientId)
  if (dup) throw new DuplicateMedication(dup)
  void track('action', 'med_edited')
  return write(m, { ...m, name: d.name.trim(), strength: blank(d.strength), dose: blank(d.dose), asNeeded: d.asNeeded, schedule: buildSchedule(m.schedule, d.times, d.asNeeded) })
}

/** Pause, resume, stop or start again. Stopping settles the review (review flags go; needs_check stays) and keeps a stoppedOn that is already there.
 *  Anything but stopped clears stoppedOn. `d` applies the sheet's unsaved edits at the same time. */
export function setMedStatus(m: Medication, status: MedStatus, d?: Draft): Promise<Medication> {
  void track('action', status === 'paused' ? 'med_paused' : 'med_edited')
  let schedule: unknown = m.schedule
  if (d) {
    const had = asObj(m.schedule).needs_check
    schedule = buildSchedule(m.schedule, d.times, d.asNeeded)
    if (had && status === 'stopped') (schedule as Record<string, unknown>).needs_check = had
  }
  if (status === 'stopped') { const s = asObj(schedule); delete s.review; delete s.review_since; schedule = s }
  const { stoppedOn: was, ...keep } = m
  const base = d ? { ...keep, name: d.name.trim(), strength: blank(d.strength), dose: blank(d.dose), asNeeded: d.asNeeded } : keep
  const next: Medication = { ...base, schedule, medStatus: status, ...(status === 'stopped' ? { stoppedOn: m.medStatus === 'stopped' && was ? was : dayOf(new Date()) } : {}) }
  return write(m, next)
}

/** "Yes, still taking it": clears the review flag, nothing else changes. */
export function confirmStillTaking(m: Medication): Promise<Medication> {
  void track('action', 'med_edited')
  const s = asObj(m.schedule)
  delete s.review
  delete s.review_since
  return write(m, { ...m, schedule: s })
}

export function deleteMedication(m: Medication): Promise<Medication> { void track('action', 'med_deleted'); return write(m, m, 'delete') }
/** Undo of a delete: the same row (same client id) comes back and the server gets deleted_at null. */
export const restoreMedication = (m: Medication): Promise<Medication> => write(null, m, 'restore')

/** Refill: "I counted N left" (or bought more) at `at`. Days left count down from here; perDay is saved when given (a medicine with no daily use cannot be counted). */
export function setStock(m: Medication, qty: number, opts: { perDay?: number; unit?: string; at?: Date } = {}): Promise<Medication> {
  void track('action', 'med_edited')
  return write(m, { ...m, stockQty: Math.max(0, qty), stockSetAt: (opts.at ?? new Date()).toISOString(), ...(opts.perDay != null ? { perDay: opts.perDay } : {}), ...(opts.unit ? { stockUnit: opts.unit } : {}) })
}
