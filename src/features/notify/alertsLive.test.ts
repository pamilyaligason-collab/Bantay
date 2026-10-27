import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A mocked Realtime channel and a mocked REST table: nothing leaves the test.
const h = vi.hoisted(() => {
  const state = {
    native: false,
    handler: null as null | ((p: { eventType: string; new?: unknown; old?: unknown }) => void),
    channels: [] as string[], removed: 0, subscribed: 0,
    selects: 0, rows: [] as unknown[], updates: [] as { patch: unknown; ids: unknown }[],
    appHandler: null as null | ((s: { isActive: boolean }) => void), appRemoved: 0,
    gate: null as null | Promise<void>,
    uid: 'u1' as string | null, authCb: null as null | ((e: string, s: { user: { id: string } } | null) => void)
  }
  const builder = () => {
    const b: Record<string, unknown> = {}
    b.select = () => { state.selects++; return b }
    b.gt = () => b; b.order = () => b; b.limit = () => b
    b.then = (ok: (v: unknown) => unknown) => (state.gate ?? Promise.resolve()).then(() => ({ data: state.rows, error: null })).then(ok)
    b.update = (patch: unknown) => {
      const u: Record<string, unknown> = {}
      const done = (ids: unknown) => { state.updates.push({ patch, ids }); return Promise.resolve({ error: null }) }
      u.eq = (_c: string, id: unknown) => done(id)
      u.in = (_c: string, ids: unknown) => done(ids)
      return u
    }
    return b
  }
  const supabase = {
    channel: (name: string) => {
      state.channels.push(name)
      const ch = { on: (_t: string, _f: unknown, cb: (p: never) => void) => { state.handler = cb as never; return ch }, subscribe: () => { state.subscribed++; return ch } }
      return ch
    },
    removeChannel: () => { state.removed++; return Promise.resolve('ok') },
    from: () => builder(),
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.uid ? { user: { id: state.uid } } : null } }),
      onAuthStateChange: (cb: never) => { state.authCb = cb; return { data: { subscription: { unsubscribe: () => { state.authCb = null } } } } }
    }
  }
  return { state, supabase }
})
vi.mock('../auth/client', () => ({ supabase: h.supabase }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.state.native } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_e: string, cb: (s: { isActive: boolean }) => void) => { h.state.appHandler = cb; return { remove: async () => { h.state.appRemoved++ } } } } }))

import { pollAlerts, startAlertsLive, watchAlertsForSession } from './alertsLive'
import { db } from '../../db'
import { adb, markSeen, unseenCount, visibleAlerts } from './store'

const future = new Date(Date.now() + 86_400_000).toISOString()
const srv = (id: string, o: Record<string, unknown> = {}) => ({ id, person_id: 'p1', kind: 'dose_missed', template: 'dose_missed', ref: `r:${id}`, created_at: new Date().toISOString(), pushed_at: null, seen_at: null, expires_at: future, ...o })
const settle = () => new Promise((r) => setTimeout(r, 150))
/** Wait for the app's own settled state, not a sleep (ML-25). */
const until = async (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 25)); expect(cond()).toBe(true) }

beforeEach(async () => {
  Object.assign(h.state, { native: false, handler: null, channels: [], removed: 0, subscribed: 0, selects: 0, rows: [], updates: [], appHandler: null, appRemoved: 0, gate: null, uid: 'u1', authCb: null })
  await adb.alerts.clear()
  await db.kv.delete('alerts.inapp.ok')
  localStorage.clear()
})
afterEach(() => { vi.useRealTimers() })

