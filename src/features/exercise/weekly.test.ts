import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SELF = vi.hoisted(() => ({ id: 'me' as string | null }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: () => Promise.resolve(SELF.id) }))

import { db } from '../../db'
import { ldb, type Activity } from '../log/store'
import { logMove } from './actions'
import { minutesOf, weekProgress } from './weekly'

const NOW = new Date(2026, 9, 21, 12, 0)
const row = (kind: string, minutes: number | null, daysAgo: number, h = 9): Activity => ({ personId: 'me', kind, minutes, steps: null, startedAt: new Date(2026, 9, 21 - daysAgo, h).toISOString(), source: 'manual' })

describe('weekly ring maths', () => {
  it('adds walk and move minutes from the last 7 days, and counts distinct strength or balance days', () => {
    const w = weekProgress([
      row('walk', 30, 1), row('ex:sit-to-stand', 2, 1), row('ex:tandem-stand', 1, 1, 18), // same day twice = one day
      row('ex:heel-raises', 2, 3), row('ex:slow-breathing', 2, 2), row('steps', 99, 1), row('mood-good', 5, 1)
    ], NOW)
    expect(w.minutes).toBe(37)
    expect(w.strengthDays).toBe(2)
    expect(w.pct).toBe(25)
    expect(w.doneIds).toEqual(['sit-to-stand', 'tandem-stand', 'heel-raises', 'slow-breathing'])
  })
  it('ignores rows older than a week, in the future, or with unknown minutes (null is not 0)', () => {
    const w = weekProgress([row('walk', 60, 9), row('walk', 20, -2), row('walk', null, 1), row('ex:heel-raises', Number.NaN, 1)], NOW)
    expect(w.minutes).toBe(0)
    expect(w.strengthDays).toBe(1) // the heel-raises day still counts as a strength day even if minutes are unknown
  })
  it('caps the percent and the day count at the goal', () => {
    const w = weekProgress([row('walk', 200, 1), row('ex:heel-raises', 2, 1), row('ex:sit-to-stand', 2, 2), row('ex:weight-shift', 2, 3)], NOW)
    expect(w.pct).toBe(100)
    expect(w.strengthDays).toBe(2)
    expect(w.minutes).toBe(206)
  })
  it('minutesOf rounds time up and counts a set of reps as about 2 minutes', () => {
    expect(minutesOf({ durationSec: 20 })).toBe(1)
    expect(minutesOf({ durationSec: 300 })).toBe(5)
    expect(minutesOf({})).toBe(2)
  })
})

describe('logging a move', () => {
  beforeEach(async () => { SELF.id = 'me'; await Promise.all([ldb.activity.clear(), db.outbox.clear()]) })
  it('writes one activity row of kind ex:<id> with its minutes, and queues it for sync', async () => {
    expect(await logMove({ id: 'walk-5', durationSec: 300 }, NOW)).toBe('ok')
    const rows = await ldb.activity.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ personId: 'me', kind: 'ex:walk-5', minutes: 5, steps: null, source: 'manual' })
    expect(new Date(rows[0]!.startedAt).getTime()).toBe(NOW.getTime() - 5 * 60_000)
    expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['activity'])
    expect(weekProgress(rows, NOW).minutes).toBe(5)
  })
  it('signed out writes nothing', async () => {
    SELF.id = null
    expect(await logMove({ id: 'walk-5', durationSec: 300 }, NOW)).toBe('signedout')
    expect(await ldb.activity.count()).toBe(0)
  })
})
