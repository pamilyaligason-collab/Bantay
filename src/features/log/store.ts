import Dexie, { type Table } from 'dexie'
import { enqueue } from '../../db'
import { track } from '../admin/events'
import type { Reading } from '../health/ranges'
import { hdb } from '../records/store'

/** Shared logging API for the assistant (L4) and sensors (L2). Local first, then synced through the outbox. */
export interface MedTaken {
  id?: number; personId: string; name: string; takenAt: string
  /** The medications row this dose belongs to (its server id) and the 'HH:MM' slot. Old rows have neither and match by name. */
  medicationId?: string; slot?: string; skipped?: boolean
}
export type MedStatus = 'active' | 'paused' | 'stopped'
/** A row of public.medications (0014) kept locally. serverId is the server's id (meds_taken.medication_id points at it); clientId keys the sync. */
export interface Medication {
  id?: number; clientId?: string; serverId?: string; personId: string; name: string
  genericName?: string; strength?: string; form?: string; dose?: string
  /** Schedule shape v1 {"v":1,"times":["08:00"],...}; the legacy array form is tolerated (see health/meds.ts). */
  schedule?: unknown
  asNeeded?: boolean; perDay?: number; stockQty?: number; stockUnit?: string
  medStatus?: MedStatus; startedOn?: string; stoppedOn?: string
  status?: string; origin?: string; editedAt?: string
}
export type ActivitySource = 'manual' | 'health-connect' | 'healthkit'
export interface Activity { id?: number; personId: string; kind: string; minutes: number | null; steps: number | null; startedAt: string; source: ActivitySource }

class LogDB extends Dexie {
  meds!: Table<MedTaken, number>
  activity!: Table<Activity, number>
  medications!: Table<Medication, number>
  constructor() {
    super('bantay-log')
    this.version(1).stores({ meds: '++id, personId, takenAt', activity: '++id, personId, startedAt, source' })
    // v2: the live medicine schedule, and an index on a dose's medication. Existing meds and activity rows are kept as they are.
    this.version(2).stores({ meds: '++id, personId, takenAt, medicationId', activity: '++id, personId, startedAt, source', medications: '++id, &clientId, personId' }).upgrade(() => undefined)
  }
}
export const ldb = new LogDB()

export async function logReading(r: Reading) {
  const id = await hdb.readings.add(r)
  await enqueue('readings', 'insert', { ...r, id })
  void track('action', 'reading_added')
  return id
}
export async function logMedTaken(m: MedTaken) {
  const id = await ldb.meds.add(m)
  await enqueue('meds_taken', 'insert', { ...m, id })
  void track('action', m.skipped ? 'dose_skipped' : 'dose_logged')
  return id
}
/** One dose of a medication: taken (or skipped) at a slot. Carries the medication's server id so matching is by id, not by name. */
export function logDose(med: Pick<Medication, 'personId' | 'name' | 'serverId'>, slot: string, opts: { skipped?: boolean; at?: Date } = {}) {
  return logMedTaken({
    personId: med.personId, name: med.name, takenAt: (opts.at ?? new Date()).toISOString(), slot,
    ...(med.serverId ? { medicationId: med.serverId } : {}), ...(opts.skipped ? { skipped: true } : {})
  })
}
export async function logActivity(a: Activity) {
  const id = await ldb.activity.add(a)
  await enqueue('activity', 'insert', { ...a, id })
  return id
}
