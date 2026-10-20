import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Session 6 lane T: the shared log functions are the one place each habit event is sent from (PART-2 section 4).
const track = vi.hoisted(() => vi.fn(async (_kind: string, _name: string) => true))
vi.mock('../admin/events', () => ({ track }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => 'p1' }))

import { logActivity, logMedTaken, logReading } from './store'
import { checkIn } from '../today/actions'

describe('habit events', () => {
  beforeEach(() => track.mockClear())
  it('a dose sends dose_logged once', async () => {
    await logMedTaken({ personId: 'p', name: 'Test med', takenAt: '2026-01-01T08:00:00Z' })
    expect(track.mock.calls).toEqual([['action', 'dose_logged']])
  })
  it('a reading sends reading_added once', async () => {
    await logReading({ personId: 'p', takenAt: '2026-01-01', test: 't', value: 1 })
    expect(track.mock.calls).toEqual([['action', 'reading_added']])
  })
  it('an activity sends nothing by itself; I am OK sends checkin_done once', async () => {
    await logActivity({ personId: 'p', kind: 'walk', minutes: 20, steps: null, startedAt: '2026-01-01T06:00:00Z', source: 'manual' })
    expect(track).not.toHaveBeenCalled()
    expect(await checkIn()).toBe('ok')
    expect(track.mock.calls).toEqual([['action', 'checkin_done']])
  })
  it('no event payload carries a value: only kind and name are passed', () => {
    for (const c of track.mock.calls) expect(c).toHaveLength(2)
  })
})
