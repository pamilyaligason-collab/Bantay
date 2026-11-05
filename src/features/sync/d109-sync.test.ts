import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { CURSOR_RESET_KEY, resetSyncForTests, startSync, syncNow } from './sync'

// D-109 sync rules. Invented data only: the owner is Rey Villar; ids are made up.
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
const who = vi.hoisted(() => ({ id: null as string | null, uid: null as string | null, owner: true }))
vi.mock('../auth/session', async (orig) => ({ ...(await orig<typeof import('../auth/session')>()), getMember: async () => (who.uid ? { userId: who.uid, personId: who.id, isOwner: who.owner } : null) }))

const URL = 'https://x.supabase.test'
const ME = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'
const OLD = '33333333-3333-4333-8333-333333333333'
const USER = '44444444-4444-4444-8444-444444444444'
const MEDS = 'sync.cursor.medications'
const cfg = () => ({ url: URL, key: 'pk', getToken: async () => 'tok1' })
type Call = { url: string; method: string }
let calls: Call[]
function mockFetch(handler: (c: Call) => Response) {
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? 'GET' }
    calls.push(c)
    return handler(c)
  })
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sync = async () => { startSync(cfg())(); await syncNow() }
const getsOf = (table: string) => calls.filter((c) => c.url.includes(`/${table}?`))
/** The activity store as IndexedDB holds it, past the reading hook that blanks old-shape sensor rows. */
const rawActivity = () => new Promise<{ clientId?: string; steps: number | null; minutes: number | null }[]>((resolve) => {
  const open = indexedDB.open('bantay-log')
  open.onsuccess = () => {
    const all = open.result.transaction('activity').objectStore('activity').getAll()
    all.onsuccess = () => { open.result.close(); resolve(all.result) }
  }
})

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), hdb.people.clear(), hdb.readings.clear(), ldb.activity.clear()])
  who.id = ME
  who.uid = USER
  who.owner = true
  resetSyncForTests()
  await db.kv.put({ key: CURSOR_RESET_KEY, value: true }) // most tests are about the other rules; the reset has its own describe
})
afterEach(() => vi.unstubAllGlobals())

describe('people pull: who is read', () => {
  it('asks for active people only and always for my own row, even if archived', async () => {
    mockFetch(() => json([]))
    await sync()
    const url = getsOf('people')[0].url
    expect(url).toContain(`or=(archived_at.is.null,auth_user_id.eq.${USER})`)
    expect(url).toContain('select=id,display_name,kind,auth_user_id,')
  })
  it('signed in with no person yet: my own row is still asked for by user id', async () => {
    who.id = null
    mockFetch(() => json([]))
    await sync()
    expect(getsOf('people')[0].url).toContain('archived_at.is.null')
    expect(getsOf('people')[0].url).toContain(`auth_user_id.eq.${USER}`)
  })
  it('a successful empty read purges everyone but me, records included', async () => {
    await hdb.people.bulkPut([{ id: ME, name: 'Rey Villar' }, { id: OLD, name: 'Test Old' }])
    await hdb.readings.add({ personId: OLD, test: 'ldl', value: 1, unit: 'mg/dL', takenAt: '2026-10-01T00:00:00Z' } as never)
    await hdb.readings.add({ personId: ME, test: 'ldl', value: 2, unit: 'mg/dL', takenAt: '2026-10-01T00:00:00Z' } as never)
    mockFetch(() => json([]))
    await sync()
    expect((await hdb.people.toArray()).map((p) => p.id)).toEqual([ME])
    expect((await hdb.readings.toArray()).map((r) => r.personId)).toEqual([ME])
  })
  it('an empty read with no known self id purges nothing (unknown is not "nobody")', async () => {
    who.id = null
    await hdb.people.bulkPut([{ id: OLD, name: 'Test Old' }])
    mockFetch(() => json([]))
    await sync()
    expect(await hdb.people.count()).toBe(1)
  })
  it('a failed read purges nothing', async () => {
    await hdb.people.bulkPut([{ id: ME, name: 'Rey Villar' }, { id: OLD, name: 'Test Old' }])
    mockFetch((c) => (c.url.includes('/people?') ? json({ code: 'PGRST' }, 500) : json([])))
    await sync()
    expect(await hdb.people.count()).toBe(2)
  })
  it('my own row is kept when the server sends nobody', async () => {
    await hdb.people.bulkPut([{ id: ME, name: 'Rey Villar' }])
    mockFetch(() => json([]))
    await sync()
    expect((await hdb.people.get(ME))?.name).toBe('Rey Villar')
  })
})

