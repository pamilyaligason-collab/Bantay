import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, enqueue } from '../../db'
import { resetSyncForTests, startSync, syncNow } from './sync'
import { toRow } from './tables'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const URL = 'https://x.supabase.test'
beforeEach(async () => {
  await Promise.all([db.outbox.clear(), db.kv.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('SOS outbox specs', () => {
  it('sos_events insert carries id and a sent_at stamp, no client_id, no late flag', async () => {
    await enqueue('sos_events', 'insert', { id: 'e1', personId: 'p1', at: '2026-10-26T10:00:00.000Z', lat: null, lon: null, gps: false, callTo: 'family', late: false })
    const sent: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      sent.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(null, { status: 201 })
    })
    const t0 = Date.now()
    startSync({ url: URL, key: 'pk', getToken: async () => 'tok1' })()
    await syncNow()
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toContain('/rest/v1/sos_events?on_conflict=id')
    const b = sent[0].body
    expect(b.id).toBe('e1')
    expect(b.person_id).toBe('p1')
    expect(b.lat).toBeNull() // unknown stays null, never 0
    expect(b).not.toHaveProperty('client_id')
    expect(b).not.toHaveProperty('late') // the server decides
    expect(Date.parse(String(b.sent_at))).toBeGreaterThanOrEqual(t0)
    expect(await db.outbox.count()).toBe(0)
  })
  it('a retried sos_events send carries a fresh sent_at, not the first one (disclosed: not saved on the row)', async () => {
    await enqueue('sos_events', 'insert', { id: 'e2', personId: 'p1', at: '2026-10-26T10:00:00.000Z', lat: null, lon: null, gps: false, callTo: 'family' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'))
    const stamps: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit = {}) => {
      stamps.push(String(JSON.parse(String(init.body)).sent_at))
      vi.setSystemTime(new Date('2026-10-26T10:07:00.000Z')) // the phone is back online seven minutes later
      return new Response(null, { status: stamps.length === 1 ? 503 : 201 })
    })
    try {
      startSync({ url: URL, key: 'pk', getToken: async () => 'tok1' })()
      await syncNow()
      await syncNow(true) // ignore the backoff window
    } finally { vi.useRealTimers() }
    expect(stamps[0]).toBe('2026-10-26T10:00:00.000Z')
    expect(stamps[1]).toBe('2026-10-26T10:07:00.000Z')
    expect((await db.outbox.toArray()).every((r) => !('sentAt' in (r.payload as object)))).toBe(true)
  })
  it('an SOS pushed before 0031 is applied stays queued (404 PGRST205), never dead-lettered', async () => {
    await enqueue('sos_events', 'insert', { id: 'e3', personId: 'p1', at: '2026-10-26T10:00:00.000Z', lat: null, lon: null, gps: false, callTo: 'family' })
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 }))
    startSync({ url: URL, key: 'pk', getToken: async () => 'tok1' })()
    await syncNow()
    expect(await db.outbox.count()).toBe(1)
    expect(await db.kv.get('sync.dead')).toBeUndefined()
  })
  it('sos_events_update is a PATCH of sos_events by id with only the granted columns', async () => {
    await enqueue('sos_events_update', 'update', { id: 'e1', cancelledAt: '2026-10-26T10:05:00.000Z', personId: 'x', at: 'y' })
    const calls: { url: string; method?: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method, body: JSON.parse(String(init.body)) })
      return new Response('[{"id":"e1"}]', { status: 200 })
    })
    startSync({ url: URL, key: 'pk', getToken: async () => 'tok1' })()
    await syncNow()
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url).toContain('/rest/v1/sos_events?id=eq.e1')
    expect(calls[0].body).toEqual({ cancelled_at: '2026-10-26T10:05:00.000Z' })
  })
  it('sos_acks and phone_health map to snake_case without client_id', () => {
    expect(toRow('sos_acks', { eventId: 'e1', seenAt: 'T' })).toEqual({ event_id: 'e1', seen_at: 'T' })
    expect(toRow('phone_health', { userId: 'u', alarmsOk: null, callOk: false }, 'cid')).toEqual({ user_id: 'u', alarms_ok: null, call_ok: false })
  })
})
