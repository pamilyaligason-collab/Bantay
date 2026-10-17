import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, drain, enqueue } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { backoffMinutes, DEAD_KEY, resetSyncForTests, syncCounts, startSync, syncNow, type DeadLetter } from './sync'
import { fromRow, isSyncable, naturalKey, TABLES, toRow } from './tables'

const URL = 'https://x.supabase.test'
const cfg = (token: string | null = 'tok1') => ({ url: URL, key: 'pk', getToken: async () => token })
const reading = { personId: 'p1', takenAt: '2026-10-01', test: 'ldl', value: 3.2, unit: 'mmol/L', labLow: null, labHigh: null }

type Call = { url: string; method: string; headers: Record<string, string>; body?: string }
let calls: Call[]
function mockFetch(handler: (c: Call) => Response | Promise<Response>) {
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body as string | undefined }
    calls.push(c)
    return handler(c)
  })
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const posts = () => calls.filter((c) => c.method === 'POST')
const clientIdOf = (r: unknown) => (r as { clientId?: string } | undefined)?.clientId

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), hdb.readings.clear(), hdb.consults.clear(), ldb.meds.clear(), ldb.activity.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('mapping and allowlist', () => {
  it('maps camelCase to snake_case columns, adds client_id, keeps unknown as null, drops stray fields', () => {
    const row = toRow('readings', { ...reading, id: 7, junk: 1, confidence: undefined }, 'cid')
    expect(row).toEqual({ person_id: 'p1', taken_at: '2026-10-01', test: 'ldl', value: 3.2, unit: 'mmol/L', lab_low: null, lab_high: null, client_id: 'cid' })
  })
  it('activity keeps null minutes and steps (never 0)', () => {
    const row = toRow('activity', { personId: 'p', kind: 'walk', minutes: null, steps: null, startedAt: 't', source: 'manual' }, 'c')
    expect(row.minutes).toBeNull()
    expect(row.steps).toBeNull()
  })
  it('flattens a push subscription and keys it by endpoint, without client_id', () => {
    const row = toRow('push_subscriptions', { endpoint: 'https://p/1', expirationTime: null, keys: { p256dh: 'a', auth: 'b' } }, 'c')
    expect(row).toEqual({ endpoint: 'https://p/1', expiration_time: null, p256dh: 'a', auth: 'b' })
    expect(TABLES.push_subscriptions.onConflict).toBe('endpoint')
  })
  it('allowlist matches the contract and rejects the rest', () => {
    for (const t of ['readings', 'consults', 'meds_taken', 'activity', 'push_subscriptions', 'usage_events', 'safety_overrides']) expect(isSyncable(t)).toBe(true)
    for (const t of ['people', 'constructor', 'x']) expect(isSyncable(t)).toBe(false)
  })
  it('fromRow maps back and drops nulls except unknown values', () => {
    expect(fromRow('readings', { client_id: 'c', person_id: 'p', taken_at: 't', test: 'x', value: 1, unit: null, lab_low: null })).toEqual({ clientId: 'c', personId: 'p', takenAt: 't', test: 'x', value: 1, labLow: null })
  })
  it('natural key treats a date and the same instant as equal', () => {
    expect(naturalKey.readings({ personId: 'p', test: 't', takenAt: '2026-10-01' })).toBe(naturalKey.readings({ personId: 'p', test: 't', takenAt: '2026-10-01T00:00:00+00:00' }))
  })
})

describe('backoff schedule', () => {
  it('is 1, 2, 4, 8, 16 then capped at 30 minutes', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(backoffMinutes)).toEqual([0, 1, 2, 4, 8, 16, 30, 30])
  })
})

