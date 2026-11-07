import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import runnerSrc from '../../../public/runners/bgplace.js?raw'

type Rpc = { data: unknown; error: null | { code?: string; message?: string } }
const h = vi.hoisted(() => ({
  dispatch: vi.fn(),
  self: 'pa' as string | null,
  native: true,
  keyN: 0,
  issue: null as null | ((n: number) => Rpc),
  revokeErr: false,
  rpc: vi.fn(),
  authCb: null as null | ((e: string) => void)
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native, getPlatform: () => (h.native ? 'android' : 'web'), isPluginAvailable: () => h.native } }))
vi.mock('@capacitor/background-runner', () => ({ BackgroundRunner: { dispatchEvent: h.dispatch } }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: () => Promise.resolve(h.self) }))
vi.mock('../auth/client', () => ({
  supabaseUrl: 'https://project.example.test',
  supabasePublishableKey: 'sb_publishable_test',
  supabase: { rpc: (...a: unknown[]) => h.rpc(...a), auth: { onAuthStateChange: (cb: (e: string) => void) => { h.authCb = cb; return { data: { subscription: { unsubscribe() {} } } } } } }
}))
import { bgPlaceClear, bgPlaceConfig, bgPlaceStart, bgPlaceStash, bgPlaceSync, bgKeyKey } from './bgPlace'
import { placeKey, placeNoticeKey } from './placeApi'

