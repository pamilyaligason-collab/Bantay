import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetSyncForTests, startSync, syncNow } from './sync'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

// Official alerts pull (D-25). The server list replaces kv 'safety.alerts'; a failed fetch leaves it alone.
const cfg = { url: 'https://x.supabase.test', key: 'pk', getToken: async () => 'tok1' }
const ALERTS = 'safety.alerts'
const row = {
  id: 'usgs-x1', kind: 'quake', level: 'Magnitude 5.1', title: 'M 5.1 - Ormoc', what: 'Magnitude 5.1 earthquake.', where_text: 'Ormoc', when_text: '2026-10-17 18:13 PH time',
  do_now: 'Drop, cover and hold on.', source: 'USGS', source_url: 'https://example.test/q', issued_at: '2026-10-17T10:13:20+00:00', lat: 11, lon: null,
  bulletin: 'B2', previous_bulletin: 'B1', checklist: null, timeline: null, fetched_at: '2026-10-17T12:00:00+00:00', expires_at: null, stale: true
}

let urls: string[]
function mockFetch(handler: (url: string) => Response) {
  urls = []
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url)
    return handler(url)
  })
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const isAlerts = (u: string) => u.includes('/safety_alerts?')

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), hdb.readings.clear(), hdb.consults.clear(), ldb.meds.clear(), ldb.activity.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('alerts pull', () => {
  it('replaces the kv list with the mapped alerts (camelCase, unknown stays null) and asks only for active rows', async () => {
    await db.kv.put({ key: ALERTS, value: [{ id: 'old' }] })
    mockFetch((u) => (isAlerts(u) ? json([row]) : json([])))
    startSync(cfg)()
    await syncNow()
    expect((await db.kv.get(ALERTS))?.value).toEqual([{
      id: 'usgs-x1', kind: 'quake', level: 'Magnitude 5.1', title: 'M 5.1 - Ormoc', what: 'Magnitude 5.1 earthquake.', where: 'Ormoc', when: '2026-10-17 18:13 PH time',
      doNow: 'Drop, cover and hold on.', source: 'USGS', sourceUrl: 'https://example.test/q', issuedAt: '2026-10-17T10:13:20.000Z', lat: 11, lon: null,
      bulletin: 'B2', previousBulletin: 'B1', checklist: undefined, timeline: undefined, stale: true, checkedAt: '2026-10-17T12:00:00.000Z'
    }])
    expect(decodeURIComponent(urls.find(isAlerts)!)).toMatch(/or=\(expires_at\.is\.null,expires_at\.gt\.\d{4}-\d\d-\d\dT/)
  })

  it('an empty server list clears the kv list', async () => {
    await db.kv.put({ key: ALERTS, value: [{ id: 'old' }] })
    mockFetch(() => json([]))
    startSync(cfg)()
    await syncNow()
    expect((await db.kv.get(ALERTS))?.value).toEqual([])
  })

  it.each([[500], [404]])('a failed fetch (HTTP %i) keeps the kv list and does not put sync into backoff', async (status) => {
    const keep = [{ id: 'keep' }]
    await db.kv.put({ key: ALERTS, value: keep })
    mockFetch((u) => (isAlerts(u) ? json({ code: 'X' }, status) : json([])))
    startSync(cfg)()
    await syncNow()
    expect((await db.kv.get(ALERTS))?.value).toEqual(keep)
    expect(await db.kv.get('sync.backoff')).toBeUndefined()
  })

  it('a lost network keeps the kv list and backs off like any other pull', async () => {
    const keep = [{ id: 'keep' }]
    await db.kv.put({ key: ALERTS, value: keep })
    mockFetch((u) => {
      if (isAlerts(u)) throw new TypeError('offline')
      return json([])
    })
    startSync(cfg)()
    await syncNow()
    expect((await db.kv.get(ALERTS))?.value).toEqual(keep)
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 1 })
  })

  it('skips malformed rows instead of failing', async () => {
    mockFetch((u) => (isAlerts(u) ? json([{ id: 'a' }, { ...row, id: 'bad-date', issued_at: 'not a date' }, row]) : json([])))
    startSync(cfg)()
    await syncNow()
    expect(((await db.kv.get(ALERTS))?.value as { id: string }[]).map((a) => a.id)).toEqual(['usgs-x1'])
  })
})
