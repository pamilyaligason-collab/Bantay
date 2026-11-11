import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { stepSeries } from '../family/weekSeries'
import { stepDayTotals } from '../health/model'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { disableType, enableType, getState, STATE_KEY, syncAll, type HealthBridge, type RawSample } from './health'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u', personId: 'me-p', role: 'member', handle: null }), getAccessToken: async () => null }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const H = 3_600_000
const T0 = Date.parse('2026-10-01T06:00:00.000Z')
const at = (ms: number) => new Date(T0 + ms).toISOString()
const hour = (i: number, value: number): RawSample => ({ startDate: at(i * H), endDate: at((i + 1) * H), value })
const walk = (sourceId: string, offsetSec: number): RawSample[] =>
  [0, 1, 2].map((i) => ({ startDate: at(i * 600_000 + offsetSec * 1000), endDate: at(i * 600_000 + 540_000 + offsetSec * 1000), value: 3000, sourceId }))
const rows = async () => (await ldb.activity.toArray()).filter((a) => a.kind === 'steps')
const shape = async () => (await rows()).map((r) => [r.startedAt, r.minutes, r.steps]).sort()

function bridge(over: Partial<HealthBridge> = {}): HealthBridge {
  return { platform: 'android', isAvailable: async () => true, request: async () => true, granted: async () => true, read: async () => [], ...over } as HealthBridge
}
const enable = (cursor?: string) => db.kv.put({ key: STATE_KEY, value: { enabled: ['steps'], cursor: cursor ? { steps: cursor } : {} } })

beforeEach(async () => {
  await Promise.all([db.kv.clear(), db.outbox.clear(), ldb.activity.clear(), hdb.readings.clear()])
})

describe('steps written by two apps', () => {
  it('aggregate: Health Connect already counted the walk once, one hourly row', async () => {
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 9000)] }))
    expect(await shape()).toEqual([[at(0), 60, 9000]])
  })
  it('raw fallback: two origins for the same walk count once, as one hourly row', async () => {
    await enable()
    await syncAll(bridge({ readSteps: async () => null, read: async () => [...walk('app.a', 0), ...walk('app.b', 30)] }))
    expect(await shape()).toEqual([[at(0), 60, 9000]])
  })
  it('raw fallback keeps the larger origin of each hour, never a sum, and is the same on a re-read', async () => {
    await enable()
    const raw = [...walk('app.a', 0).slice(0, 2), ...walk('app.b', 30)]
    await syncAll(bridge({ readSteps: async () => null, read: async () => raw }))
    await syncAll(bridge({ readSteps: async () => null, read: async () => raw }))
    expect(await shape()).toEqual([[at(0), 60, 9000]])
    expect((await db.outbox.toArray()).map((o) => o.op)).toEqual(['insert'])
  })
  it('raw fallback picks the winner per hour, so a second hour can belong to the other app', async () => {
    await enable()
    const h1 = (id: string, v: number): RawSample => ({ startDate: at(H + 60_000), endDate: at(H + 120_000), value: v, sourceId: id })
    await syncAll(bridge({ readSteps: async () => null, read: async () => [...walk('app.a', 0), h1('app.a', 100), h1('app.b', 700)] }))
    expect(await shape()).toEqual([[at(0), 60, 9000], [at(H), 60, 700]])
  })
})

