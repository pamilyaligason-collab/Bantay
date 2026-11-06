import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false } }))
vi.mock('../family/placeApi', () => ({ putLivePlace: vi.fn(() => Promise.resolve()) }))
import { resetRefresh, resolveLocation } from './useLocation'
import { putLivePlace } from '../family/placeApi'

type Geo = (ok: (p: unknown) => void, no: (e: unknown) => void) => void
const stub = (geo: Geo, perm = 'granted') =>
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn(geo) }, permissions: { query: () => Promise.resolve({ state: perm }) } })
const fix = (coords: Record<string, number>, timestamp?: number): Geo => (ok) => ok({ coords: { latitude: 6.11, longitude: 125.17, ...coords }, timestamp })
// the put is fire-and-forget behind a dynamic import: let it settle before asserting "never called"
const settle = () => new Promise((r) => setTimeout(r, 20))

describe('S22 T: the family pin is written only from a real GPS fix', () => {
  beforeEach(async () => { resetRefresh(); vi.mocked(putLivePlace).mockClear(); await db.kv.clear() })

  it('a GPS fix calls putLivePlace once with {lat, lon, at, accuracy}', async () => {
    const t = Date.now() - 90_000
    stub(fix({ accuracy: 25 }, t))
    const l = await resolveLocation(false)
    expect(l).toMatchObject({ source: 'gps', at: t })
    await vi.waitFor(() => expect(putLivePlace).toHaveBeenCalledTimes(1))
    expect(putLivePlace).toHaveBeenCalledWith({ lat: 6.11, lon: 125.17, at: t, accuracy: 25 })
    await settle()
    expect(putLivePlace).toHaveBeenCalledTimes(1)
  })

  it('permission denied with no saved fix (home) does not call it', async () => {
    stub(fix({}), 'denied')
    expect((await resolveLocation(false)).source).toBe('home')
    await settle()
    expect(putLivePlace).not.toHaveBeenCalled()
  })

  it('permission denied with a saved fix (last) does not call it', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 9.65, lon: 123.85, at: 1700000000000 } })
    stub(fix({}), 'denied')
    expect((await resolveLocation(false)).source).toBe('last')
    await settle()
    expect(putLivePlace).not.toHaveBeenCalled()
  })

  it('a thrown GPS error does not call it', async () => {
    stub((_ok, no) => no(new Error('timeout')))
    expect((await resolveLocation(false)).source).toBe('home')
    await settle()
    expect(putLivePlace).not.toHaveBeenCalled()
  })

  it('a 0,0 fix does not call it', async () => {
    stub(fix({ latitude: 0, longitude: 0 }))
    expect((await resolveLocation(false)).source).toBe('home')
    await settle()
    expect(putLivePlace).not.toHaveBeenCalled()
  })
})