describe('push', () => {
  it('no token: sends nothing and keeps the queue', async () => {
    mockFetch(() => json({}))
    await enqueue('readings', 'insert', reading)
    startSync(cfg(null))()
    await syncNow()
    expect(calls).toHaveLength(0)
    expect(await db.outbox.count()).toBe(1)
  })

  it('sends with apikey, bearer and idempotent upsert headers, then removes the row only after success', async () => {
    mockFetch(() => new Response(null, { status: 201 }))
    const id = await hdb.readings.add({ ...reading })
    await enqueue('readings', 'insert', { ...reading, id })
    startSync(cfg())()
    await syncNow()
    const [p] = posts()
    expect(p.url).toBe(`${URL}/rest/v1/readings?on_conflict=client_id`)
    expect(p.headers).toMatchObject({ apikey: 'pk', Authorization: 'Bearer tok1' })
    expect(p.headers.Prefer).toContain('resolution=ignore-duplicates')
    expect(p.url).not.toContain('3.2') // values never in URLs
    expect(JSON.parse(p.body!).client_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await db.outbox.count()).toBe(0)
    expect(clientIdOf(await hdb.readings.get(id))).toBe(JSON.parse(p.body!).client_id)
  })

  it('a retry after a network failure reuses the same client_id (idempotent)', async () => {
    mockFetch(() => { throw new TypeError('offline') })
    await enqueue('meds_taken', 'insert', { personId: 'p1', name: 'M', takenAt: '2026-10-01T08:00:00Z' })
    startSync(cfg())()
    await syncNow()
    const first = JSON.parse(posts()[0].body!).client_id
    expect(await db.outbox.count()).toBe(1)
    expect((await db.outbox.toArray())[0].tries).toBe(0) // a network error is not a fault of the row
    mockFetch(() => new Response(null, { status: 201 }))
    await syncNow(true)
    expect(JSON.parse(posts()[0].body!).client_id).toBe(first)
    expect(await db.outbox.count()).toBe(0)
  })

  it('network errors back off and skip until due; online (force) tries again', async () => {
    mockFetch(() => { throw new TypeError('offline') })
    await enqueue('activity', 'insert', { personId: 'p', kind: 'walk', minutes: null, steps: null, startedAt: 't', source: 'manual' })
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(1)
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 1 })
    await syncNow()
    expect(posts()).toHaveLength(1) // inside the backoff window
    await syncNow(true)
    expect(posts()).toHaveLength(2)
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 2 })
  })

  it('401 pauses sync until a new token', async () => {
    mockFetch(() => json({ code: 'PGRST303' }, 401))
    await enqueue('readings', 'insert', reading)
    let token = 'old'
    startSync({ url: URL, key: 'pk', getToken: async () => token })()
    await syncNow()
    expect(posts()).toHaveLength(1)
    await syncNow(true)
    expect(posts()).toHaveLength(1) // paused: same token
    expect((await db.outbox.toArray())[0].tries).toBe(0)
    token = 'new'
    mockFetch(() => new Response(null, { status: 201 }))
    await syncNow()
    expect(posts()).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('a 400 is retried and moves to the dead-letter list after 5 tries, code only in logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch(() => json({ code: 'PGRST204', message: 'Key (value)=(9.9) secret' }, 400))
    await enqueue('readings', 'insert', { ...reading, value: 9.9 })
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(5)
    const dead = (await db.kv.get(DEAD_KEY))?.value as DeadLetter[]
    expect(dead).toHaveLength(1)
    expect(dead[0]).toMatchObject({ table: 'readings', code: 'PGRST204' })
    expect(JSON.stringify(dead[0])).not.toContain('secret') // server message is not stored
    expect(await db.outbox.count()).toBe(0)
    expect((await syncCounts()).dead).toBe(1)
    for (const spy of [log, err, warn]) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/9\.9|secret/)
  })

  it('one poison row does not stop the rows behind it', async () => {
    mockFetch((c) => (c.url.includes('/readings') ? json({ code: '23514' }, 400) : new Response(null, { status: 201 })))
    await enqueue('readings', 'insert', reading)
    await enqueue('meds_taken', 'insert', { personId: 'p1', name: 'M', takenAt: '2026-10-01T08:00:00Z' })
    startSync(cfg())()
    await syncNow()
    expect(await db.outbox.count()).toBe(0)
    expect((await syncCounts()).dead).toBe(1)
    expect(posts().filter((c) => c.url.includes('/meds_taken'))).toHaveLength(1)
  })

  it('rows outside the allowlist stay queued, are counted and never sent', async () => {
    mockFetch(() => new Response(null, { status: 201 }))
    await enqueue('people', 'insert', { name: 'x' })
    await enqueue('readings', 'insert', reading)
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(1)
    expect(await db.outbox.count()).toBe(1)
    expect(await syncCounts()).toEqual({ waiting: 0, unknown: 1, dead: 0 })
  })

  it('single flight: concurrent calls share one run', async () => {
    mockFetch(() => new Response(null, { status: 201 }))
    await enqueue('readings', 'insert', reading)
    startSync(cfg())()
    await Promise.all([syncNow(), syncNow(), syncNow()])
    expect(posts()).toHaveLength(1)
  })

  it('drain only filter leaves skipped rows untouched', async () => {
    await enqueue('a', 'i', {})
    await enqueue('b', 'i', {})
    const sent = await drain(async () => {}, (r) => r.table === 'b')
    expect(sent).toBe(1)
    expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['a'])
  })
})

describe('pull', () => {
  const server = [
    { client_id: 'c1', person_id: 'p1', taken_at: '2026-10-01T00:00:00+00:00', test: 'ldl', value: 3.2, unit: null, created_at: '2026-10-02T00:00:00.1+00:00' },
    { client_id: 'c2', person_id: 'p1', taken_at: '2026-10-05T00:00:00+00:00', test: 'ldl', value: 3.0, unit: null, created_at: '2026-10-03T00:00:00.2+00:00' }
  ]
  const handler = (c: Call) => (c.url.includes('/readings?') && c.method === 'GET' ? json(server) : json([]))

  it('adds new rows, dedupes on client_id and on a row this device already sent, and keeps the cursor', async () => {
    mockFetch(handler)
    await hdb.readings.add({ ...reading, personId: 'p1', takenAt: '2026-10-01', test: 'ldl', value: 3.2 }) // same row as c1, never stamped
    startSync(cfg())()
    await syncNow()
    let all = await hdb.readings.toArray()
    expect(all).toHaveLength(2)
    expect(clientIdOf(all.find((r) => r.takenAt === '2026-10-01'))).toBe('c1')
    await syncNow(true) // second pull returns the same rows
    all = await hdb.readings.toArray()
    expect(all).toHaveLength(2)
    expect((await db.kv.get('sync.cursor.readings'))?.value).toBe('2026-10-03T00:00:00.2+00:00')
    const gets = calls.filter((c) => c.url.includes('/readings?'))
    expect(gets[0].url).not.toContain('created_at=gte')
    expect(gets[1].url).toContain('created_at=gte.2026-10-03T00%3A00%3A00.2%2B00%3A00')
  })
})