const lastDetails = () => h.dispatch.mock.calls.at(-1)![0].details
const settle = () => new Promise((r) => setTimeout(r, 40)) // only to let a finished test's trailing sync drain; assertions wait on state with until()
const until = (fn: () => void) => vi.waitFor(fn, { timeout: 4000, interval: 10 })
const dispatched = (match: object) => until(() => expect(lastDetails()).toMatchObject(match))
const revoked = (...keys: string[]) => until(() => expect(calls('device_place_key_revoke').map((c) => c[1])).toEqual(keys.map((k) => ({ p_key: k }))))
const calls = (name: string) => h.rpc.mock.calls.filter((c) => c[0] === name)
const keyOf = (n: number) => `bpk_test_key_${String(n).padStart(4, '0')}_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
const answered = (pid: string) => db.kv.put({ key: placeNoticeKey(pid), value: true })

beforeEach(async () => {
  await db.kv.clear()
  h.self = 'pa'; h.native = true; h.keyN = 0; h.revokeErr = false
  h.issue = (n) => ({ data: keyOf(n), error: null })
  h.dispatch.mockReset().mockResolvedValue(undefined)
  h.rpc.mockReset().mockImplementation((name: string) => {
    if (name === 'device_place_key_issue') return Promise.resolve(h.issue!(++h.keyN))
    if (name === 'device_place_key_revoke') return Promise.resolve({ data: null, error: h.revokeErr ? { message: 'offline' } : null })
    return Promise.resolve({ data: null, error: null })
  })
  localStorage.setItem('bantay.flag.places', '1')
})
afterEach(async () => { await settle(); await settle(); localStorage.clear() }) // let a watcher-triggered sync of this test finish before the next test resets the mocks

describe('bgPlaceConfig (D-138 gates, ML-46, D-150 key)', () => {
  it('is off before the person answered the notice, and issues no key', async () => {
    expect(await bgPlaceConfig('pa')).toEqual({ on: false })
    expect(calls('device_place_key_issue')).toHaveLength(0)
  })
  it('arms with this phone\'s place key once the notice is answered and sharing is on (on by default), never the sign-in token', async () => {
    await answered('pa')
    const cfg = await bgPlaceConfig('pa')
    expect(cfg).toEqual({ on: true, url: 'https://project.example.test', key: 'sb_publishable_test', pkey: keyOf(1) }) // no place, no fix: the daily run carries none (D-151)
    expect(JSON.stringify(cfg)).not.toMatch(/token|access/i)
    expect(calls('device_place_key_issue')[0]![1]).toEqual({ p_device: expect.stringMatching(/^.{8,}$/), p_label: 'android' })
  })
  it('is off when the switch is off, the map flag is off, nobody is signed in, or no key can be had', async () => {
    await answered('pa')
    await db.kv.put({ key: placeKey('pa'), value: false })
    expect(await bgPlaceConfig('pa')).toEqual({ on: false })
    await db.kv.put({ key: placeKey('pa'), value: true })
    expect((await bgPlaceConfig('pa')).on).toBe(true)
    localStorage.setItem('bantay.flag.places', '0')
    expect(await bgPlaceConfig('pa')).toEqual({ on: false })
    localStorage.setItem('bantay.flag.places', '1')
    expect(await bgPlaceConfig(null)).toEqual({ on: false })
    await db.kv.clear(); await answered('pa')
    h.issue = () => ({ data: null, error: { code: '42501' } })
    expect(await bgPlaceConfig('pa')).toEqual({ on: false })
    h.issue = () => ({ data: null, error: { code: '08006' } })
    expect(await bgPlaceConfig('pa')).toEqual({ on: false })
  })
  it('holds one key a day: no new issue within 24 hours, a new one after, and a network failure keeps the held key', async () => {
    await answered('pa')
    expect((await bgPlaceConfig('pa') as { pkey: string }).pkey).toBe(keyOf(1))
    expect((await bgPlaceConfig('pa') as { pkey: string }).pkey).toBe(keyOf(1))
    expect(calls('device_place_key_issue')).toHaveLength(1)
    await db.kv.put({ key: bgKeyKey('pa'), value: { k: keyOf(1), at: Date.now() - 25 * 3600 * 1000 } })
    expect((await bgPlaceConfig('pa') as { pkey: string }).pkey).toBe(keyOf(2))
    await db.kv.put({ key: bgKeyKey('pa'), value: { k: keyOf(2), at: Date.now() - 25 * 3600 * 1000 } })
    h.issue = () => ({ data: null, error: { code: '08006' } })
    expect((await bgPlaceConfig('pa') as { pkey: string }).pkey).toBe(keyOf(2))
    h.issue = () => ({ data: null, error: { code: '42501' } }) // the server says sharing is off for them: the held key is dropped, not reused
    expect(await bgPlaceConfig('pa')).toEqual({ on: false })
    expect(await db.kv.get(bgKeyKey('pa'))).toBeUndefined()
  })
  it('one shared phone: A says OK and is armed, A is gone, B signs in and has not answered: nothing armed for B and A\'s key is revoked', async () => {
    await answered('pa')
    expect(await bgPlaceSync('pa')).toBe('on')
    expect(lastDetails()).toMatchObject({ on: true, pkey: keyOf(1) })
    await db.kv.put({ key: 'place.sharing:pa', value: true })
    h.self = 'pb'
    expect(await bgPlaceSync('pb')).toBe('off')
    expect(lastDetails()).toEqual({ on: false })
    expect(calls('device_place_key_revoke').map((c) => c[1])).toEqual([{ p_key: keyOf(1) }])
    expect(await db.kv.get(bgKeyKey('pa'))).toBeUndefined()
  })
})

describe('bgPlaceSync and the watchers (registered at start, not after a place write)', () => {
  it('sends the configure event to the runner label and reports on / off; off revokes the key', async () => {
    await answered('pa')
    expect(await bgPlaceSync('pa')).toBe('on')
    expect(h.dispatch).toHaveBeenCalledWith(expect.objectContaining({ label: 'ph.bantay.family.place', event: 'configure' }))
    expect(lastDetails()).toMatchObject({ on: true })
    expect(Object.keys(lastDetails()).sort()).toEqual(['key', 'on', 'pkey', 'url'])
    expect(calls('device_place_key_revoke')).toHaveLength(0)
    expect(await bgPlaceSync(null)).toBe('off')
    expect(lastDetails()).toEqual({ on: false })
    expect(calls('device_place_key_revoke')).toHaveLength(1)
  })
  it('bgPlaceStart alone (no putLivePlace) follows the switch off, switch on again with a NEW key, and the notice wipe', async () => {
    await answered('pa')
    bgPlaceStart()
    await dispatched({ on: true, pkey: keyOf(1) })
    await db.kv.put({ key: placeKey('pa'), value: false }) // the person, or the owner via the server read-back
    await dispatched({ on: false })
    await revoked(keyOf(1))
    await db.kv.put({ key: placeKey('pa'), value: true })
    await dispatched({ on: true, pkey: keyOf(2) })
    await db.kv.delete(placeNoticeKey('pa'))
    await dispatched({ on: false })
    await revoked(keyOf(1), keyOf(2))
  })
  it('the Labs Family map flag, sign-out and another person signing in each disarm and revoke', async () => {
    await answered('pa')
    bgPlaceStart()
    await dispatched({ on: true, pkey: keyOf(1) })
    localStorage.setItem('bantay.flag.places', '0') // the Labs switch also reloads the app; a storage event covers a second tab
    window.dispatchEvent(new StorageEvent('storage', { key: 'bantay.flag.places' }))
    await dispatched({ on: false })
    await revoked(keyOf(1))
    localStorage.setItem('bantay.flag.places', '1')
    document.dispatchEvent(new Event('visibilitychange'))
    await dispatched({ on: true, pkey: keyOf(2) })
    h.authCb!('SIGNED_OUT')
    await dispatched({ on: false })
    await revoked(keyOf(1), keyOf(2))
    await db.kv.clear(); await answered('pa')
    h.authCb!('SIGNED_IN')
    await dispatched({ on: true, pkey: keyOf(3) })
    h.self = 'pb' // a different person signs in on the same phone and has not answered
    h.authCb!('SIGNED_IN')
    await dispatched({ on: false })
    await revoked(keyOf(1), keyOf(2), keyOf(3))
  })
  it('sign-out clear (the signOut hook) revokes and disarms before the wipe, and survives a plugin failure', async () => {
    await answered('pa')
    await bgPlaceSync('pa')
    h.dispatch.mockRejectedValue(new Error('boom'))
    expect(await bgPlaceClear()).toBe('unavailable')
    expect(calls('device_place_key_revoke')).toHaveLength(1)
    expect(await db.kv.get(bgKeyKey('pa'))).toBeUndefined()
  })
  it('a revoke that cannot reach the server is queued and retried at the next start', async () => {
    await answered('pa')
    await bgPlaceSync('pa')
    h.revokeErr = true
    await bgPlaceClear()
    expect((await db.kv.get('bgplace.revoke'))?.value).toEqual([keyOf(1)])
    h.revokeErr = false
    bgPlaceStart()
    await revoked(keyOf(1), keyOf(1))
    await until(async () => expect(await db.kv.get('bgplace.revoke')).toBeUndefined())
  })
  it('a hung runner cannot lose the key at sign-out: it is queued before the place. wipe and revoked when the dispatch ends (D-151)', async () => {
    await answered('pa')
    await bgPlaceSync('pa')
    h.revokeErr = true // the network is down too, so nothing can revoke before the wipe: only the queue can carry the key
    const hung: (() => void)[] = []
    h.dispatch.mockImplementation(() => new Promise<void>((ok) => { hung.push(ok) })) // every dispatch to the runner hangs
    void bgPlaceSync('pa') // a sync already stuck on its dispatch: the clear below waits behind it in the queue
    await until(() => expect(hung.length).toBeGreaterThan(0))
    await bgPlaceStash() // what signOut does first
    const clear = bgPlaceClear()
    await db.kv.bulkDelete((await db.kv.toCollection().primaryKeys()).filter((k) => String(k).startsWith('place.'))) // signOut's wipe, while the runner is still stuck
    expect((await db.kv.get('bgplace.revoke'))?.value).toEqual([keyOf(1)]) // the key survived the wipe, in the queue
    h.revokeErr = false
    let done = false
    void clear.then(() => { done = true })
    await until(() => { hung.splice(0).forEach((ok) => ok()); expect(done).toBe(true) })
    await until(() => expect(calls('device_place_key_revoke').at(-1)![1]).toEqual({ p_key: keyOf(1) }))
    await until(async () => expect(await db.kv.get('bgplace.revoke')).toBeUndefined())
  })
  it('swallows a plugin failure', async () => {
    await answered('pa')
    h.dispatch.mockRejectedValue(new Error('boom'))
    expect(await bgPlaceSync('pa')).toBe('unavailable')
  })
  it('on the web it does nothing at all: no key is issued, nothing is sent', async () => {
    h.native = false
    await answered('pa')
    expect(await bgPlaceSync('pa')).toBe('unavailable')
    bgPlaceStart(); await settle() // nothing can arrive: the assertion is that nothing did
    expect(h.dispatch).not.toHaveBeenCalled()
    expect(calls('device_place_key_issue')).toHaveLength(0)
  })
})

// The runner script is plain JS for another engine: load it with fake globals and drive its two events.
type Handler = (resolve: () => void, reject: () => void, args?: unknown) => void
const T0 = Date.parse('2026-11-07T08:00:00Z')
function loadRunner(opts: { battery?: unknown; status?: number; body?: unknown; fetchFails?: boolean } = {}) {
  const handlers: Record<string, Handler> = {}
  const store = new Map<string, string>()
  const kv = { get: (k: string) => (store.has(k) ? { value: store.get(k)! } : { value: undefined }), set: (k: string, v: string) => void store.set(k, v), remove: (k: string) => void store.delete(k) }
  const status = opts.status ?? 200
  const fetchMock = opts.fetchFails ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: status < 300, status, json: () => Promise.resolve('body' in opts ? opts.body : true) })
  const geo = { getCurrentPosition: vi.fn(() => { throw new Error('the runner must not read the position (D-151)') }) }
  const device = { getBatteryStatus: () => ('battery' in opts ? opts.battery : { batteryLevel: 0.184, isCharging: true }) }
  new Function('addEventListener', 'CapacitorKV', 'CapacitorGeolocation', 'CapacitorDevice', 'fetch', runnerSrc)((n: string, f: Handler) => { handlers[n] = f }, kv, geo, device, fetchMock)
  const run = (name: string, args?: unknown) => new Promise<void>((ok) => handlers[name]!(ok, ok, args))
  return { run, store, fetchMock, geo }
}
const arm = (extra: object = {}) => ({ on: true, url: 'https://project.example.test', key: 'k', pkey: 'bpk_secretplacekey_0001', ...extra })

describe('runner script public/runners/bgplace.js (D-150, D-151)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0) })
  afterEach(() => vi.useRealTimers())

  it('does nothing while it was never armed', async () => {
    const r = loadRunner()
    await r.run('dailyPlace')
    expect(r.fetchMock).not.toHaveBeenCalled()
  })
  it('checks in through live_location_put_device with the place key, battery and charging only: no coordinate, accuracy or fix time, and never reads the position', async () => {
    const r = loadRunner()
    await r.run('configure', arm())
    await r.run('dailyPlace')
    expect(r.fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = r.fetchMock.mock.calls[0]!
    expect(url).toBe('https://project.example.test/rest/v1/rpc/live_location_put_device')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', apikey: 'k' }) // no Authorization, no sign-in token
    expect(JSON.parse(init.body)).toEqual({ p_key: 'bpk_secretplacekey_0001', p_battery_pct: 18, p_charging: true })
    expect(init.body).not.toMatch(/lat|lon|accuracy|fixed/)
    expect(r.geo.getCurrentPosition).not.toHaveBeenCalled()
    await r.run('dailyPlace') // the same day again: skipped
    expect(r.fetchMock).toHaveBeenCalledTimes(1)
  })
  it('a place handed to configure (an older app) is dropped and never sent', async () => {
    const r = loadRunner()
    await r.run('configure', arm({ fix: { lat: 14.5995, lon: 120.9842, at: T0 - 3600_000 } }))
    expect(r.store.get('bp.cfg')).not.toMatch(/lat|lon|fix|14\.5995/)
    await r.run('dailyPlace')
    expect(r.fetchMock.mock.calls[0]![1].body).not.toMatch(/14\.5995|120\.9842/)
  })
  it('sends unknown battery as null, not 0 (ML-05)', async () => {
    for (const battery of [undefined, { batteryLevel: -1, isCharging: 'yes' }, { batteryLevel: 7 }]) {
      const a = loadRunner({ battery })
      await a.run('configure', arm())
      await a.run('dailyPlace')
      expect(JSON.parse(a.fetchMock.mock.calls[0]![1].body)).toEqual({ p_key: 'bpk_secretplacekey_0001', p_battery_pct: null, p_charging: null })
    }
  })
  it('configure with on:false, bad input or the old token shape wipes the arm state, and never stores a token', async () => {
    const r = loadRunner()
    await r.run('configure', arm())
    expect(r.store.size).toBe(1)
    await r.run('configure', { on: false })
    expect(r.store.size).toBe(0)
    await r.run('configure', arm({ url: 'http://insecure.example.test' }))
    expect(r.store.size).toBe(0)
    await r.run('configure', { on: true, url: 'https://project.example.test', key: 'k', token: 'tok', exp: 9e9 }) // the 2.8.0-pre shape: no pkey
    expect(r.store.size).toBe(0)
    await r.run('configure', arm({ token: 'sign-in-token-xyz' }))
    expect(r.store.get('bp.cfg')).not.toContain('sign-in-token-xyz')
  })
  it('stops for good when the server does not accept the key (answer false) or the function is gone (404, migration 0053 undone); keeps the key after a server error, 53400 or no network', async () => {
    const a = loadRunner({ body: false })
    await a.run('configure', arm())
    await a.run('dailyPlace')
    expect(a.fetchMock).toHaveBeenCalledTimes(1)
    expect(a.store.size).toBe(0)
    const gone = loadRunner({ status: 404, body: { code: 'PGRST202' } })
    await gone.run('configure', arm())
    expect(gone.store.size).toBe(1)
    await gone.run('dailyPlace')
    expect(gone.fetchMock).toHaveBeenCalledTimes(1)
    expect(gone.store.size).toBe(0) // it cleared itself
    await gone.run('dailyPlace')
    expect(gone.fetchMock).toHaveBeenCalledTimes(1) // and sends nothing more
    for (const o of [{ status: 400 }, { status: 503 }, { status: 500 }, { status: 429 }, { fetchFails: true }]) {
      const b = loadRunner(o)
      await b.run('configure', arm())
      await b.run('dailyPlace')
      expect(b.store.size).toBe(1)
      await b.run('dailyPlace')
      expect(b.fetchMock).toHaveBeenCalledTimes(2) // nothing was recorded as sent, so tomorrow retries
    }
  })
  it('checks in again the next day, not before 20 hours', async () => {
    const r = loadRunner()
    await r.run('configure', arm())
    await r.run('dailyPlace')
    vi.setSystemTime(T0 + 19 * 3600 * 1000)
    await r.run('dailyPlace')
    expect(r.fetchMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(T0 + 21 * 3600 * 1000)
    await r.run('dailyPlace')
    expect(r.fetchMock).toHaveBeenCalledTimes(2)
  })
})