describe('startAlertsLive', () => {
  it('subscribes for this user, polls once at start, and an INSERT payload lands in the store and moves the badge', async () => {
    const stop = startAlertsLive('u1')
    await settle()
    expect(h.state.channels).toEqual(['carer_alerts:u1'])
    expect(h.state.subscribed).toBe(1)
    expect(h.state.selects).toBe(1)
    expect(await unseenCount()).toBe(0)
    h.state.handler!({ eventType: 'INSERT', new: srv('a1', { kind: 'sos', template: 'family_sos' }) })
    await settle()
    expect(await unseenCount()).toBe(1)
    const rows = await visibleAlerts()
    expect(rows[0]).toMatchObject({ id: 'a1', kind: 'sos', template: 'family_sos', personId: 'p1', seenAt: null })
    stop()
  })
  it('a DELETE payload (the 30-day prune) changes nothing', async () => {
    const stop = startAlertsLive('u1')
    await settle()
    h.state.handler!({ eventType: 'INSERT', new: srv('a1') })
    await settle()
    h.state.handler!({ eventType: 'DELETE', old: { id: 'a1' } })
    await settle()
    expect((await visibleAlerts()).map((r) => r.id)).toEqual(['a1'])
    stop()
  })
  it('an UPDATE of seen_at (another device) marks the row seen; an unknown kind or a bad row is dropped', async () => {
    const stop = startAlertsLive('u1')
    await settle()
    h.state.handler!({ eventType: 'INSERT', new: srv('a1') })
    h.state.handler!({ eventType: 'INSERT', new: srv('bad', { kind: 'from_the_future' }) })
    h.state.handler!({ eventType: 'INSERT', new: { id: 'junk' } })
    await settle()
    expect((await visibleAlerts()).map((r) => r.id)).toEqual(['a1'])
    h.state.handler!({ eventType: 'UPDATE', new: srv('a1', { seen_at: new Date().toISOString() }) })
    await settle()
    expect(await unseenCount()).toBe(0)
    stop()
  })
  it('rows past expires_at are hidden from the badge and the list', async () => {
    await adb.alerts.put({ id: 'old', personId: 'p1', kind: 'dose_missed', template: 'dose_missed', ref: null, createdAt: '2026-10-01T00:00:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-10-08T00:00:00Z' })
    await adb.alerts.put({ id: 'new', personId: 'p1', kind: 'dose_missed', template: 'dose_missed', ref: null, createdAt: '2026-10-20T00:00:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-10-27T00:00:00Z' })
    expect((await visibleAlerts(new Date('2026-10-26T00:00:00Z'))).map((r) => r.id)).toEqual(['new'])
    expect(await unseenCount(new Date('2026-10-26T00:00:00Z'))).toBe(1)
    expect(await unseenCount(new Date('2026-10-28T00:00:00Z'))).toBe(0)
  })
  it('web: hidden unsubscribes; visible again resubscribes AND polls exactly once', async () => {
    const stop = startAlertsLive('u1')
    await settle()
    expect([h.state.subscribed, h.state.selects, h.state.removed]).toEqual([1, 1, 0])
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.state.removed).toBe(1)
    expect(h.state.selects).toBe(1) // nothing polled while hidden
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await until(() => h.state.selects === 2)
    expect([h.state.subscribed, h.state.selects]).toEqual([2, 2])
    stop()
    expect(h.state.removed).toBe(2)
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(h.state.subscribed).toBe(2) // stopped: no listener left
  })
  it('native: appStateChange inactive unsubscribes, active resubscribes and polls once', async () => {
    h.state.native = true
    const stop = startAlertsLive('u1')
    await settle()
    expect(h.state.appHandler).not.toBeNull()
    h.state.appHandler!({ isActive: false })
    expect(h.state.removed).toBe(1)
    h.state.appHandler!({ isActive: true })
    await until(() => h.state.selects === 2)
    expect([h.state.subscribed, h.state.selects]).toEqual([2, 2])
    stop()
    await settle()
    expect(h.state.appRemoved).toBe(1)
  })
  it('the 30 s poll is the safety net while open, and it stops with the stop function', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const stop = startAlertsLive('u1')
    await settle() // the first poll finishes (real timers still run) before the interval is driven
    const base = h.state.selects
    await vi.advanceTimersByTimeAsync(30_000)
    expect(h.state.selects).toBe(base + 1)
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.state.selects).toBe(base + 1)
  })
})