describe('people pull: an archived own row, person id unknown', () => {
  const ARCH = '55555555-5555-4555-8555-555555555555'
  /** A server that returns only what the filter allows: active people, plus the row whose auth_user_id is in the URL. */
  const filtered = (c: Call) => {
    if (!c.url.includes('/people?')) return json([])
    const mine = /auth_user_id\.eq\.([0-9a-f-]+)/.exec(c.url)?.[1]
    const all = [{ id: ARCH, display_name: 'Rey Villar', auth_user_id: USER, archived_at: '2026-10-30T00:00:00Z' }, { id: NEW, display_name: 'Test Family', auth_user_id: null, archived_at: null }]
    return json(all.filter((p) => !p.archived_at || (mine && p.auth_user_id === mine)).map(({ archived_at: _a, ...p }) => p))
  }
  const seed = async () => {
    await hdb.people.bulkPut([{ id: ARCH, name: 'Rey Villar' }, { id: OLD, name: 'Test Old' }])
    await hdb.readings.add({ personId: ARCH, test: 'ldl', value: 2, unit: 'mg/dL', takenAt: '2026-10-01T00:00:00Z' } as never)
    await hdb.readings.add({ personId: OLD, test: 'ldl', value: 1, unit: 'mg/dL', takenAt: '2026-10-01T00:00:00Z' } as never)
  }
  it('personId null after a blip, non-empty read: the archived own row stays with its readings, the removed person goes', async () => {
    who.id = null
    await seed()
    mockFetch(filtered)
    await sync()
    expect((await hdb.people.toArray()).map((p) => p.id).sort()).toEqual([ARCH, NEW].sort())
    expect((await hdb.readings.toArray()).map((r) => r.personId)).toEqual([ARCH])
  })
  it('my user id unknown: the purge is skipped entirely, the read rows are still stored', async () => {
    who.uid = null
    who.id = null
    await seed()
    mockFetch(filtered)
    await sync()
    expect((await hdb.people.toArray()).map((p) => p.id).sort()).toEqual([ARCH, NEW, OLD].sort())
    expect(await hdb.readings.count()).toBe(2)
  })
})

describe('people pull: kind and the 42703 fallbacks', () => {
  it('kind reaches the stored Person; a person without one has no kind key', async () => {
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: ME, display_name: 'Rey Villar', kind: null }, { id: NEW, display_name: 'Test Family', kind: 'shared' }]) : json([])))
    await sync()
    expect(await hdb.people.get(NEW)).toEqual({ id: NEW, name: 'Test Family', kind: 'shared' })
    expect(await hdb.people.get(ME)).toEqual({ id: ME, name: 'Rey Villar' })
  })
  it('people.kind missing (0046 not applied): retried without kind, profile columns kept', async () => {
    mockFetch((c) => (c.url.includes('/people?') ? (c.url.includes(',kind,') ? json({ code: '42703' }, 400) : json([{ id: NEW, display_name: 'Test Family' }])) : json([])))
    await sync()
    const reads = getsOf('people').map((c) => c.url)
    expect(reads).toHaveLength(2)
    expect(reads[1]).toContain('select=id,display_name,auth_user_id,photo_path')
    expect((await hdb.people.get(NEW))?.name).toBe('Test Family')
  })
  it('profile columns missing too: the third read is names only', async () => {
    mockFetch((c) => (c.url.includes('/people?') ? (c.url.includes('select=id,display_name,auth_user_id&') ? json([{ id: NEW, display_name: 'Test Family' }]) : json({ code: '42703' }, 400)) : json([])))
    await sync()
    expect(getsOf('people')).toHaveLength(3)
    expect((await hdb.people.get(NEW))?.name).toBe('Test Family')
  })
})

