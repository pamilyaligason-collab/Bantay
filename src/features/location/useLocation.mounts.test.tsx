import 'fake-indexeddb/auto'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ native: false, perm: { location: 'granted', coarseLocation: 'granted' } as Record<string, string> }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native, isPluginAvailable: () => h.native } }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { checkPermissions: () => Promise.resolve(h.perm), getCurrentPosition: () => Promise.reject(new Error('plugin off')) } }))
import { resetRefresh, resolveLocation, useLocation } from './useLocation'

// these cases are about the map being off (low-accuracy plain reads, the four feed switches): the family map is on by default since D-143
beforeEach(() => { localStorage.setItem('bantay.flag.places', '0') })

const fix = { coords: { latitude: 6.11, longitude: 125.17, accuracy: 900 }, timestamp: Date.now() }
const stub = (geo: (ok: (p: unknown) => void, no: (e: unknown) => void, o: { enableHighAccuracy: boolean }) => void, perm = 'granted') => {
  const g = vi.fn(geo)
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: g }, permissions: { query: () => Promise.resolve({ state: perm }) } })
  return g
}

beforeEach(async () => { resetRefresh(); h.native = false; h.perm = { location: 'granted', coarseLocation: 'granted' }; await db.kv.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('S22 location: stale fix fixes', () => {
  it('Android "Approximate" only (location prompt, coarseLocation granted) reads a fix', async () => {
    h.native = true; h.perm = { location: 'prompt', coarseLocation: 'granted' }
    stub((ok) => ok(fix), 'prompt')
    expect((await resolveLocation(false)).source).toBe('gps') // the plugin read fails here, the WebView call answers
  })
  it('nothing granted at all still stays home and never reads', async () => {
    h.native = true; h.perm = { location: 'prompt', coarseLocation: 'prompt' }
    const g = stub((ok) => ok(fix), 'prompt')
    expect((await resolveLocation(false)).source).toBe('home'); expect(g).not.toHaveBeenCalled()
  })
  it('a precise read that fails gets one low-accuracy retry, and that fix counts', async () => {
    const g = stub((ok, no, o) => (o.enableHighAccuracy ? no(new Error('timeout')) : ok(fix)))
    const l = await resolveLocation(false, true)
    expect(l.source).toBe('gps')
    expect(g.mock.calls.map((c) => (c[2] as { enableHighAccuracy: boolean }).enableHighAccuracy)).toEqual([true, false])
  })
  it('a plain (low-accuracy) read that fails is not retried', async () => {
    const g = stub((_ok, no) => no(new Error('x')))
    expect((await resolveLocation(false)).source).toBe('home'); expect(g).toHaveBeenCalledTimes(1)
  })
  it('three screens mounting together make one position request, and all get the answer', async () => {
    const g = stub((ok) => ok(fix))
    const hooks = [renderHook(() => useLocation()), renderHook(() => useLocation()), renderHook(() => useLocation())]
    await waitFor(() => hooks.forEach((r) => expect(r.result.current.source).toBe('gps')))
    expect(g).toHaveBeenCalledTimes(1)
    const late = renderHook(() => useLocation()) // inside the 5-minute window: no new read, still gets the answer
    await waitFor(() => expect(late.result.current.source).toBe('gps'))
    expect(g).toHaveBeenCalledTimes(1)
  })
})
