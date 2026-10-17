import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../db'
import { hdb } from '../records/store'
import { ldb, logActivity, logMedTaken, logReading } from './store'

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