describe('a new person re-reads the tables', () => {
  const rows = [
    { client_id: 'c-old', person_id: NEW, taken_at: '2026-09-01T00:00:00+00:00', test: 'ldl', value: 3.2, unit: null, updated_at: '2026-09-01T00:00:00+00:00' },
    { client_id: 'c-new', person_id: NEW, taken_at: '2026-10-02T00:00:00+00:00', test: 'ldl', value: 3.0, unit: null, updated_at: '2026-10-03T00:00:00+00:00' }
  ]
  /** A server that honours the cursor filter, like PostgREST does. */
  const server = (c: Call) => {
    if (c.url.includes('/people?')) return json([{ id: ME, display_name: 'Rey Villar' }, { id: NEW, display_name: 'Test Family' }])
    if (!c.url.includes('/readings?')) return json([])
    const from = /updated_at=gte\.([^&]+)/.exec(c.url)?.[1]
    return json(rows.filter((r) => !from || Date.parse(r.updated_at) >= Date.parse(decodeURIComponent(from))))
  }

  it('clears the cursors and reads once more in the same sync: the old row arrives, nothing twice', async () => {
    await hdb.people.put({ id: ME, name: 'Rey Villar' })
    await db.kv.put({ key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' })
    mockFetch(server)
    await sync()
    const gets = getsOf('readings')
    expect(gets).toHaveLength(2) // the cursor read, then the read from the start: once, not a loop
    expect(gets[0].url).toContain('updated_at=gte.2026-10-02T23%3A00%3A00.000Z')
    expect(gets[1].url).not.toContain('gte')
    expect((await hdb.readings.toArray()).map((r) => (r as { clientId?: string }).clientId).sort()).toEqual(['c-new', 'c-old'])
    await syncNow(true) // the person is known now: no third read from the start, still two rows
    expect(getsOf('readings')).toHaveLength(3)
    expect(getsOf('readings')[2].url).toContain('gte')
    expect(await hdb.readings.count()).toBe(2)
  })
  it('a phone that has no cursors yet reads the tables once (the first pass already reads from the start)', async () => {
    mockFetch(server)
    await sync()
    expect(getsOf('readings')).toHaveLength(1)
    expect(await hdb.readings.count()).toBe(2)
  })
  it('my own first appearance is not a new person', async () => {
    await db.kv.put({ key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: ME, display_name: 'Rey Villar' }]) : json([])))
    await sync()
    expect(getsOf('readings')).toHaveLength(1)
  })
  it('an archived person the phone never had is not pulled, so nothing triggers: the filter is in the request', async () => {
    await hdb.people.put({ id: ME, name: 'Rey Villar' })
    await db.kv.put({ key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' })
    mockFetch(() => json([]))
    await sync()
    expect(getsOf('readings')).toHaveLength(1)
    expect(getsOf('people')[0].url).toContain('archived_at.is.null')
  })
})

describe('the medicines-pulled marker survives every cursor clear', () => {
  const held = async () => (await db.kv.get(MEDS))?.value
  it('a reset with an empty medications read keeps the marker set', async () => {
    await db.kv.delete(CURSOR_RESET_KEY)
    await db.kv.put({ key: MEDS, value: '2026-10-03T00:00:00+00:00' })
    mockFetch(() => json([]))
    await sync()
    expect(await held()).toBeTruthy()
    expect(getsOf('medications')[0].url).not.toContain('gte') // still read from the start
  })
  it('a reset while the pull fails keeps the marker set, and the next pull still reads from the start', async () => {
    await db.kv.delete(CURSOR_RESET_KEY)
    await db.kv.put({ key: MEDS, value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/readings?') ? json({ code: 'PGRST' }, 500) : json([])))
    await sync()
    expect(await db.kv.get(CURSOR_RESET_KEY)).toBeUndefined()
    expect(await held()).toBeTruthy()
    mockFetch(() => json([]))
    await db.kv.delete('sync.backoff')
    resetSyncForTests()
    await sync()
    expect(getsOf('medications')[0].url).not.toContain('gte')
    expect(await held()).toBeTruthy()
  })
  it('a phone with no medications cursor does not get a marker made up by the reset', async () => {
    await db.kv.delete(CURSOR_RESET_KEY)
    mockFetch(() => json([]))
    await sync()
    expect(await held()).toBeUndefined()
  })
  it('a reset plus a new person reads medicines exactly once (the reset already reads from the start)', async () => {
    await db.kv.delete(CURSOR_RESET_KEY)
    await hdb.people.put({ id: ME, name: 'Rey Villar' })
    await db.kv.put({ key: MEDS, value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: ME, display_name: 'Rey Villar' }, { id: NEW, display_name: 'Test Family' }]) : json([])))
    await sync()
    expect(getsOf('medications')).toHaveLength(1)
  })
  it('a new person re-read keeps it too', async () => {
    await hdb.people.put({ id: ME, name: 'Rey Villar' })
    await db.kv.put({ key: MEDS, value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: ME, display_name: 'Rey Villar' }, { id: NEW, display_name: 'Test Family' }]) : json([])))
    await sync()
    expect(getsOf('medications')).toHaveLength(2)
    expect(await held()).toBeTruthy()
  })
})