describe('one row shape', () => {
  it('the running hour is not stored, a finished one is', async () => {
    await enable()
    const now = Math.floor(Date.now() / H) * H
    const cur = { startDate: new Date(now).toISOString(), endDate: new Date(now + H).toISOString(), value: 321 }
    const prev = { startDate: new Date(now - H).toISOString(), endDate: new Date(now).toISOString(), value: 654 }
    await syncAll(bridge({ readSteps: async () => [cur, prev] }))
    expect(await shape()).toEqual([[prev.startDate, 60, 654]])
    await syncAll(bridge({ readSteps: async () => null, read: async () => [{ startDate: new Date(now + 60_000).toISOString(), endDate: new Date(now + 120_000).toISOString(), value: 5, sourceId: 'a' }] }))
    expect((await rows()).length).toBe(1)
  })
  it('an hour revised 500 to 800 stays one row and queues the new total', async () => {
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 500)] }))
    await syncAll(bridge({ readSteps: async () => [hour(0, 800)] }))
    expect(await shape()).toEqual([[at(0), 60, 800]])
    expect((await db.outbox.toArray()).map((o) => o.op)).toEqual(['insert', 'update'])
    await syncAll(bridge({ readSteps: async () => [hour(0, 800)] }))
    expect(await db.outbox.count()).toBe(2)
  })
  it('fallback then aggregate (and back) update the same rows, never a second set', async () => {
    await enable()
    const raw = [...walk('app.a', 0)]
    await syncAll(bridge({ readSteps: async () => null, read: async () => raw }))
    await syncAll(bridge({ readSteps: async () => [hour(0, 9500)] }))
    expect(await shape()).toEqual([[at(0), 60, 9500]])
    await syncAll(bridge({ readSteps: async () => null, read: async () => raw })) // totals only rise
    expect(await shape()).toEqual([[at(0), 60, 9500]])
  })
  it('another person\'s rows are never touched', async () => {
    await enable()
    await ldb.activity.add({ personId: 'carer-p', kind: 'steps', minutes: 60, steps: 1234, startedAt: at(0), source: 'health-connect' })
    await syncAll(bridge({ readSteps: async () => [hour(0, 800)] }))
    const all = await ldb.activity.toArray()
    expect(all.map((r) => [r.personId, r.steps]).sort()).toEqual([['carer-p', 1234], ['me-p', 800]])
  })
})

describe('failures are not the same as "not available"', () => {
  it('an aggregate that times out with hourly rows stored: error, nothing new, cursor kept, raw never read', async () => {
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 500)] }))
    const cursor = (await getState()).cursor.steps
    const read = vi.fn(async () => walk('app.a', 0))
    const res = await syncAll(bridge({ readSteps: async () => { throw new Error('Health Connect did not answer in 10 s') }, read }))
    expect(res.byType.steps).toBe('error')
    expect(read).not.toHaveBeenCalled()
    expect(await shape()).toEqual([[at(0), 60, 500]])
    expect((await getState()).cursor.steps).toBe(cursor)
  })
  it('an unavailable aggregate falls back and writes the same hourly shape', async () => {
    await enable()
    const res = await syncAll(bridge({ readSteps: async () => null, read: async () => walk('app.a', 0) }))
    expect(res.byType.steps).toBe('ok')
    expect(await shape()).toEqual([[at(0), 60, 9000]])
  })
})

describe('cursor', () => {
  it('never moves back when the read stops short of the old cursor', async () => {
    const cursor = at(100 * H)
    await db.kv.put({ key: STATE_KEY, value: { enabled: ['heartRate'], cursor: { heartRate: cursor } } })
    await syncAll(bridge({ read: async () => [{ startDate: at(0), endDate: at(60_000), value: 70 }] }))
    expect((await getState()).cursor.heartRate).toBe(cursor)
  })
})

