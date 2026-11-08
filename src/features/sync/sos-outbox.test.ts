import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, enqueue } from '../../db'
import { HELD_KEY, resetSyncForTests, startSync, syncNow } from './sync'
import { queuedNote } from './SyncStatus'
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

  describe('urgent rows are held, never dead-lettered', () => {
    const sos = (id: string) => enqueue('sos_events', 'insert', { id, personId: 'p1', at: '2026-10-26T10:00:00.000Z', lat: null, lon: null, gps: false, callTo: 'family' })
    const run = async () => { startSync({ url: URL, key: 'pk', getToken: async () => 'tok1' })(); await syncNow() }
    const answer = (status: number, code: string) => vi.stubGlobal('fetch', async (u: string) => (String(u).includes('sos_events') ? new Response(JSON.stringify({ code }), { status }) : new Response(null, { status: 201 })))
    /** Answers per SOS row: an insert is keyed by its body id, an update by the id in its URL; any other sos_events call answers 201 (200 with the row for a PATCH). Returns the calls in order. */
    const answerRows = (byId: Record<string, [number, string] | 'zero'>) => {
      const calls: string[] = []
      vi.stubGlobal('fetch', async (u: string, init: RequestInit = {}) => {
        if (!String(u).includes('sos_events')) return new Response(null, { status: 201 })
        const patch = init.method === 'PATCH'
        const id = patch ? decodeURIComponent(String(u).split('id=eq.')[1]) : String(JSON.parse(String(init.body)).id)
        calls.push((patch ? 'PATCH ' : 'POST ') + id)
        const a = byId[id]
        if (a === 'zero') return new Response('[]', { status: 200 })
        if (a) return new Response(JSON.stringify({ code: a[1] }), { status: a[0] })
        return patch ? new Response(JSON.stringify([{ id }]), { status: 200 }) : new Response(null, { status: 201 })
      })
      return calls
    }

    for (const [status, code] of [[400, 'PGRST100'], [403, '42501'], [404, 'PGRST116'], [409, '23505'], [422, 'X422'], [418, 'X418']] as const) {
      it(`HTTP ${status} keeps the SOS queued with its code, tries not used`, async () => {
        await sos('u' + status)
        answer(status, code)
        await run()
        const [row] = await db.outbox.toArray()
        expect(await db.outbox.count()).toBe(1)
        expect(row.lastCode).toBe(code)
        expect(row.tries).toBe(0)
        expect(await db.kv.get('sync.dead')).toBeUndefined()
      })
    }
    it('a 403 at tries 4 (the old MAX_TRIES 4xx path) is still held', async () => {
      const id = await db.outbox.add({ table: 'sos_events', op: 'insert', payload: { id: 'm2', personId: 'p1', at: '2026-10-26T10:00:00.000Z', lat: null, lon: null, gps: false, callTo: 'family' }, createdAt: 1, tries: 4 })
      answer(403, '42501')
      await run()
      const row = await db.outbox.get(id)
      expect(row?.lastCode).toBe('42501')
      expect(row?.lastStatus).toBe(403)
      expect(queuedNote(row!)).toBe('The server said this phone is not allowed to save it. It will keep trying. Code 42501.')
      expect(await db.kv.get('sync.dead')).toBeUndefined()
    })
    it('a bare 404 (no table code) on sos_events_update is held as its own answer and stays queued', async () => {
      await enqueue('sos_events_update', 'update', { id: 'e9', cancelledAt: '2026-10-26T10:05:00.000Z' })
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'PGRST116' }), { status: 404 }))
      await run()
      expect(await db.outbox.count()).toBe(1)
      expect(await db.kv.get('sync.dead')).toBeUndefined()
    })
    it('sos_events_update answering 200 with no rows is held, not dead-lettered as 0rows', async () => {
      await enqueue('sos_events_update', 'update', { id: 'e8', cancelledAt: '2026-10-26T10:05:00.000Z' })
      vi.stubGlobal('fetch', async () => new Response('[]', { status: 200 }))
      await run()
      const [row] = await db.outbox.toArray()
      expect(row.lastCode).toBe('0rows')
      expect(await db.kv.get('sync.dead')).toBeUndefined()
    })
    it('a newer SOS is never blocked by older held ones (0rows PATCH and 403 PATCH, then a new insert)', async () => {
      await enqueue('sos_events_update', 'update', { id: 'old1', cancelledAt: '2026-10-26T09:00:00.000Z' })
      await enqueue('sos_events_update', 'update', { id: 'old2', cancelledAt: '2026-10-26T09:01:00.000Z' })
      await sos('new1')
      const calls = answerRows({ old1: 'zero', old2: [403, '42501'] })
      await run()
      expect(calls).toContain('POST new1') // invariant: the newest emergency goes out in the same run
      expect(calls.filter((c) => c === 'PATCH old1')).toHaveLength(1) // a held row is tried once per run, not every pass
      const left = await db.outbox.toArray()
      expect(left.map((r) => (r.payload as { id: string }).id).sort()).toEqual(['old1', 'old2'])
      expect(left.find((r) => (r.payload as { id: string }).id === 'old1')?.lastCode).toBe('0rows')
      expect(left.find((r) => (r.payload as { id: string }).id === 'old2')?.lastCode).toBe('42501')
      expect(await db.kv.get('sync.dead')).toBeUndefined() // invariant: an SOS row is never dead-lettered
    })
    it('the reverse order (older insert answering 409, newer PATCH after it) also sends the newer one', async () => {
      await sos('old3')
      await enqueue('sos_events_update', 'update', { id: 'new2', cancelledAt: '2026-10-26T10:05:00.000Z' })
      const calls = answerRows({ old3: [409, '23505'] })
      await run()
      expect(calls).toContain('PATCH new2')
      expect((await db.outbox.toArray()).map((r) => (r.payload as { id: string }).id)).toEqual(['old3'])
      expect(await db.kv.get('sync.dead')).toBeUndefined()
    })
    it('a 409 holds only that SOS (the next one goes); so does a 500: every server answer on an SOS row belongs to that row', async () => {
      await sos('s1')
      await sos('s2')
      const c1 = answerRows({ s1: [409, 'X'] })
      await run()
      expect(c1).toEqual(['POST s1', 'POST s2'])
      expect((await db.outbox.toArray()).map((r) => (r.payload as { id: string }).id)).toEqual(['s1'])
      await db.outbox.clear(); await db.kv.clear(); resetSyncForTests()
      await sos('s3')
      await sos('s4')
      const c2 = answerRows({ s3: [500, 'X500'] })
      await run()
      expect(c2).toEqual(['POST s3', 'POST s4']) // a 5xx no longer holds the table: the newer SOS is tried in the same run
      expect((await db.outbox.toArray()).map((r) => (r.payload as { id: string }).id)).toEqual(['s3'])
      expect(await db.kv.get('sync.dead')).toBeUndefined()
    })
    it('non-urgent rows behind a row-held SOS still go', async () => {
      await sos('s5')
      await enqueue('family_notes', 'insert', { id: 3, text: 'c' })
      answerRows({ s5: [403, '42501'] })
      await run()
      expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['sos_events'])
    })
    it('a row already at MAX_TRIES is still held, not parked', async () => {
      const id = await db.outbox.add({ table: 'sos_events', op: 'insert', payload: { id: 'm1', personId: 'p1', at: '2026-10-26T10:00:00.000Z', lat: null, lon: null, gps: false, callTo: 'family' }, createdAt: 1, tries: 4 })
      answer(500, 'X500')
      await run()
      expect((await db.outbox.get(id))?.tries).toBe(4)
      expect(await db.kv.get('sync.dead')).toBeUndefined()
    })
    it('a perm error on a non-urgent row still parks it, and rows behind a held SOS still go', async () => {
      await sos('h1')
      await enqueue('family_notes', 'insert', { id: 1, text: 'a' })
      const seen: string[] = []
      vi.stubGlobal('fetch', async (u: string) => { seen.push(String(u)); return String(u).includes('sos_events') ? new Response(JSON.stringify({ code: 'X' }), { status: 409 }) : new Response(null, { status: 201 }) })
      await run()
      expect(seen.some((u) => u.includes('family_notes'))).toBe(true)
      expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['sos_events'])
      expect(await db.kv.get('sync.dead')).toBeUndefined()
    })
    /** Answers per `METHOD id` for SOS rows (insert keyed by body id, update by the id in its URL); every pull read answers [] and any other row 201. Returns the SOS calls in order. */
    type A = 'ok' | 'zero' | [number, string]
    const answerKeys = (by: Record<string, A>) => {
      const calls: string[] = []
      vi.stubGlobal('fetch', async (u: string, init: RequestInit = {}) => {
        const m = init.method ?? 'GET'
        if (m === 'GET' || String(u).includes('/rpc/')) return new Response('[]', { status: 200 })
        if (!String(u).includes('sos_events')) return new Response(null, { status: 201 })
        const id = m === 'PATCH' ? decodeURIComponent(String(u).split('id=eq.')[1]) : String(JSON.parse(String(init.body)).id)
        const key = `${m} ${id}`
        calls.push(key)
        const a = by[key] ?? 'ok'
        if (a === 'zero') return new Response('[]', { status: 200 })
        if (a !== 'ok') return new Response(JSON.stringify({ code: a[1] }), { status: a[0] })
        return m === 'PATCH' ? new Response(JSON.stringify([{ id }]), { status: 200 }) : new Response(null, { status: 201 })
      })
      return calls
    }
    const cancel = (id: string) => enqueue('sos_events_update', 'update', { id, cancelledAt: '2026-10-26T10:05:00.000Z' })
    const ids = async () => (await db.outbox.toArray()).map((r) => `${r.op === 'insert' ? 'POST' : 'PATCH'} ${(r.payload as { id: string }).id}`)

    it('an older SOS held by a 403 and its queued cancel never block a newer SOS and its cancel (insert-queued waits per row)', async () => {
      await sos('A')
      await cancel('A')
      await sos('B')
      await cancel('B')
      const calls = answerKeys({ 'POST A': [403, '42501'] })
      await run()
      expect(calls).toEqual(['POST A', 'POST B', 'PATCH B']) // B and its cancel in the same run; A's cancel waits with A and is never sent
      expect(await ids()).toEqual(['POST A', 'PATCH A'])
      expect(await db.kv.get('sync.dead')).toBeUndefined()
      expect(await db.kv.get('sync.backoff')).toBeUndefined() // a held SOS is not a run failure
    })
    it('the same when the older cancel is queued before its insert (the cancel finds its insert queued and waits alone)', async () => {
      await cancel('A')
      await sos('A')
      await sos('B')
      await cancel('B')
      const calls = answerKeys({ 'POST A': [403, '42501'], 'PATCH A': 'zero' })
      await run()
      expect(calls).toContain('POST B')
      expect(calls).toContain('PATCH B')
      expect(await ids()).toEqual(['PATCH A', 'POST A'])
    })

    it('invariant over mixed orders: no older held SOS row ever blocks a newer SOS row, no row is tried twice in one sync, none is parked', async () => {
      let seed = 23
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]
      const fails: A[] = [[400, 'PGRST100'], [403, '42501'], [404, 'PGRST116'], [409, '23505'], [418, 'X418'], [422, 'X422'], [429, ''], [500, 'X500'], [503, ''], [504, '57014']]
      for (let c = 0; c < 120; c++) {
        await Promise.all([db.outbox.clear(), db.kv.clear()]); resetSyncForTests()
        const by: Record<string, A> = {}
        const older: { op: 'insert' | 'update'; id: string }[] = []
        for (let e = 0, n = 1 + Math.floor(rnd() * 3); e < n; e++) {
          const id = `o${c}-${e}`
          const hasInsert = rnd() < 0.7
          if (hasInsert) { older.push({ op: 'insert', id }); by[`POST ${id}`] = rnd() < 0.8 ? pick(fails) : 'ok' }
          if (!hasInsert || rnd() < 0.7) { older.push({ op: 'update', id }); by[`PATCH ${id}`] = rnd() < 0.8 ? pick<A>([...fails, 'zero']) : 'ok' }
        }
        for (let i = older.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [older[i], older[j]] = [older[j], older[i]] } // any order, a cancel before its insert too
        for (const r of older) await (r.op === 'insert' ? sos(r.id) : cancel(r.id))
        await sos(`n${c}`) // the newest emergency and its cancel, queued last
        await cancel(`n${c}`)
        await enqueue('family_notes', 'insert', { id: c, text: 'n' })
        const calls = answerKeys(by)
        await run()
        const why = JSON.stringify({ older, by })
        expect(calls, why).toContain(`POST n${c}`)
        expect(calls, why).toContain(`PATCH n${c}`)
        expect(new Set(calls).size, why).toBe(calls.length) // each row tried at most once per sync
        const left = await ids()
        expect(left.some((k) => k.endsWith(` n${c}`)), why).toBe(false)
        for (const [k, a] of Object.entries(by)) if (a !== 'ok' && calls.includes(k)) expect(left, why).toContain(k) // a failing SOS row stays queued
        expect((await db.outbox.toArray()).some((r) => r.table === 'family_notes'), why).toBe(false)
        expect(await db.kv.get('sync.dead'), why).toBeUndefined()
      }
    })

    it('a held SOS waits out its own next-try time; non-urgent rows sync on schedule meanwhile and sync is never put into backoff', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const t0 = new Date('2026-10-26T10:00:00.000Z').getTime()
      vi.setSystemTime(t0)
      try {
        await sos('h')
        await enqueue('family_notes', 'insert', { id: 1, text: 'a' })
        const calls = answerKeys({ 'POST h': [403, '42501'] })
        await run()
        expect(calls).toEqual(['POST h'])
        expect((await db.kv.get(HELD_KEY))?.value).toEqual({ [(await db.outbox.toArray())[0].id!]: { fails: 1, nextAt: t0 + 60_000 } })
        expect(await db.kv.get('sync.backoff')).toBeUndefined()
        await enqueue('family_notes', 'insert', { id: 2, text: 'b' })
        vi.setSystemTime(t0 + 30_000)
        await syncNow() // the 5-minute timer or a nudge: an ordinary, unforced sync
        expect(calls).toEqual(['POST h']) // not due yet: not tried
        expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['sos_events']) // the note went on schedule
        vi.setSystemTime(t0 + 61_000)
        await syncNow()
        expect(calls).toEqual(['POST h', 'POST h']) // due: tried once more, next wait 2 minutes
        expect(Object.values((await db.kv.get(HELD_KEY))?.value as object)).toEqual([{ fails: 2, nextAt: t0 + 61_000 + 120_000 }])
        expect(await db.kv.get('sync.backoff')).toBeUndefined()
        await syncNow(true) // Send now / back online: tried at once, whatever its wait
        expect(calls).toHaveLength(3)
        answerKeys({})
        await syncNow(true)
        expect(await db.outbox.count()).toBe(0)
        await syncNow(true)
        expect((await db.kv.get(HELD_KEY))?.value).toEqual({}) // a sent row forgets its wait
      } finally { vi.useRealTimers() }
    })

    it('bound: held rows before their next-try time cost no request and no drain pass; due ones are tried once per sync', async () => {
      for (let i = 0; i < 8; i++) await sos(`old${i}`)
      const by = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`POST old${i}`, [403, '42501'] as A]))
      let calls = answerKeys(by)
      const passes = vi.spyOn(db.outbox, 'orderBy')
      await run()
      expect(calls).toHaveLength(8) // all due on the first sync: each once
      expect(passes).toHaveBeenCalledTimes(9) // one drain pass per held row, then the final pass
      passes.mockClear()
      await sos('new')
      calls = answerKeys(by)
      await syncNow()
      expect(calls).toEqual(['POST new']) // the eight are inside their wait: skipped
      expect(passes).toHaveBeenCalledTimes(1)
      passes.mockClear()
      for (let i = 0; i < 4; i++) await sos(`more${i}`)
      calls = answerKeys(Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`POST more${i}`, [500, 'X500'] as A])))
      startSync({ url: URL, key: 'pk', getToken: async () => 'tok1' })()
      await syncNow(true) // forced and joined to startSync's flight: that flight runs twice, yet no held row is tried twice
      expect([...calls].sort()).toEqual([...Array.from({ length: 4 }, (_, i) => `POST more${i}`), ...Array.from({ length: 8 }, (_, i) => `POST old${i}`)].sort())
      passes.mockRestore()
    })

    it('a non-urgent row answering 409 is still dead-lettered', async () => {
      await enqueue('family_notes', 'insert', { id: 2, text: 'b' })
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'X' }), { status: 409 }))
      await run()
      expect(await db.outbox.count()).toBe(0)
      expect(((await db.kv.get('sync.dead'))?.value as unknown[]).length).toBe(1)
    })
  })
})
