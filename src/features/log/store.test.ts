import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../db'
import { hdb } from '../records/store'
import { ldb, logActivity, logDose, logMedTaken, logReading } from './store'

describe('log store', () => {
  it('stores locally and queues one outbox row per log', async () => {
    await db.outbox.clear()
    await logReading({ personId: 'p', takenAt: '2026-01-01', test: 't', value: 1 })
    await logMedTaken({ personId: 'p', name: 'Test med', takenAt: '2026-01-01T08:00:00Z' })
    await logActivity({ personId: 'p', kind: 'walk', minutes: 20, steps: null, startedAt: '2026-01-01T06:00:00Z', source: 'manual' })
    expect(await hdb.readings.count()).toBe(1)
    expect(await ldb.meds.count()).toBe(1)
    expect(await ldb.activity.count()).toBe(1)
    expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['readings', 'meds_taken', 'activity'])
  })
})

describe('medications table and dose logging (v2)', () => {
  it('logDose carries the medication id and slot; a skip is a synced row', async () => {
    await db.outbox.clear()
    await logDose({ personId: 'p', name: 'Test med', serverId: 'srv-1' }, '08:00', { at: new Date('2026-01-01T08:00:00Z') })
    await logDose({ personId: 'p', name: 'Test med', serverId: 'srv-1' }, '20:00', { skipped: true, at: new Date('2026-01-01T20:00:00Z') })
    const rows = (await db.outbox.toArray()).filter((r) => r.table === 'meds_taken').map((r) => r.payload as Record<string, unknown>)
    expect(rows[0]).toMatchObject({ medicationId: 'srv-1', slot: '08:00' })
    expect(rows[0]).not.toHaveProperty('skipped')
    expect(rows[1]).toMatchObject({ medicationId: 'srv-1', slot: '20:00', skipped: true })
  })
  it('the old logMedTaken(m) call still works with no medication', async () => {
    const id = await logMedTaken({ personId: 'p', name: 'Plain', takenAt: '2026-01-02T08:00:00Z' })
    expect((await ldb.meds.get(id))?.medicationId).toBeUndefined()
  })
  it('stores medications keyed by clientId (unique)', async () => {
    await ldb.medications.clear()
    await ldb.medications.add({ clientId: 'c1', personId: 'p', name: 'A' })
    await expect(ldb.medications.add({ clientId: 'c1', personId: 'p', name: 'B' })).rejects.toThrow()
  })
  it('upgrading from version 1 keeps meds and activity', async () => {
    const Dexie = (await import('dexie')).default
    const name = 'bantay-log-upgrade-test'
    await Dexie.delete(name)
    const v1 = new Dexie(name)
    v1.version(1).stores({ meds: '++id, personId, takenAt', activity: '++id, personId, startedAt, source' })
    await v1.open()
    await v1.table('meds').add({ personId: 'p', name: 'Old', takenAt: '2026-01-01T00:00:00Z' })
    await v1.table('activity').add({ personId: 'p', kind: 'walk', minutes: 5, steps: null, startedAt: '2026-01-01T00:00:00Z', source: 'manual' })
    v1.close()
    const v2 = new Dexie(name)
    v2.version(1).stores({ meds: '++id, personId, takenAt', activity: '++id, personId, startedAt, source' })
    v2.version(2).stores({ meds: '++id, personId, takenAt, medicationId', activity: '++id, personId, startedAt, source', medications: '++id, &clientId, personId' })
    await v2.open()
    expect(await v2.table('meds').count()).toBe(1)
    expect(await v2.table('activity').count()).toBe(1)
    expect(await v2.table('medications').count()).toBe(0)
    v2.close()
    await Dexie.delete(name)
  })
})
