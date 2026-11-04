import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetSyncForTests, startSync, syncNow } from './sync'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

// R1: the "checked" stamp is the server's newest fetched_at, never this phone's clock. A stopped ingest must not read as a fresh check.
const cfg = { url: 'https://x.supabase.test', key: 'pk', getToken: async () => 'tok1' }
const CHECKED = 'alerts:checkedAt'
const DAY = 86_400_000
const row = {
  id: 'usgs-x1', kind: 'quake', level: 'Magnitude 5.1', title: 'M 5.1 - Ormoc', what: 'x', where_text: 'Ormoc', when_text: 'x', do_now: 'x', source: 'USGS',
  source_url: null, issued_at: '2026-10-17T10:13:20+00:00', lat: 11, lon: 124, bulletin: 'B', previous_bulletin: null, fetched_at: '2026-10-17T12:00:00+00:00', stale: false
}
let urls: string[]
function mockFetch(handler: (url: string) => Response) {
  urls = []
  vi.stubGlobal('fetch', async (url: string) => { urls.push(url); return handler(url) })
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const isStamp = (u: string) => decodeURIComponent(u).includes('select=source,fetched_at,stale')
const isAlerts = (u: string) => u.includes('/safety_alerts?')

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), hdb.readings.clear(), hdb.consults.clear(), ldb.meds.clear(), ldb.activity.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('alerts checked stamp', () => {
  it('stopped ingest: the phone pulls now, the newest fetched_at is 10 days old -> that is the stamp', async () => {
    const old = new Date(Date.now() - 10 * DAY).toISOString()
    mockFetch((u) => (isStamp(u) ? json([{ fetched_at: old }]) : isAlerts(u) ? json([{ ...row, fetched_at: old }]) : json([])))
    startSync(cfg)()
    await syncNow()
    expect(decodeURIComponent(urls.find(isStamp)!)).toContain('order=fetched_at.desc')
    expect((await db.kv.get(CHECKED))?.value).toBe(old)
  })
  it('healthy ingest with 0 unexpired rows: the newest stamp (an expired air row) is the check', async () => {
    const recent = new Date(Date.now() - 4 * 60_000).toISOString()
    mockFetch((u) => (isStamp(u) ? json([{ fetched_at: recent }]) : json([])))
    startSync(cfg)()
    await syncNow()
    expect((await db.kv.get(CHECKED))?.value).toBe(recent)
  })
  it('a failed stamp read leaves the stored stamp alone', async () => {
    await db.kv.put({ key: CHECKED, value: '2026-10-01T00:00:00.000Z' })
    mockFetch((u) => (isStamp(u) ? json({ code: 'X' }, 500) : isAlerts(u) ? json([row]) : json([])))
    startSync(cfg)()
    await syncNow()
    expect((await db.kv.get(CHECKED))?.value).toBe('2026-10-01T00:00:00.000Z')
  })
  it('keeps the newest alert and cyclone row seen, even after they expire (Last event, Last storm)', async () => {
    const quake = { ...row, id: 'usgs-q', issued_at: '2026-10-30T00:00:00Z' }
    const tc = { ...row, id: 'gdacs-TC-9', kind: 'gdacs', source: 'GDACS', issued_at: '2026-10-29T00:00:00Z', lat: 14, lon: 130 }
    mockFetch((u) => (isStamp(u) ? json([]) : isAlerts(u) ? json([quake, tc]) : json([])))
    startSync(cfg)()
    await syncNow()
    mockFetch((u) => (isAlerts(u) ? json([]) : json([]))) // both expired: the next pull returns nothing
    await syncNow()
    const last = (await db.kv.get('alerts:lastSeen'))?.value as { id: string }[]
    expect(last.map((a) => a.id).sort()).toEqual(['gdacs-TC-9', 'usgs-q'])
    expect((await db.kv.get('safety.alerts'))?.value).toEqual([])
  })
})