describe('old per-sample rows are ignored at read', () => {
  const old = { personId: 'me-p', kind: 'steps', minutes: 9, steps: 3000, source: 'health-connect' as const }
  const sum = (r: { steps: number | null }[]) => r.reduce((n, a) => n + (a.steps ?? 0), 0)
  it('day total is the hourly rows only, through the store, a filtered query and the family chart', async () => {
    await ldb.activity.bulkAdd([{ ...old, startedAt: at(1) }, { ...old, startedAt: at(2) }, { ...old, source: 'healthkit', startedAt: at(3) }, { ...old, minutes: 60, steps: 4000, startedAt: at(0) }, { ...old, source: 'manual', startedAt: at(4) }])
    expect(sum(await ldb.activity.toArray())).toBe(7000) // 4000 hourly + 3000 manual
    expect(sum(await ldb.activity.where('personId').equals('me-p').filter((a) => a.startedAt >= at(0)).toArray())).toBe(7000)
    expect(sum(await ldb.activity.where('startedAt').aboveOrEqual(at(0)).toArray())).toBe(7000)
    // the family chart reads the day through stepDayTotals (L2 round 3): per source, then the source with the most steps, never the sum of two sources. Hand count:
    //   health-connect: the hourly row 4000 over 06:00-07:00; the two 3000 rows 1 ms and 2 ms in sit inside that span and add nothing = 4000
    //   healthkit: one standalone zero-length row = 3000;  manual: one standalone zero-length row = 3000
    //   day = max(4000, 3000, 3000) = 4000. The raw-table sums above (7000) are not a day total, they only prove the rows are still stored.
    expect(stepSeries(await ldb.activity.toArray(), ['me-p'], new Date(T0 + 6 * H))[0].latest).toBe(4000)
  })
  it('hand values: a manual entry is its own source and is not added to a device total; without the hourly row the two per-sample rows count', () => {
    const row = (steps: number, source: string, startedAt: string, minutes: number | null = null) => ({ kind: 'steps', steps, source, startedAt, minutes })
    const total = (rows: ReturnType<typeof row>[]) => [...stepDayTotals(rows).values()].reduce((a, b) => a + b, 0) // all rows sit between 12:00 and 15:00 UTC: one local day in every zone from UTC-12 to UTC+8
    // 4000 on the watch + 3000 typed by hand: the larger source, 4000 (a watch and a phone count the same walk; a hand entry is judged the same way)
    expect(total([row(4000, 'health-connect', '2026-10-01T12:00:00.000Z', 60), row(3000, 'manual', '2026-10-01T14:00:00.000Z')])).toBe(4000)
    // a hand entry alone is the day
    expect(total([row(3000, 'manual', '2026-10-01T14:00:00.000Z')])).toBe(3000)
    // old per-sample rows with no hourly row: both stand-alone rows (1 ms apart, different instants) count, 3000 + 3000
    expect(total([row(3000, 'health-connect', '2026-10-01T12:00:00.001Z'), row(3000, 'health-connect', '2026-10-01T12:00:00.002Z')])).toBe(6000)
    // an exact repeat of one standalone row counts once
    expect(total([row(3000, 'manual', '2026-10-01T14:00:00.000Z'), row(3000, 'manual', '2026-10-01T14:00:00.000Z')])).toBe(3000)
    // two hourly rows that overlap by half an hour: 4000 + the not-yet-covered half of the second (2000 of 4000) = 6000
    expect(total([row(4000, 'health-connect', '2026-10-01T12:00:00.000Z', 60), row(4000, 'health-connect', '2026-10-01T12:30:00.000Z', 60)])).toBe(6000)
  })
  it('the old shape stays in the table and sync adds the hourly row beside it', async () => {
    const id = await ldb.activity.add({ ...old, startedAt: at(0) })
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 800)] }))
    expect(await ldb.activity.count()).toBe(2)
    expect((await ldb.activity.get(id))?.steps).toBeNull() // read as nothing
    expect(sum(await rows())).toBe(800)
  })
})

