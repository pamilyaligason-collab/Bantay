import Dexie, { type Table } from 'dexie'
import type { Range, Reading } from '../health/ranges'

export interface Person {
  id: string
  name: string
}
export interface Consult {
  id?: number
  personId: string
  takenAt: string
  doctor?: string
  reason?: string
  medicines?: string[]
  nextVisit?: string
  sourceFileId?: string
  driveUrl?: string
}
export interface Threshold extends Range {
  key: string // `${personId}:${test}`
}

// Separate database so this lane does not touch the L0 outbox schema.
class HealthDB extends Dexie {
  people!: Table<Person, string>
  readings!: Table<Reading, number>
  consults!: Table<Consult, number>
  thresholds!: Table<Threshold, string>
  constructor() {
    super('bantay-health')
    this.version(1).stores({
      people: 'id',
      readings: '++id, personId, test, takenAt',
      consults: '++id, personId, takenAt',
      thresholds: 'key'
    })
  }
}
export const hdb = new HealthDB()

export async function loadAll() {
  const [people, readings, consults, thresholds] = await Promise.all([
    hdb.people.toArray(),
    hdb.readings.toArray(),
    hdb.consults.toArray(),
    hdb.thresholds.toArray()
  ])
  return { people, readings, consults, thresholds }
}
