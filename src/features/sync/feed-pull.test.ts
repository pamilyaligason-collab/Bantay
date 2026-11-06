import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { LAST_PULL_KEY, resetSyncForTests, startSync, syncNow } from './sync'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

// Family feed pull (D-134): the server list replaces the local table whole; a database without 0050 shows the empty state and no sync error.
const cfg = { url: 'https://x.supabase.test', key: 'pk', getToken: async () => 'tok1' }
const NOW = Date.parse('2026-11-06T04:00:00Z')
const bp = { kind: 'bp', person_id: 'p-ana', at: '2026-11-05T23:10:00+00:00', title_key: 'feed.bp', value_text: '148/90 mmHg', chip: null, photo_path: null, row_id: 'r1' }
const lab = { kind: 'lab', person_id: 'p-ben', at: '2026-11-05T01:00:00+00:00', title_key: 'feed.lab', value_text: 'Cholesterol 210 mg/dL', chip: 'H', photo_path: null, row_id: 'l1' }
const held = { id: 'bp|r1', kind: 'bp' as const, personId: 'p-ana', at: '2026-11-05T00:00:00.000Z', titleKey: '', valueText: '148/90 mmHg', chip: null, photoPath: null, rowId: 'r1' }

let urls: { url: string; method: string; body?: string }[]
function mockFetch(handler: (url: string) => Response) {
  urls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    urls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined })
    return handler(url)
  })
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const isFeed = (u: string) => u.includes('/rpc/family_feed')

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  await Promise.all([db.outbox.clear(), db.kv.clear(), db.feed.clear(), hdb.readings.clear(), hdb.consults.clear(), ldb.meds.clear(), ldb.activity.clear()])
  resetSyncForTests()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('feed pull', () => {
  it('asks for the last 30 days by POST, keys each row kind|row_id, and replaces the whole table', async () => {
    await db.feed.put({ ...held, id: 'bp|old', rowId: 'old' })
    mockFetch((u) => (isFeed(u) ? json([bp, lab, { ...bp, kind: 'weird', row_id: 'x' }, { ...bp, row_id: 7 }]) : json([])))
    startSync(cfg)()
    await syncNow()
    const call = urls.find((c) => isFeed(c.url))!
    expect(call.method).toBe('POST')
    expect(JSON.parse(call.body!)).toEqual({ p_since: '2026-10-07T04:00:00.000Z' })
    const rows = await db.feed.toArray()
    expect(rows.map((r) => r.id).sort()).toEqual(['bp|r1', 'lab|l1'])
    expect(rows.find((r) => r.id === 'lab|l1')).toMatchObject({ personId: 'p-ben', at: '2026-11-05T01:00:00.000Z', valueText: 'Cholesterol 210 mg/dL', chip: 'H' })
  })
  it('an empty answer clears the table (a stop-share leaves every phone)', async () => {
    await db.feed.put(held)
    mockFetch(() => json([]))
    startSync(cfg)()
    await syncNow()
    expect(await db.feed.count()).toBe(0)
  })
  it('without migration 0050 (function missing) the feed is empty and sync reports no error', async () => {
    await db.feed.put(held)
    mockFetch((u) => (isFeed(u) ? json({ code: 'PGRST202' }, 404) : json([])))
    startSync(cfg)()
    await syncNow()
    expect(await db.feed.count()).toBe(0)
    expect((await db.kv.get('sync.backoff'))?.value).toBeUndefined()
    expect((await db.kv.get(LAST_PULL_KEY))?.value).toBeTruthy()
  })
  it('a server error leaves the feed as it was and does not put sync into backoff', async () => {
    await db.feed.put(held)
    mockFetch((u) => (isFeed(u) ? json({ code: '42501' }, 403) : json([])))
    startSync(cfg)()
    await syncNow()
    expect(await db.feed.count()).toBe(1)
    expect((await db.kv.get('sync.backoff'))?.value).toBeUndefined()
  })
})