describe('rebuild of hidden days, once per phone and person', () => {
  const NOW = Date.parse('2026-10-20T10:30:00.000Z')
  const NOW_H = Date.parse('2026-10-20T10:00:00.000Z')
  const D = 24 * H
  const MARK = 'sensors.stepsRebuilt.me-p'
  const iso = (ms: number) => new Date(ms).toISOString()
  const oldRow = (ms: number, personId = 'me-p') => ({ personId, kind: 'steps', minutes: 9, steps: 3000, startedAt: iso(ms), source: 'health-connect' as const })
  const hourAt = (ms: number, value: number): RawSample => ({ startDate: iso(ms), endDate: iso(ms + H), value })
  const sum = (r: { steps: number | null }[]) => r.reduce((n, a) => n + (a.steps ?? 0), 0)
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it('a recent cursor with old rows 6 days back: the read starts at the oldest hidden hour, those days come back, the next read is the normal window', async () => {
    const oldest = NOW_H - 6 * D + 17 * 60_000
    await ldb.activity.bulkAdd([oldRow(oldest), oldRow(oldest + D)])
    await enable(iso(NOW_H - H))
    const seen: string[] = []
    const b = bridge({ readSteps: async (since) => { seen.push(since); return [hourAt(NOW_H - 6 * D, 4000), hourAt(NOW_H - 5 * D, 5000)] } })
    await syncAll(b)
    expect(seen).toEqual([iso(NOW_H - 6 * D)])
    expect(sum(await rows())).toBe(9000)
    expect(await ldb.activity.count()).toBe(4) // the old rows stay, hidden
    expect((await db.kv.get(MARK))?.value).toBeTruthy()
    await syncAll(b)
    expect(seen[1]).toBe(iso(NOW_H - H - 48 * H))
  })
  it('is capped at 30 days back', async () => {
    await ldb.activity.add(oldRow(NOW - 45 * D))
    await enable(iso(NOW_H - H))
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async (since) => { seen.push(since); return [] } }))
    expect(seen).toEqual([iso(NOW_H - 30 * D)])
  })
  it('a hidden row inside the read window does not widen it', async () => {
    await ldb.activity.add(oldRow(NOW_H - 3 * H + 60_000))
    await enable(iso(NOW_H - H))
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async (since) => { seen.push(since); return [] } }))
    expect(seen).toEqual([iso(NOW_H - 49 * H)])
  })
  it('another person\'s hidden rows do not widen the read or use up this person\'s rebuild', async () => {
    await ldb.activity.add(oldRow(NOW - 20 * D, 'carer-p'))
    await enable(iso(NOW_H - H))
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async (since) => { seen.push(since); return [] } }))
    expect(seen).toEqual([iso(NOW_H - 49 * H)])
    expect(await db.kv.get(MARK)).toBeUndefined()
  })
  it('the done marker survives a sensor being dropped, so a fresh enable backfills 7 days, not the rebuild again', async () => {
    await ldb.activity.add(oldRow(NOW - 20 * D))
    await enable(iso(NOW_H - H))
    const seen: string[] = []
    const b = bridge({ readSteps: async (since) => { seen.push(since); return [] } })
    await syncAll(b)
    expect(seen[0]).toBe(iso(Math.floor((NOW - 20 * D) / H) * H))
    await disableType('steps')
    await enableType('steps', b)
    await syncAll(b)
    expect(seen[1]).toBe(iso(Math.floor((NOW - 7 * D) / H) * H))
  })
  it('a failed read leaves the marker unset, nothing stored, and the next sync rebuilds', async () => {
    await ldb.activity.add(oldRow(NOW - 6 * D))
    await enable(iso(NOW_H - H))
    const res = await syncAll(bridge({ readSteps: async () => { throw new Error('Health Connect did not answer in 10 s') } }))
    expect(res.byType.steps).toBe('error')
    expect(await db.kv.get(MARK)).toBeUndefined()
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async (since) => { seen.push(since); return [hourAt(NOW_H - 6 * D, 4000)] } }))
    expect(seen).toEqual([iso(Math.floor((NOW - 6 * D) / H) * H)])
    expect((await db.kv.get(MARK))?.value).toBeTruthy()
  })
  it('a rebuild window too long for the phone does not stop today\'s steps: normal window stored, marker unset, tried again', async () => {
    await ldb.activity.add(oldRow(NOW - 6 * D))
    await enable(iso(NOW_H - H))
    const wide = iso(Math.floor((NOW - 6 * D) / H) * H)
    const res = await syncAll(bridge({ readSteps: async (since) => { if (since === wide) throw new Error('Health Connect did not answer in 10 s'); return [hourAt(NOW_H - H, 700)] } }))
    expect(res.byType.steps).toBe('ok')
    expect(sum(await rows())).toBe(700)
    expect(await db.kv.get(MARK)).toBeUndefined()
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async (since) => { seen.push(since); return [] } }))
    expect(seen).toEqual([wide])
  })
  it('no steps permission: no read, marker stays unset; allowed later, it rebuilds', async () => {
    await ldb.activity.add(oldRow(NOW - 10 * D))
    await enable(iso(NOW_H - H))
    const readSteps = vi.fn(async () => [])
    const res = await syncAll(bridge({ granted: async () => false, readSteps }))
    expect(res.byType.steps).toBe('revoked')
    expect(readSteps).not.toHaveBeenCalled()
    expect(await db.kv.get(MARK)).toBeUndefined()
    await enableType('steps', bridge())
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async (since) => { seen.push(since); return [] } }))
    expect(seen).toEqual([iso(Math.floor((NOW - 10 * D) / H) * H)])
    expect((await db.kv.get(MARK))?.value).toBeTruthy()
  })
  it('no hidden rows yet: no marker, so old rows a first pull brings later still get their rebuild', async () => {
    await enable(iso(NOW_H - H))
    await syncAll(bridge({ readSteps: async () => [] }))
    expect(await db.kv.get(MARK)).toBeUndefined()
    await ldb.activity.add(oldRow(NOW - 6 * D))
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async (since) => { seen.push(since); return [] } }))
    expect(seen).toEqual([iso(Math.floor((NOW - 6 * D) / H) * H)])
  })
})