describe('new person: when the cursors are cleared, and my own id', () => {
  it('the cursors are cleared before the person is stored: a throw while storing loses nothing', async () => {
    await hdb.people.put({ id: ME, name: 'Rey Villar' })
    await db.kv.put({ key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: ME, display_name: 'Rey Villar' }, { id: NEW, display_name: 'Test Family' }]) : json([])))
    vi.spyOn(hdb.people, 'bulkPut').mockRejectedValueOnce(new Error('app killed'))
    await sync()
    expect(await hdb.people.get(NEW)).toBeUndefined()
    expect(await db.kv.get('sync.cursor.readings')).toBeUndefined()
  })
  it('a member attached to an existing person: my own id is new, so the tables are re-read once', async () => {
    await hdb.people.put({ id: OLD, name: 'Test Old' })
    await db.kv.put({ key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: OLD, display_name: 'Test Old' }, { id: ME, display_name: 'Rey Villar' }]) : json([])))
    await sync()
    const gets = getsOf('readings')
    expect(gets).toHaveLength(2)
    expect(gets[1].url).not.toContain('gte')
  })
  it('personId null, first-ever read, cursors held, own row archived: one read of the tables, and the self id is stored', async () => {
    const ARCH = '55555555-5555-4555-8555-555555555555'
    who.id = null
    await db.kv.put({ key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: ARCH, display_name: 'Rey Villar', auth_user_id: USER }]) : json([])))
    await sync()
    expect(getsOf('readings')).toHaveLength(1)
    expect((await db.kv.get('profile.selfId'))?.value).toBe(ARCH)
  })
  it('my own id on a first-ever people read is not new: one read only', async () => {
    await db.kv.put({ key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' })
    mockFetch((c) => (c.url.includes('/people?') ? json([{ id: ME, display_name: 'Rey Villar' }]) : json([])))
    await sync()
    expect(getsOf('readings')).toHaveLength(1)
  })
})

describe('one-shot cursor reset', () => {
  const cursor = { key: 'sync.cursor.readings', value: '2026-10-03T00:00:00+00:00' }
  it('runs once, after a successful pull: the first sync reads from the start, the next uses the cursor', async () => {
    await db.kv.delete(CURSOR_RESET_KEY)
    await db.kv.put(cursor)
    mockFetch(() => json([]))
    await sync()
    expect(getsOf('readings')[0].url).not.toContain('gte')
    expect((await db.kv.get(CURSOR_RESET_KEY))?.value).toBe(true)
    await db.kv.put(cursor)
    await syncNow(true)
    expect(getsOf('readings')[1].url).toContain('gte')
  })
  it('a failed pull leaves it unset, so the next sync resets again', async () => {
    await db.kv.delete(CURSOR_RESET_KEY)
    await db.kv.put(cursor)
    mockFetch((c) => (c.url.includes('/people?') ? json({ code: 'PGRST' }, 500) : json([])))
    await sync()
    expect(await db.kv.get(CURSOR_RESET_KEY)).toBeUndefined()
    mockFetch(() => json([]))
    await db.kv.delete('sync.backoff')
    resetSyncForTests()
    await sync()
    expect((await db.kv.get(CURSOR_RESET_KEY))?.value).toBe(true)
  })
  it('a phone that is not the owner never runs it and never spends it (a late 0046 or owner line cannot use it up)', async () => {
    who.owner = false
    await db.kv.delete(CURSOR_RESET_KEY)
    await db.kv.put(cursor)
    mockFetch(() => json([]))
    await sync()
    expect(getsOf('readings')[0].url).toContain('gte') // the cursor is kept
    expect(await db.kv.get(CURSOR_RESET_KEY)).toBeUndefined()
    who.owner = true // the owner line lands later: the next sync runs it
    await db.kv.delete('sync.backoff')
    await syncNow(true)
    expect(getsOf('readings')[1].url).not.toContain('gte')
    expect((await db.kv.get(CURSOR_RESET_KEY))?.value).toBe(true)
  })
  it('a sync that did not pull (no token) does not use it up', async () => {
    await db.kv.delete(CURSOR_RESET_KEY)
    mockFetch(() => json([]))
    startSync({ url: URL, key: 'pk', getToken: async () => null })()
    await syncNow()
    expect(await db.kv.get(CURSOR_RESET_KEY)).toBeUndefined()
  })
})

