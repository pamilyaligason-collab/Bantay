import { enqueue } from '../../db'
import { track } from '../admin/events'
import { ldb, type MedStatus, type Medication } from '../log/store'
import { clock } from './model'
import { dayOf, toMinutes } from './meds'

/** Writes for the live medicine list (public.medications, 0014): the local Dexie row first, then one outbox upsert on client_id.
 *  A delete is soft: the local row goes and the server gets deleted_at, so every phone drops it. Works offline. */

export const TIME_CHIPS: { label: string; time: string }[] = [
  { label: 'Morning', time: '08:00' }, { label: 'Noon', time: '12:00' }, { label: 'Afternoon', time: '14:00' },
  { label: 'Late afternoon', time: '16:00' }, { label: 'Evening', time: '20:00' }, { label: 'Night', time: '21:00' }
]
export const PRESET_TIMES = new Set(TIME_CHIPS.map((c) => c.time))
export const DEFAULT_TIME = '08:00'

/** 'HH:MM' -> '8:00 AM'. */
export const clock12 = (hhmm: string): string => { const m = toMinutes(hhmm); return m == null ? hhmm : clock(m) }

export interface Draft { name: string; strength: string; dose: string; times: string[]; asNeeded: boolean }

/** The v1 schedule for a draft. Keeps keys this app does not know, drops the "still taking it / needs a time / check the name" flags (saving settles them). */
export function buildSchedule(prev: unknown, times: string[], asNeeded: boolean): Record<string, unknown> {
  const o = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...(prev as Record<string, unknown>) } : {}
  for (const k of ['review', 'review_since', 'needs_time', 'needs_check']) delete o[k]
  return { ...o, v: 1, times: asNeeded ? [] : [...new Set(times)].sort() }
}

const blank = (s: string) => s.trim() || undefined

/** Local row + outbox upsert. `deleted` true removes the local copy and sends deleted_at. */
async function write(row: Medication, deleted: boolean): Promise<Medication> {
  const cid = row.clientId ?? crypto.randomUUID()
  const r: Medication = { ...row, clientId: cid }
  if (deleted) { if (r.id != null) await ldb.medications.delete(r.id) }
  else if (r.id != null) await ldb.medications.put(r)
  else r.id = await ldb.medications.add(r)
  const { id: _local, origin: _o, editedAt: _e, ...rest } = r // the local id never travels; origin and edited_at are the server's
  await enqueue('medications', 'upsert', {
    ...rest, client_id: cid, strength: r.strength ?? null, dose: r.dose ?? null, stoppedOn: r.stoppedOn ?? null, deletedAt: deleted ? new Date().toISOString() : null
  })
  return r
}

/** A new manual medicine: confirmed, with a server id minted now so doses can point at it before the first sync. */
export function addMedication(personId: string, d: Draft): Promise<Medication> {
  void track('action', 'med_added')
  return write({
    clientId: crypto.randomUUID(), serverId: crypto.randomUUID(), personId, name: d.name.trim(), strength: blank(d.strength), dose: blank(d.dose),
    schedule: buildSchedule(null, d.times, d.asNeeded), asNeeded: d.asNeeded, medStatus: 'active', status: 'confirmed'
  }, false)
}

export function editMedication(m: Medication, d: Draft): Promise<Medication> {
  void track('action', 'med_edited')
  return write({
    ...m, name: d.name.trim(), strength: blank(d.strength), dose: blank(d.dose), asNeeded: d.asNeeded,
    schedule: buildSchedule(m.schedule, d.times, d.asNeeded)
  }, false)
}

export function setMedStatus(m: Medication, status: MedStatus, d?: Draft): Promise<Medication> {
  void track('action', status === 'paused' ? 'med_paused' : 'med_edited')
  const base = d ? { ...m, name: d.name.trim(), strength: blank(d.strength), dose: blank(d.dose), asNeeded: d.asNeeded, schedule: buildSchedule(m.schedule, d.times, d.asNeeded) } : m
  const { stoppedOn: _s, ...keep } = base
  return write({ ...keep, medStatus: status, ...(status === 'stopped' ? { stoppedOn: dayOf(new Date()) } : {}) }, false)
}

/** "Yes, still taking it": clears the review flag, nothing else changes. */
export function confirmStillTaking(m: Medication): Promise<Medication> {
  void track('action', 'med_edited')
  const s: Record<string, unknown> = m.schedule && typeof m.schedule === 'object' && !Array.isArray(m.schedule) ? { ...(m.schedule as Record<string, unknown>) } : { v: 1, times: Array.isArray(m.schedule) ? m.schedule : [] }
  delete s.review
  delete s.review_since
  return write({ ...m, schedule: s }, false)
}

export function deleteMedication(m: Medication): Promise<Medication> { void track('action', 'med_deleted'); return write(m, true) }
/** Undo of a delete: the same row (same client id) comes back and the server gets deleted_at null. */
export const restoreMedication = (m: Medication): Promise<Medication> => write(m, false)
