import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, drain, enqueue } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { backoffMinutes, DEAD_KEY, resetSyncForTests, syncCounts, startSync, syncNow, type DeadLetter } from './sync'
import { OVERRIDES_KEY } from '../safety/entries'
import { fromRow, isSyncable, naturalKey, TABLES, toRow } from './tables'
import { track } from '../admin/events'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

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

  it('a deterministic 400 goes to the dead-letter list on the first failure, code only in logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch(() => json({ code: 'PGRST204', message: 'Key (value)=(9.9) secret' }, 400))
    await enqueue('readings', 'insert', { ...reading, value: 9.9 })
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(1)
    const dead = (await db.kv.get(DEAD_KEY))?.value as DeadLetter[]
    expect(dead).toHaveLength(1)
    expect(dead[0]).toMatchObject({ table: 'readings', code: 'PGRST204' })
    expect(JSON.stringify(dead[0])).not.toContain('secret') // server message is not stored
    expect(await db.outbox.count()).toBe(0)
    expect((await syncCounts()).dead).toBe(1)
    for (const spy of [log, err, warn]) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/9\.9|secret/)
  })

  it('a 403 on push_subscriptions is dropped silently, not dead-lettered', async () => {
    mockFetch(() => json({ code: '42501' }, 403))
    await enqueue('push_subscriptions', 'upsert', { endpoint: 'https://push.test/x', keys: { p256dh: 'a', auth: 'b' } })
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
    expect((await syncCounts()).dead).toBe(0)
  })

  it('an unsendable usage_events row is dropped silently: no dead letter, not counted', async () => {
    mockFetch(() => json({ code: '23514' }, 400))
    await enqueue('usage_events', 'insert', { kind: 'screen', name: 'today', appVersion: 'dev' })
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
    expect(await syncCounts()).toEqual({ waiting: 0, unknown: 0, dead: 0 })
  })

  it('an undecided 4xx (418) is retried and parked after 5 tries', async () => {
    mockFetch(() => json({ code: 'X' }, 418))
    await enqueue('readings', 'insert', reading)
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(5)
    expect((await syncCounts()).dead).toBe(1)
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

  it('usage_events still queue but do not count as waiting', async () => {
    await enqueue('usage_events', 'insert', { kind: 'screen', name: 'today' })
    await enqueue('readings', 'insert', reading)
    expect(await syncCounts()).toEqual({ waiting: 1, unknown: 0, dead: 0 })
    expect(await db.outbox.count()).toBe(2)
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
    { client_id: 'c1', person_id: 'p1', taken_at: '2026-10-01T00:00:00+00:00', test: 'ldl', value: 3.2, unit: null, updated_at: '2026-10-02T00:00:00.1+00:00' },
    { client_id: 'c2', person_id: 'p1', taken_at: '2026-10-05T00:00:00+00:00', test: 'ldl', value: 3.0, unit: null, updated_at: '2026-10-03T00:00:00.2+00:00' }
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
    expect(gets[0].url).not.toContain('updated_at=gte')
    expect(gets[1].url).toContain('updated_at=gte.2026-10-02T23%3A00%3A00.200Z') // one hour before the cursor
  })

  it('a late row older than the stored cursor still arrives on the second pull', async () => {
    let extra = false
    mockFetch((c) => {
      if (!(c.url.includes('/readings?') && c.method === 'GET')) return json([])
      const late = { client_id: 'c0', person_id: 'p1', taken_at: '2026-09-01T00:00:00+00:00', test: 'ldl', value: 2.9, updated_at: '2026-10-02T23:30:00+00:00' }
      return json(extra ? [late, ...server] : server)
    })
    startSync(cfg())()
    await syncNow()
    expect(await hdb.readings.count()).toBe(2)
    extra = true
    await syncNow(true)
    expect(await hdb.readings.count()).toBe(3)
    expect((await db.kv.get('sync.cursor.readings'))?.value).toBe('2026-10-03T00:00:00.2+00:00') // cursor never goes back
  })

  it('a look-alike row with a different client_id is added, not skipped', async () => {
    mockFetch(handler)
    await hdb.readings.add({ ...reading, personId: 'p1', takenAt: '2026-10-01', test: 'ldl', value: 3.2, clientId: 'other' } as never)
    startSync(cfg())()
    await syncNow()
    expect(await hdb.readings.count()).toBe(3)
  })

  it('a server edit updates the same local row, a tombstone removes it, a re-confirm brings it back once', async () => {
    const base = { client_id: 'cx', person_id: 'p1', taken_at: '2026-10-01T00:00:00+00:00', test: 'ldl', unit: 'mg/dL', deleted_at: null }
    let rows: Record<string, unknown>[] = [{ ...base, value: 120, updated_at: '2026-10-02T00:00:00+00:00' }]
    mockFetch((c) => (c.url.includes('/readings?') && c.method === 'GET' ? json(rows) : json([])))
    startSync(cfg())()
    await syncNow()
    expect((await hdb.readings.toArray()).map((r) => r.value)).toEqual([120])
    rows = [{ ...base, value: 95, updated_at: '2026-10-03T00:00:00+00:00' }] // fixed
    await syncNow(true)
    expect((await hdb.readings.toArray()).map((r) => r.value)).toEqual([95])
    rows = [{ ...base, value: 95, updated_at: '2026-10-04T00:00:00+00:00', deleted_at: '2026-10-04T00:00:00+00:00' }] // rejected
    await syncNow(true)
    expect(await hdb.readings.count()).toBe(0)
    rows = [{ ...base, value: 96, updated_at: '2026-10-05T00:00:00+00:00' }] // re-confirmed
    await syncNow(true)
    expect((await hdb.readings.toArray()).map((r) => [r.value, clientIdOf(r)])).toEqual([[96, 'cx']])
  })

  it('a field nulled on the server is cleared locally on the next pull', async () => {
    const base = { client_id: 'cn', person_id: 'p1', taken_at: '2026-10-01T00:00:00+00:00', test: 'ldl', value: 120, unit: 'mg/dL', lab_low: 0, lab_high: 130, confidence: 0.9, deleted_at: null }
    let rows: Record<string, unknown>[] = [{ ...base, updated_at: '2026-10-02T00:00:00+00:00' }]
    mockFetch((c) => (c.url.includes('/readings?') && c.method === 'GET' ? json(rows) : json([])))
    startSync(cfg())()
    await syncNow()
    expect((await hdb.readings.toArray())[0].confidence).toBe(0.9)
    rows = [{ ...base, confidence: null, lab_high: null, updated_at: '2026-10-03T00:00:00+00:00' }]
    await syncNow(true)
    const [r] = await hdb.readings.toArray()
    expect(await hdb.readings.count()).toBe(1)
    expect(r.confidence).toBeUndefined()
    expect(r.labHigh).toBeNull() // unknown range stays null, never 0
  })

  it('column missing (0008 not applied): readings fall back to created_at, the other tables still pull', async () => {
    mockFetch((c) => {
      if (c.method !== 'GET') return json([])
      if (c.url.includes('/readings?') && c.url.includes('order=updated_at')) return json({ code: '42703', message: 'column readings.updated_at does not exist' }, 400)
      if (c.url.includes('/readings?')) return json(server.map((r) => ({ ...r, created_at: r.updated_at })))
      return json([])
    })
    startSync(cfg())()
    await syncNow()
    expect(await hdb.readings.count()).toBe(2)
    const urls = calls.filter((c) => c.method === 'GET').map((c) => c.url)
    expect(urls.some((u) => u.includes('/readings?') && u.includes('order=created_at'))).toBe(true)
    expect(urls.some((u) => u.includes('/consults?'))).toBe(true)
    expect(urls.some((u) => u.includes('/activity?'))).toBe(true)
  })

  it('a permanent pull error backs off and tracks sync_failed once per streak', async () => {
    vi.mocked(track).mockClear()
    mockFetch((c) => (c.url.includes('/people?') ? json({ code: 'PGRST' }, 404) : json([])))
    startSync(cfg())()
    await syncNow()
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 1 })
    const n = calls.length
    await syncNow()
    expect(calls.length).toBe(n) // inside the backoff window: no loop
    await syncNow(true)
    expect(vi.mocked(track).mock.calls.filter((a) => a[1] === 'sync_failed')).toHaveLength(1)
  })

  it('pulls people into the local store with the server id', async () => {
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: 'u-1', display_name: 'Test Person' }]) : json([])))
    startSync(cfg())()
    await syncNow()
    expect(await hdb.people.get('u-1')).toEqual({ id: 'u-1', name: 'Test Person' })
    expect(calls.find((c) => c.url.includes('/people?'))!.url).toContain('select=id,display_name')
  })

  it('merges admin safety edits into the kv overrides and drops removed ones', async () => {
    await db.kv.put({ key: OVERRIDES_KEY, value: { keep: { phone: '111' }, gone: { phone: '222' } } })
    mockFetch((c) =>
      c.url.includes('/safety_overrides?')
        ? json([
            { kind: 'hotline', key: 'h1', data: { phone: '911', status: 'CONFIRMED' }, removed: false },
            { kind: 'place', key: 'gone', data: null, removed: true }
          ])
        : json([])
    )
    startSync(cfg())()
    await syncNow()
    expect((await db.kv.get(OVERRIDES_KEY))?.value).toEqual({ keep: { phone: '111' }, h1: { phone: '911', status: 'CONFIRMED' } })
  })
})