describe('late step totals', () => {
  const HOUR = '2026-10-01T06:00:00.000Z' // an exact UTC hour
  const local = (steps: number | null, over: Record<string, unknown> = {}) => ({ clientId: 'a-1', personId: ME, kind: 'steps', minutes: 60, steps, startedAt: HOUR, source: 'health-connect', ...over })
  const serverRow = (steps: number | null, over: Record<string, unknown> = {}) => ({ client_id: 'a-1', person_id: ME, kind: 'steps', minutes: 60, steps, started_at: HOUR, source: 'health-connect', created_at: '2026-10-01T07:00:00+00:00', updated_at: '2026-10-01T08:00:00+00:00', ...over })
  const pullActivity = async (row: Record<string, unknown>) => {
    mockFetch((c) => (c.url.includes('/activity?') ? json([row]) : json([])))
    await sync()
  }

  it('reads activity by updated_at', async () => {
    await pullActivity(serverRow(100))
    expect(getsOf('activity')[0].url).toContain('order=updated_at.asc')
  })
  it('a known sensor hour rises to the higher server total: 4000 -> 5200, still one row', async () => {
    await ldb.activity.add(local(4000) as never)
    await pullActivity(serverRow(5200))
    expect((await ldb.activity.toArray()).map((a) => a.steps)).toEqual([5200])
  })
  it('a lower total does not change it: 4000 stays when the server says 3000', async () => {
    await ldb.activity.add(local(4000) as never)
    await pullActivity(serverRow(3000))
    expect((await ldb.activity.toArray()).map((a) => a.steps)).toEqual([4000])
  })
  it('an equal total changes nothing and adds no duplicate', async () => {
    await ldb.activity.add(local(4000) as never)
    await pullActivity(serverRow(4000))
    expect(await ldb.activity.count()).toBe(1)
  })
  it('an unknown local total (null) takes the server total, and a null server total never lowers a real one', async () => {
    await ldb.activity.add(local(null) as never)
    await pullActivity(serverRow(250))
    expect((await ldb.activity.toArray()).map((a) => a.steps)).toEqual([250])
    await db.kv.delete('sync.cursor.activity')
    await pullActivity(serverRow(null))
    expect((await ldb.activity.toArray()).map((a) => a.steps)).toEqual([250])
  })
  it('a hidden old-shape row (30 minutes, off the hour) is left exactly as stored, also when the server total is higher', async () => {
    const old = { clientId: 'a-1', personId: ME, kind: 'steps', minutes: 30, steps: 700, startedAt: '2026-10-01T06:17:00.000Z', source: 'health-connect' }
    await ldb.activity.add(old as never)
    await pullActivity(serverRow(900, { minutes: 30, started_at: old.startedAt }))
    const raw = await rawActivity()
    expect(raw).toHaveLength(1)
    expect([raw[0].steps, raw[0].minutes]).toEqual([700, 30])
  })
  it('a manual row is not rewritten by the server copy', async () => {
    await ldb.activity.add(local(100, { source: 'manual', minutes: 20 }) as never)
    await pullActivity(serverRow(900, { source: 'manual', minutes: 20 }))
    expect((await ldb.activity.toArray()).map((a) => [a.steps, a.minutes])).toEqual([[100, 20]])
  })
  it('an unknown hour from the server is added once', async () => {
    await pullActivity(serverRow(1200))
    expect((await ldb.activity.toArray()).map((a) => [a.steps, clientOf(a)])).toEqual([[1200, 'a-1']])
    await db.kv.delete('sync.cursor.activity')
    await syncNow(true)
    expect(await ldb.activity.count()).toBe(1)
  })
  it('updated_at missing (0046 not applied): the read falls back to created_at, then pulls', async () => {
    mockFetch((c) => (c.url.includes('/activity?') ? (c.url.includes('order=updated_at') ? json({ code: '42703' }, 400) : json([serverRow(300)])) : json([])))
    await sync()
    const gets = getsOf('activity').map((c) => c.url)
    expect(gets).toHaveLength(2)
    expect(gets[1]).toContain('order=created_at.asc')
    expect((await ldb.activity.toArray()).map((a) => a.steps)).toEqual([300])
  })
})
const clientOf = (a: unknown) => (a as { clientId?: string }).clientId
