import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, drain, enqueue } from '../../db'
import { ldb, logActivity } from '../log/store'
import { hdb } from '../records/store'
import { vdb } from '../health/visitsStore'
import { backoffMinutes, DEAD_KEY, getSyncState, LAST_PULL_KEY, resetSyncForTests, syncCounts, startSync, syncNow, type DeadLetter } from './sync'
import { OVERRIDES_KEY } from '../safety/entries'
import { fromRow, isSyncable, naturalKey, TABLES, toRow } from './tables'
import { track } from '../admin/events'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
const who = vi.hoisted(() => ({ id: null as string | null }))
vi.mock('../auth/session', async (orig) => ({ ...(await orig<typeof import('../auth/session')>()), getMember: async () => (who.id ? { userId: '44444444-4444-4444-8444-444444444444', personId: who.id } : null) }))

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
const posts = () => calls.filter((c) => c.method === 'POST' && !c.url.includes('/rpc/')) // the feed list (D-134) is an rpc POST, not a row send
const clientIdOf = (r: unknown) => (r as { clientId?: string } | undefined)?.clientId

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), hdb.readings.clear(), hdb.consults.clear(), ldb.meds.clear(), ldb.activity.clear()])
  who.id = null
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

describe('sensor steps hours across two phones', () => {
  const hour = (steps: number, over: Record<string, unknown> = {}) => ({ personId: 'p1', kind: 'steps', minutes: 60, steps, startedAt: '2026-10-01T06:00:00.000Z', source: 'health-connect' as const, ...over })
  /** The activity table as PostgREST treats it: unique client_id, on_conflict ignore answers [] with return=representation, PATCH by client_id. */
  function fakeServer() {
    const server: Record<string, unknown>[] = []
    mockFetch(async (c) => {
      if (!c.url.includes('/activity')) return c.method === 'GET' ? json([]) : new Response(null, { status: 201 })
      const answer = (rows: unknown[], status: number) => (c.headers.Prefer?.includes('return=representation') ? json(rows, status) : new Response(null, { status })) // return=minimal has no body at all
      if (c.method === 'POST') {
        const b = JSON.parse(c.body!)
        if (server.some((s) => s.client_id === b.client_id)) return answer([], 201)
        server.push({ ...b, created_at: '2026-10-01T07:00:00+00:00', started_at: b.started_at.replace('.000Z', '+00:00') })
        return answer([b], 201)
      }
      const cid = /client_id=eq\.([^&]+)/.exec(c.url)?.[1]
      const hit = server.filter((s) => !cid || s.client_id === cid)
      if (c.method === 'PATCH') { Object.assign(hit[0], JSON.parse(c.body!)); return answer(hit, 200) }
      return json(hit)
    })
    return server
  }
  const otherPhone = async () => { await Promise.all([db.outbox.clear(), ldb.activity.clear(), db.kv.delete('sync.cursor.activity')]) }
  const run = async () => { startSync(cfg())(); await syncNow() } // joins the run startSync began; a forced join would earn a second try
  const stepsOf = async () => (await ldb.activity.toArray()).map((a) => a.steps)

  it('both phones send one client_id for one hour, uuid-shaped, and the server keeps one row', async () => {
    const server = fakeServer()
    await logActivity(hour(4000))
    await run()
    await otherPhone()
    await logActivity(hour(3000))
    const before = posts().length
    await run()
    expect(server).toHaveLength(1)
    const sent = posts().map((c) => JSON.parse(c.body!).client_id)
    expect(sent.length).toBeGreaterThan(before)
    expect(new Set(sent).size).toBe(1)
    expect(sent[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('an hour insert asks for the row back, because [] is how it learns another phone got there first; a manual row does not', async () => {
    fakeServer()
    await logActivity(hour(4000))
    await logActivity(hour(5, { source: 'manual' }))
    await run()
    const [sensor, manual] = posts().filter((c) => c.url.includes('/activity'))
    expect(sensor.headers.Prefer).toContain('return=representation')
    expect(manual.headers.Prefer).toContain('return=minimal')
  })
  it('a failed read before an update (503) sends no PATCH: the row waits, its try is not counted, and the next sync sends it', async () => {
    const id = await ldb.activity.add({ ...hour(100), clientId: 'cid-a' } as never)
    await enqueue('activity', 'update', { id, steps: 100 })
    mockFetch((c) => (c.method === 'GET' && c.url.includes('select=steps') ? new Response(null, { status: 503 }) : c.method === 'PATCH' ? json([{ id: 's1' }]) : json([])))
    await run()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
    expect((await db.outbox.toArray()).map((r) => r.tries)).toEqual([0])
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 1 })
    expect(getSyncState().offline).toBe(false) // a server error, not a lost network
    mockFetch((c) => (c.method === 'PATCH' ? json([{ id: 's1' }]) : json([])))
    await syncNow(true) // past the backoff
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
  })
  it('a lasting 403 on that read takes the dead-letter path through the PATCH: no backoff, the outbox moves on', async () => {
    const id = await ldb.activity.add({ ...hour(100), clientId: 'cid-a' } as never)
    await enqueue('activity', 'update', { id, steps: 100 })
    mockFetch((c) => (c.url.includes('select=steps') || c.method === 'PATCH' ? json({ code: '42501' }, 403) : json([])))
    await run()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    expect(((await db.kv.get(DEAD_KEY))?.value as DeadLetter[]).map((d) => [d.table, d.code])).toEqual([['activity', '42501']])
    expect(await db.outbox.count()).toBe(0)
    expect(await db.kv.get('sync.backoff')).toBeUndefined()
  })
  it('a 429 or a 408 on that read is transient, like a 503: no PATCH', async () => {
    for (const status of [429, 408]) {
      await db.kv.delete('sync.backoff')
      const id = await ldb.activity.add({ ...hour(100), clientId: `cid-${status}` } as never)
      await db.outbox.clear()
      await enqueue('activity', 'update', { id, steps: 100 })
      mockFetch((c) => (c.url.includes('select=steps') ? new Response(null, { status }) : json([{ id: 's1' }])))
      await run()
      expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
      expect(await db.outbox.count()).toBe(1)
    }
  })
  it('a 401 on that read still ends in the PATCH\'s own answer, which pauses sync', async () => {
    const id = await ldb.activity.add({ ...hour(100), clientId: 'cid-a' } as never)
    await enqueue('activity', 'update', { id, steps: 100 })
    mockFetch(() => json({ code: 'PGRST303' }, 401))
    await run()
    expect(calls.map((c) => c.method).slice(0, 2)).toEqual(['GET', 'PATCH'])
    expect(getSyncState().paused).toBe(true)
    expect(await db.outbox.count()).toBe(1)
  })
  it('the client_id depends on person, source and hour; the +00:00 form of an instant gives the same one', async () => {
    const server = fakeServer()
    for (const a of [hour(1), hour(1, { personId: 'p2' }), hour(1, { source: 'healthkit' }), hour(1, { startedAt: '2026-10-01T07:00:00.000Z' }), hour(1, { startedAt: '2026-10-01T06:00:00+00:00' })]) await logActivity(a as never)
    await run()
    expect(new Set(posts().map((c) => JSON.parse(c.body!).client_id)).size).toBe(4)
    expect(server).toHaveLength(4)
  })
  it('every other row keeps a client_id of its own: old-shape steps, off-hour steps, manual steps', async () => {
    fakeServer()
    const old = hour(1, { minutes: 9 })
    const offHour = hour(1, { startedAt: '2026-10-01T06:17:00.000Z' })
    const manual = hour(1, { source: 'manual' })
    for (const a of [old, old, offHour, offHour, manual, manual]) await enqueue('activity', 'insert', a)
    await run()
    expect(new Set(posts().map((c) => JSON.parse(c.body!).client_id)).size).toBe(6)
  })
  it('after its insert did nothing, the phone with the larger total raises the server row, and the row is pulled once', async () => {
    const server = fakeServer()
    await logActivity(hour(100))
    await run()
    await otherPhone()
    await logActivity(hour(4000))
    await run() // POST ignored; stamped; the larger total goes up as an update in the same sync
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    expect(server).toHaveLength(1)
    expect(server[0].steps).toBe(4000)
    expect(await stepsOf()).toEqual([4000]) // the pull saw its own client_id: no second local row
    expect(await db.outbox.count()).toBe(0)
  })
  it('a phone holding a smaller total never lowers the server row, also after its own total rose', async () => {
    const server = fakeServer()
    await logActivity(hour(4000))
    await run()
    await otherPhone()
    const id = await logActivity(hour(100))
    await run()
    await run()
    expect(server[0].steps).toBe(4000)
    await ldb.activity.update(id, { steps: 200 })
    await enqueue('activity', 'update', { id, ...hour(200) })
    await run()
    expect(server[0].steps).toBe(4000)
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
    expect(calls.some((c) => c.url.includes('200'))).toBe(false) // values never in URLs
    expect(await db.outbox.count()).toBe(0)
  })
  it('a fresh phone pulls the other phone\'s row as one local row under the same client_id', async () => {
    const server = fakeServer()
    await logActivity(hour(4000))
    await run()
    const cid = server[0].client_id
    await otherPhone()
    await run()
    const local = await ldb.activity.toArray()
    expect(local.map(clientIdOf)).toEqual([cid])
    expect(local[0].startedAt).toBe('2026-10-01T06:00:00+00:00')
  })
  it('the hour stored by a sensor read while the pull is on the wire: one local row, stamped when its insert goes up', async () => {
    const server = fakeServer()
    await logActivity(hour(4000))
    await run()
    await otherPhone()
    const inner = fetch
    let once = true
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      const res = await inner(u, init)
      if (once && u.includes('/activity?select=*')) { once = false; await logActivity(hour(4000)) }
      return res
    })
    await run()
    expect(await stepsOf()).toEqual([4000])
    await run()
    expect(await stepsOf()).toEqual([4000])
    expect(clientIdOf((await ldb.activity.toArray())[0])).toBe(server[0].client_id)
    expect(server).toHaveLength(1)
  })
  it('an unsent hour (its insert dead-lettered) is stamped by the pull with the shared client_id', async () => {
    const server = fakeServer()
    await logActivity(hour(4000))
    await run()
    await otherPhone()
    await ldb.activity.add(hour(4000))
    await run()
    const [only] = await ldb.activity.toArray()
    expect(await ldb.activity.count()).toBe(1)
    expect(clientIdOf(only)).toBe(server[0].client_id)
  })
  it('a queued update whose row is gone no longer blocks the outbox', async () => {
    fakeServer()
    expect(await ldb.activity.get(424242)).toBeUndefined()
    expect(await ldb.activity.bulkGet([424242])).toEqual([undefined])
    await enqueue('activity', 'update', { id: 424242, ...hour(5) })
    await enqueue('readings', 'insert', reading)
    await run()
    expect(posts().filter((c) => c.url.includes('/readings'))).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('a long queue does not hold back an SOS', () => {
  const H = 3_600_000
  const T = Date.parse('2026-10-01T06:00:00.000Z')
  const hourAt = (i: number) => ({ personId: 'p1', kind: 'steps', minutes: 60, steps: 10 + i, startedAt: new Date(T + i * H).toISOString(), source: 'health-connect' as const })
  const sos = { id: 's1', personId: 'p1', at: '2026-10-01T06:00:00.000Z', lat: null, lon: null, gps: null, callTo: 'family', smsOpened: false }
  const ok = (c: Call) => (c.method === 'GET' ? json([]) : c.method === 'PATCH' ? json([{ id: 'x' }]) : json([{ id: 'x' }], 201))
  const fill = async (n: number) => { for (let i = 0; i < n; i++) await logActivity(hourAt(i)) }
  const go = async () => { startSync(cfg())(); await syncNow() } // stopped at once: no timer, no nudge can help
  const written = () => calls.filter((c) => c.method !== 'GET' && !c.url.includes('/rpc/'))

  it('200 hour rows and an SOS queued during the first send: the SOS is the first row of the next batch, alerts are read before it, all are sent in one sync', async () => {
    await fill(200)
    let queued = false
    mockFetch(async (c) => {
      if (c.method === 'POST' && !queued) { queued = true; await enqueue('sos_events', 'insert', sos) }
      return ok(c)
    })
    await go()
    const sent = written()
    expect(sent.findIndex((c) => c.url.includes('/sos_events'))).toBe(50)
    expect(calls.findIndex((c) => c.url.includes('/safety_alerts'))).toBeLessThan(calls.indexOf(sent[50]))
    expect(sent).toHaveLength(201)
    expect(await db.outbox.count()).toBe(0)
  })
  it('between batches only alerts are read: 200 rows are 4 batches, 3 alert reads, then one full pull', async () => {
    await fill(200)
    mockFetch(ok)
    await go()
    expect(posts()).toHaveLength(200)
    expect(calls.filter((c) => c.url.includes('/readings?'))).toHaveLength(1)
    expect(calls.filter((c) => c.url.includes('/safety_alerts') && !c.url.includes('select=source,fetched_at'))).toHaveLength(4) // 3 between batches, 1 in the full pull (the checked-stamp read is separate)
    expect(calls.findIndex((c) => c.url.includes('/readings?'))).toBeGreaterThan(calls.lastIndexOf(posts()[199]))
    expect((await db.kv.get(LAST_PULL_KEY))?.value).toBeTruthy()
  })
  it('one failing pull table does not throttle the outbox: all 200 rows go in one sync, then the pull fails once', async () => {
    await fill(200)
    mockFetch((c) => (c.url.includes('/consults?') ? new Response(null, { status: 503 }) : ok(c)))
    await go()
    expect(posts()).toHaveLength(200)
    expect(await db.outbox.count()).toBe(0)
    expect(calls.filter((c) => c.url.includes('/consults?'))).toHaveLength(1)
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 1 })
    expect(await db.kv.get(LAST_PULL_KEY)).toBeUndefined() // nothing fresh came down
  })
  it('an SOS queued during the pull of the last batch still goes in the same sync', async () => {
    await fill(3)
    let queued = false
    mockFetch(async (c) => {
      if (c.url.includes('/safety_alerts') && !queued) { queued = true; await enqueue('sos_events', 'insert', sos) }
      return ok(c)
    })
    await go()
    expect(written().map((c) => c.url.includes('/sos_events'))).toEqual([false, false, false, true])
    expect(await db.outbox.count()).toBe(0)
  })
  it('safety rows go first, an SOS before its own update; other tables keep id order, also across a batch edge', async () => {
    await fill(60)
    const a = (await ldb.activity.toArray())[54]
    await ldb.activity.update(a.id!, { clientId: 'cid-a' } as never)
    await enqueue('activity', 'update', { id: a.id, steps: 999 })
    await enqueue('sos_events', 'insert', sos)
    await enqueue('sos_events_update', 'update', { id: 's1', cancelledAt: '2026-10-01T06:01:00.000Z' })
    await enqueue('sos_acks', 'insert', { eventId: 'e1', seenAt: '2026-10-01T06:01:00.000Z' })
    mockFetch(ok)
    await go()
    const sent = written()
    expect(sent.slice(0, 3).map((c) => [c.method, c.url.split('/rest/v1/')[1].split('?')[0]])).toEqual([['POST', 'sos_events'], ['PATCH', 'sos_events'], ['POST', 'sos_acks']])
    const started = sent.slice(3).filter((c) => c.method === 'POST').map((c) => JSON.parse(c.body!).started_at as string)
    expect(started).toEqual(Array.from({ length: 60 }, (_, i) => hourAt(i).startedAt))
    expect(sent[sent.length - 1].method).toBe('PATCH') // the update was queued after the 60 inserts
    expect(JSON.parse(sent[sent.length - 1].body!).steps).toBe(999)
  })
  it('a failing row still stops the sync: nothing after it, no next batch, the rest stay queued', async () => {
    await fill(60)
    let n = 0
    mockFetch((c) => (c.method === 'POST' && ++n === 10 ? new Response(null, { status: 503 }) : ok(c)))
    await go()
    expect(posts()).toHaveLength(10)
    expect(await db.outbox.count()).toBe(51)
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 1 })
  })
  it('an SOS beside an activity row that always answers 503: the SOS is sent, the row stays', async () => {
    await fill(1)
    await enqueue('sos_events', 'insert', sos)
    mockFetch((c) => (c.url.includes('/activity') && c.method === 'POST' ? new Response(null, { status: 503 }) : ok(c)))
    await go()
    expect(written().map((c) => c.url.split('/rest/v1/')[1].split('?')[0])).toEqual(['sos_events', 'activity'])
    expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['activity'])
  })
  it('a forced sync that joins a failing unforced run keeps its force: the SOS goes without waiting out the backoff', async () => {
    await fill(1)
    let release = () => {}
    const held = new Promise<void>((r) => { release = r })
    let first = true
    mockFetch(async (c) => {
      if (first && c.method === 'POST') { first = false; await held; throw new TypeError('offline') }
      return ok(c)
    })
    startSync(cfg())()
    await vi.waitFor(() => expect(posts()).toHaveLength(1))
    await enqueue('sos_events', 'insert', sos)
    const joined = syncNow(true)
    release()
    await joined
    expect(written().filter((c) => c.url.includes('/sos_events'))).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.kv.get('sync.backoff')).toBeUndefined()
  })
  it('a forced sync that joins a run stopping at the backoff also goes', async () => {
    await db.kv.put({ key: 'sync.backoff', value: { fails: 6, nextAt: Date.now() + 30 * 60_000 } })
    await enqueue('sos_events', 'insert', sos)
    mockFetch(ok)
    startSync(cfg())()
    await syncNow(true)
    expect(written().filter((c) => c.url.includes('/sos_events'))).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
  })
  it('a joined force buys one more run, not a retry loop: the network stays down, two tries, then the backoff holds', async () => {
    await enqueue('sos_events', 'insert', sos)
    mockFetch(() => { throw new TypeError('offline') })
    startSync(cfg())()
    await syncNow(true)
    expect(posts()).toHaveLength(2)
    expect((await db.kv.get('sync.backoff'))?.value).toMatchObject({ fails: 2 })
    await syncNow()
    expect(posts()).toHaveLength(2)
  })
  it('a joined force with nothing queued adds no second pull', async () => {
    mockFetch(ok)
    startSync(cfg())()
    await syncNow(true)
    expect(calls.filter((c) => c.url.includes('/readings?'))).toHaveLength(1)
  })
  it('does not spin when nothing can be sent: 5 missing tables and a row behind them stop at the cap of 40 runs', async () => {
    const missing = ['food_entries', 'water_entries', 'nutrition_goals', 'family_messages', 'phone_health']
    for (const t of missing) await enqueue(t, 'insert', { personId: 'p1' })
    await enqueue('readings', 'insert', reading)
    mockFetch((c) => (calls.length < 3000 && missing.some((t) => c.url.includes(`/${t}?on_conflict`)) ? json({ code: 'PGRST205' }, 404) : ok(c))) // heals at 3000 calls so an unbounded loop ends and fails here
    await go()
    expect(posts()).toHaveLength(200) // 5 passes, 1 row each, 40 runs
    expect(await db.outbox.count()).toBe(6)
  })
  it('rows left waiting for a table the server lacks do not make it run again and again', async () => {
    await enqueue('family_messages', 'insert', { kind: 'text', body: 'x' })
    mockFetch((c) => (c.url.includes('/family_messages') ? json({ code: 'PGRST205' }, 404) : ok(c)))
    await go()
    expect(posts()).toHaveLength(1)
    expect(await db.outbox.count()).toBe(1)
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

  it('an activity update PATCHes only steps by the row client_id, and keeps the local client_id', async () => {
    mockFetch((c) => (c.method === 'PATCH' ? json([{ id: 's1' }]) : new Response(null, { status: 201 })))
    const a = { personId: 'p1', kind: 'steps', minutes: 60, steps: 500, startedAt: '2026-10-01T06:00:00.000Z', source: 'health-connect' as const }
    const id = await ldb.activity.add(a)
    await enqueue('activity', 'insert', { ...a, id })
    await ldb.activity.update(id, { steps: 800 })
    await enqueue('activity', 'update', { id, ...a, steps: 800 })
    startSync(cfg())()
    await syncNow()
    const [p] = calls.filter((c) => c.method === 'PATCH')
    const cid = clientIdOf(await ldb.activity.get(id))
    expect(p.url).toBe(`${URL}/rest/v1/activity?client_id=eq.${cid}`)
    expect(JSON.parse(p.body!)).toEqual({ steps: 800 })
    expect(cid).toMatch(/^[0-9a-f-]{36}$/)
    expect(await db.outbox.count()).toBe(0)
  })
  it('records the time of the last successful sync (the offline bar shows it), and not after a failed one', async () => {
    mockFetch((c) => (c.method === 'GET' ? json([]) : new Response(null, { status: 201 })))
    startSync(cfg())()
    await syncNow()
    const at = (await db.kv.get(LAST_PULL_KEY))?.value as number
    expect(Math.abs(Date.now() - at)).toBeLessThan(5000)
    await db.kv.put({ key: LAST_PULL_KEY, value: 123 })
    mockFetch(() => { throw new TypeError('offline') })
    await enqueue('readings', 'insert', reading)
    await syncNow(true)
    expect((await db.kv.get(LAST_PULL_KEY))?.value).toBe(123)
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

  it('usage_events before migration 0015 (no client_at column): the row is retried once without clientAt and then sent', async () => {
    let n = 0
    mockFetch((c) => (n++ === 0 && c.body?.includes('client_at') ? json({ code: 'PGRST204', message: "Could not find the 'client_at' column" }, 400) : new Response(null, { status: 201 })))
    await enqueue('usage_events', 'insert', { kind: 'screen', name: 'today', appVersion: 'dev', clientAt: '2026-10-20T01:00:00Z' })
    startSync(cfg())()
    await syncNow()
    expect(posts()).toHaveLength(2)
    expect(posts()[0]!.body).toContain('client_at')
    expect(posts()[1]!.body).not.toContain('client_at')
    expect(await db.outbox.count()).toBe(0)
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

  it('forgets a person the server no longer sends, keeps my own row, and keeps everything when the pull fails', async () => {
    await hdb.people.clear()
    await hdb.people.bulkPut([{ id: 'me', name: 'Test Me' }, { id: 'gone', name: 'Test Child' }, { id: 'kept', name: 'Test Kept' }])
    await db.profiles.put({ id: 'gone', photoPath: null, phone: null, birthdate: null, bloodType: null, allergies: [], conditions: [], medicines: [], updatedAt: null })
    who.id = 'me'
    mockFetch((c) => (c.url.includes('/people?') ? json({ code: 'PGRST' }, 500) : json([])))
    startSync(cfg())()
    await syncNow()
    expect(await hdb.people.count()).toBe(3)
    resetSyncForTests()
    await db.kv.delete('sync.backoff') // the failed run set a wait; startSync's own first run would honour it
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: 'kept', display_name: 'Test Kept' }]) : json([])))
    startSync(cfg())()
    await syncNow()
    expect((await hdb.people.toArray()).map((p) => p.id).sort()).toEqual(['kept', 'me'])
    expect(await db.profiles.get('gone')).toBeUndefined()
  })

  it('Stop sharing: a person the server no longer sends loses every local record, medicine, dose and visit; kept people lose nothing', async () => {
    await Promise.all([hdb.people.clear(), hdb.readings.clear(), hdb.consults.clear(), hdb.thresholds.clear(), ldb.meds.clear(), ldb.medications.clear(), ldb.activity.clear(), ldb.food.clear(), ldb.water.clear(), ldb.goals.clear(), vdb.appointments.clear(), vdb.followUps.clear()])
    await hdb.people.bulkPut([{ id: 'me', name: 'Test Me' }, { id: 'gone', name: 'Test Child' }, { id: 'kept', name: 'Test Kept' }])
    for (const id of ['gone', 'kept']) {
      await hdb.readings.add({ personId: id, test: 'ldl', value: 1, unit: 'mg/dL', takenAt: '2026-10-01T00:00:00Z' } as never)
      await hdb.consults.add({ personId: id, takenAt: '2026-10-01T00:00:00Z' } as never)
      await hdb.thresholds.put({ key: `${id}:ldl` } as never)
      await ldb.meds.add({ personId: id, name: 'Test med', takenAt: '2026-10-01T00:00:00Z' } as never)
      await ldb.medications.add({ clientId: `m-${id}`, personId: id, name: 'Test med' } as never)
      await ldb.activity.add({ personId: id, kind: 'walk', minutes: 5, steps: null, startedAt: '2026-10-01T00:00:00Z', source: 'manual' } as never)
      await ldb.goals.put({ personId: id, sodiumMg: 1500, waterMl: 2000, potassiumMg: null, sex: null })
      await vdb.appointments.add({ clientId: `a-${id}`, personId: id, startsAt: '2026-11-01T00:00:00Z' } as never)
    }
    who.id = 'me'
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: 'kept', display_name: 'Test Kept' }]) : json([])))
    startSync(cfg())()
    await syncNow()
    const left = async (id: string) => [
      await hdb.readings.where('personId').equals(id).count(), await hdb.consults.where('personId').equals(id).count(), await hdb.thresholds.where('key').startsWith(`${id}:`).count(),
      await ldb.meds.where('personId').equals(id).count(), await ldb.medications.where('personId').equals(id).count(), await ldb.activity.where('personId').equals(id).count(),
      await ldb.goals.where('personId').equals(id).count(), await vdb.appointments.where('personId').equals(id).count()
    ]
    expect(await left('gone')).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(await left('kept')).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
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