describe('pollAlerts and seen marks', () => {
  it('the first answer from the table sets kv alerts.inapp.ok (re-enables the switch-to-app banner)', async () => {
    expect((await db.kv.get('alerts.inapp.ok'))?.value).toBeUndefined()
    h.state.rows = [srv('a1')]
    await pollAlerts()
    expect((await db.kv.get('alerts.inapp.ok'))?.value).toBe(true)
  })
  it('a failed query (table missing before 0030, offline) never sets it', async () => {
    h.state.rows = null as never
    await pollAlerts()
    expect((await db.kv.get('alerts.inapp.ok'))?.value).toBeUndefined()
  })
  it('returns the number of new rows and keeps a seen mark made offline, then tells the server', async () => {
    h.state.rows = [srv('a1'), srv('a2')]
    expect(await pollAlerts()).toBe(2)
    expect(await pollAlerts()).toBe(0)
    await markSeen('a1') // local first
    expect(h.state.updates.map((u) => u.ids)).toEqual(['a1'])
    h.state.updates = []
    // the server write failed earlier: it still says unseen, the poll must not undo the local mark and must repeat the write
    h.state.rows = [srv('a1'), srv('a2')]
    await pollAlerts()
    expect((await adb.alerts.get('a1'))!.seenAt).not.toBeNull()
    expect(h.state.updates).toHaveLength(1)
    expect(h.state.updates[0]!.ids).toEqual(['a1'])
    expect(await unseenCount()).toBe(1)
  })
  it('keeps at most 200 rows locally', async () => {
    const t = Date.now()
    h.state.rows = Array.from({ length: 205 }, (_, i) => srv(`r${i}`, { created_at: new Date(t - i * 1000).toISOString() }))
    await pollAlerts()
    expect(await adb.alerts.count()).toBe(200)
    expect(await adb.alerts.get('r0')).toBeTruthy()
    expect(await adb.alerts.get('r204')).toBeUndefined()
  })
})

describe('watchAlertsForSession (App.tsx hook)', () => {
  it('starts for the signed-in user, switches clean for another person, and clears on sign-out (ML-07)', async () => {
    const stop = watchAlertsForSession()
    await settle()
    expect(h.state.channels).toEqual(['carer_alerts:u1'])
    h.state.handler!({ eventType: 'INSERT', new: srv('a1') })
    await settle()
    expect(await adb.alerts.count()).toBe(1)
    h.state.authCb!('TOKEN_REFRESHED', { user: { id: 'u1' } }) // same person: nothing restarts
    await settle()
    expect(h.state.channels).toEqual(['carer_alerts:u1'])
    h.state.authCb!('SIGNED_IN', { user: { id: 'u2' } }) // someone else on this phone
    await settle()
    expect(await adb.alerts.count()).toBe(0)
    expect(h.state.channels).toEqual(['carer_alerts:u1', 'carer_alerts:u2'])
    h.state.handler!({ eventType: 'INSERT', new: srv('b1') })
    await settle()
    h.state.authCb!('SIGNED_OUT', null)
    await settle()
    expect(await adb.alerts.count()).toBe(0)
    expect(h.state.removed).toBeGreaterThanOrEqual(2)
    stop()
  })
  it('a different person signing in after a restart also starts clean', async () => {
    localStorage.setItem('bantay.alerts.uid', 'u0')
    await adb.alerts.put({ id: 'old', personId: null, kind: 'system', template: 'system', ref: null, createdAt: new Date().toISOString(), pushedAt: null, seenAt: null, expiresAt: future })
    const stop = watchAlertsForSession()
    await settle()
    expect(await adb.alerts.get('old')).toBeUndefined()
    expect(h.state.channels).toEqual(['carer_alerts:u1'])
    stop()
  })
})

describe('sign-out while a poll is in flight (audit S1 major)', () => {
  it('the late answer for the signed-out person is dropped; the next person starts with an empty store', async () => {
    let release!: () => void
    h.state.gate = new Promise<void>((r) => { release = r })
    h.state.rows = [srv('a1')]
    const stop = watchAlertsForSession()
    await until(() => h.state.selects === 1) // user 1's poll is waiting on the network
    h.state.authCb!('SIGNED_OUT', null)
    h.state.gate = null
    release()
    await settle()
    expect(await adb.alerts.count()).toBe(0)
    h.state.rows = []
    h.state.authCb!('SIGNED_IN', { user: { id: 'u2' } })
    await settle()
    expect(await unseenCount()).toBe(0)
    stop()
  })
  it('a sign-out inside the IndexedDB (kv) await after the answer arrives still drops the rows', async () => {
    let release!: () => void
    const wait = new Promise<void>((r) => { release = r })
    let inKv = false
    const real = db.kv.get.bind(db.kv)
    const spy = vi.spyOn(db.kv, 'get').mockImplementation(((k: string) => { inKv = true; return wait.then(() => real(k)) }) as never)
    h.state.rows = [srv('a1')]
    const stop = watchAlertsForSession()
    await until(() => inKv) // the answer is in; the poll is parked on the kv read
    h.state.authCb!('SIGNED_OUT', null)
    release()
    await settle()
    spy.mockRestore()
    expect(await adb.alerts.count()).toBe(0)
    stop()
  })
})