describe('old or new: 60 minutes alone does not make a row new', () => {
  const base = { personId: 'me-p', kind: 'steps', source: 'health-connect' as const }
  it('an old 60-minute row off the clock hour is hidden, the day total is the hourly row', async () => {
    await ldb.activity.add({ ...base, minutes: 60, steps: 4000, startedAt: '2026-10-01T06:17:00.000Z' })
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 4000)] }))
    expect((await rows()).reduce((n, a) => n + (a.steps ?? 0), 0)).toBe(4000)
    expect(await ldb.activity.count()).toBe(2)
  })
  it('an old row on the hour with 60 minutes counts as the hourly row and is revised in place', async () => {
    const id = await ldb.activity.add({ ...base, minutes: 60, steps: 3000, startedAt: at(0), clientId: 'c-old' } as never)
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 3500)] }))
    expect(await shape()).toEqual([[at(0), 60, 3500]])
    expect((await ldb.activity.get(id))?.steps).toBe(3500)
    expect((await db.outbox.toArray()).map((o) => o.op)).toEqual(['update'])
  })
})

describe('an hour read after it was pulled from this person\'s other phone', () => {
  const pulled = (steps: number) => ({ personId: 'me-p', kind: 'steps', minutes: 60, steps, source: 'health-connect' as const, startedAt: '2026-10-01T06:00:00+00:00', clientId: 'c-a' })
  it('the server writes +00:00 and the phone Z: still one row for the hour', async () => {
    await ldb.activity.add(pulled(100) as never)
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 500)] }))
    const r = await rows()
    expect(r.map((x) => x.steps)).toEqual([500])
    expect((await db.outbox.toArray()).map((o) => o.op)).toEqual(['update'])
  })
  it('a lower number from this phone never replaces the larger total', async () => {
    await ldb.activity.add(pulled(4000) as never)
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 12)] }))
    expect((await rows()).map((x) => x.steps)).toEqual([4000])
    expect(await db.outbox.count()).toBe(0)
  })
  it('an hour revised down locally stays at its larger total and queues nothing', async () => {
    await enable()
    await syncAll(bridge({ readSteps: async () => [hour(0, 800)] }))
    await syncAll(bridge({ readSteps: async () => [hour(0, 500)] }))
    expect(await shape()).toEqual([[at(0), 60, 800]])
    expect((await db.outbox.toArray()).map((o) => o.op)).toEqual(['insert'])
  })
})

