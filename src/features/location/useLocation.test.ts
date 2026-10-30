import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ native: false, plugin: false, os: 'granted' as string | Error, pos: null as { coords: { latitude: number; longitude: number } } | null }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native, isPluginAvailable: () => h.plugin } }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { checkPermissions: () => (h.os instanceof Error ? Promise.reject(h.os) : Promise.resolve({ location: h.os })), getCurrentPosition: () => (h.pos ? Promise.resolve(h.pos) : Promise.reject(new Error('no plugin fix'))) } }))
import { resolveLocation } from './useLocation'

const setup = (perm: string, gpsOk = true) => {
  const getCurrentPosition = vi.fn((ok: (p: unknown) => void, no: (e: unknown) => void) => (gpsOk ? ok({ coords: { latitude: 6.11, longitude: 125.17 } }) : no(new Error('x'))))
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition }, permissions: { query: () => Promise.resolve({ state: perm }) } })
  return getCurrentPosition
}
const asked = () => db.kv.put({ key: 'loc.asked', value: true })

describe('resolveLocation(false)', () => {
  beforeEach(async () => { h.native = false; h.plugin = false; h.os = 'granted'; h.pos = null; await db.kv.clear() })
  it('native + prompt + asked uses GPS', async () => {
    h.native = true; await asked(); const g = setup('prompt')
    expect((await resolveLocation(false)).source).toBe('gps'); expect(g).toHaveBeenCalled()
  })
  it('native + prompt + never asked stays home', async () => {
    h.native = true; const g = setup('prompt')
    expect((await resolveLocation(false)).source).toBe('home'); expect(g).not.toHaveBeenCalled()
  })
  it('native + denied stays home', async () => {
    h.native = true; await asked(); const g = setup('denied')
    expect((await resolveLocation(false)).source).toBe('home'); expect(g).not.toHaveBeenCalled()
  })
  it('browser + prompt stays home', async () => {
    await asked(); const g = setup('prompt')
    expect((await resolveLocation(false)).source).toBe('home'); expect(g).not.toHaveBeenCalled()
  })
  it('browser + granted uses GPS', async () => {
    setup('granted'); expect((await resolveLocation(false)).source).toBe('gps')
  })
  it('GPS error falls back home', async () => {
    h.native = true; await asked(); setup('prompt', false)
    expect((await resolveLocation(false)).source).toBe('home')
  })
  it('APK 2.2 plugin: OS granted uses GPS even though WebView says prompt and nothing was asked', async () => {
    h.native = true; h.plugin = true; const g = setup('prompt')
    expect((await resolveLocation(false)).source).toBe('gps'); expect(g).toHaveBeenCalled()
  })
  it('APK 2.2 plugin: OS denied stays home even after an earlier yes', async () => {
    h.native = true; h.plugin = true; h.os = 'denied'; await asked(); const g = setup('prompt')
    expect((await resolveLocation(false)).source).toBe('home'); expect(g).not.toHaveBeenCalled()
  })
  it('APK 2.2 plugin: location switched off (throws) stays home and never prompts', async () => {
    h.native = true; h.plugin = true; h.os = new Error('Location services are not enabled'); await asked(); const g = setup('prompt')
    expect((await resolveLocation(false)).source).toBe('home'); expect(g).not.toHaveBeenCalled()
  })
  it('N-2 APK plugin: OS granted reads the position from the plugin even when the WebView call fails (was Dampas)', async () => {
    h.native = true; h.plugin = true; h.pos = { coords: { latitude: 9.65, longitude: 123.85 } }; const g = setup('prompt', false)
    expect(await resolveLocation(false)).toEqual({ lat: 9.65, lon: 123.85, source: 'gps' }); expect(g).not.toHaveBeenCalled()
  })
})
