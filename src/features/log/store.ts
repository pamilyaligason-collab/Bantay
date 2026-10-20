import Dexie, { type Table } from 'dexie'
import { enqueue } from '../../db'
import { track } from '../admin/events'
import type { Reading } from '../health/ranges'
import { hdb } from '../records/store'

/** Shared logging API for the assistant (L4) and sensors (L2). Local first, then synced through the outbox. */
export interface MedTaken { id?: number; personId: string; name: string; takenAt: string }
export type ActivitySource = 'manual' | 'health-connect' | 'healthkit'
export interface Activity { id?: number; personId: string; kind: string; minutes: number | null; steps: number | null; startedAt: string; source: ActivitySource }

class LogDB extends Dexie {
  meds!: Table<MedTaken, number>
  activity!: Table<Activity, number>
  constructor() {
    super('bantay-log')
    this.version(1).stores({ meds: '++id, personId, takenAt', activity: '++id, personId, startedAt, source' })
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
  void track('action', 'dose_logged')
  return id
}
export async function logActivity(a: Activity) {
  const id = await ldb.activity.add(a)
  await enqueue('activity', 'insert', { ...a, id })
  return id
}