describe('raw fallback window', () => {
  it('starts on the hour, so the oldest hour is summed whole, not from part of its samples', async () => {
    const samples = [0, 15, 30, 45].map((m) => ({ startDate: at(m * 60_000), endDate: at(m * 60_000 + 60_000), value: 750, sourceId: 'a' }))
    const seen: string[] = []
    await enable(at(48 * H + 45 * 60_000)) // cursor - 48 h lands at minute 45
    await syncAll(bridge({ readSteps: async () => null, read: async (_t, since) => { seen.push(since); return samples.filter((s) => s.startDate >= since) } }))
    expect(seen).toEqual([at(0)])
    expect(await shape()).toEqual([[at(0), 60, 3000]])
  })
  it('a capped read continues on the next sync from the hour it stopped in; the partial hour rises to its full total', async () => {
    const stop = at(2 * H + 20 * 60_000)
    const first: RawSample = { startDate: at(2 * H), endDate: at(2 * H + 60_000), value: 100, sourceId: 'a' }
    const second: RawSample = { startDate: at(2 * H + 30 * 60_000), endDate: at(2 * H + 31 * 60_000), value: 900, sourceId: 'a' }
    await enable(at(100 * H))
    await syncAll(bridge({ readSteps: async () => null, read: async () => Object.assign([first], { more: stop }) }))
    expect(await shape()).toEqual([[at(2 * H), 60, 100]])
    const seen: string[] = []
    await syncAll(bridge({ readSteps: async () => null, read: async (_t, since) => { seen.push(since); return [first, second] } }))
    expect(seen).toEqual([at(2 * H)])
    expect(await shape()).toEqual([[at(2 * H), 60, 1000]])
    const third: string[] = []
    await syncAll(bridge({ readSteps: async () => null, read: async (_t, since) => { third.push(since); return [] } }))
    expect(third).toEqual([at(52 * H)]) // finished: back to the cursor window
  })
})

describe('cursor stays at or before now, for every type', () => {
  const NOW = Date.parse('2026-10-20T10:30:00.000Z')
  const iso = (ms: number) => new Date(ms).toISOString()
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })
  it.each(['sleep', 'heartRate', 'bloodPressure'] as const)('%s: a sample ending after now does not push the cursor past now', async (type) => {
    await db.kv.put({ key: STATE_KEY, value: { enabled: [type], cursor: {} } })
    await syncAll(bridge({ read: async () => [{ startDate: iso(NOW - H), endDate: iso(NOW + 5 * H), value: 70 }] }))
    expect((await getState()).cursor[type]).toBe(iso(NOW))
  })
  it('a stored cursor in the future reads as now: the read window is valid, and the cursor comes back to now', async () => {
    await db.kv.put({ key: STATE_KEY, value: { enabled: ['heartRate'], cursor: { heartRate: iso(NOW + 100 * H) } } })
    const seen: string[] = []
    await syncAll(bridge({ read: async (_t, since) => { seen.push(since); return [{ startDate: iso(NOW - H), endDate: iso(NOW - H + 60_000), value: 70 }] } }))
    expect(seen).toEqual([iso(NOW - 48 * H)])
    expect((await getState()).cursor.heartRate).toBe(iso(NOW))
  })
  it('a valid past cursor still never moves back', async () => {
    await db.kv.put({ key: STATE_KEY, value: { enabled: ['heartRate'], cursor: { heartRate: iso(NOW - H) } } })
    await syncAll(bridge({ read: async () => [{ startDate: iso(NOW - 40 * H), endDate: iso(NOW - 40 * H + 60_000), value: 70 }] }))
    expect((await getState()).cursor.heartRate).toBe(iso(NOW - H))
  })
})
