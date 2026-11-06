import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resolvePlace } from '../location/place'
import { openMeteoFixture } from './fixture'
import WeatherScreen from './WeatherScreen'

const h = vi.hoisted(() => ({ ageMin: 0, source: 'last' as 'last' | 'gps', refine: vi.fn(async () => null) }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../location/ZonePicker', () => ({ default: () => null }))
vi.mock('../safety/LiveMaps', async (orig) => ({ ...(await orig<typeof import('../safety/LiveMaps')>()), default: () => null }))
// a fix in Cebu of a chosen age (module state read at render)
vi.mock('../location/useLocation', () => {
  const useLocation = () => ({ source: h.source, lat: 10.3157, lon: 123.8854, at: Date.now() - h.ageMin * 60_000, ask: async () => null, refine: h.refine, forget: async () => {} })
  return { ZONE_KEY: 'test.zone', useLocation, usePlaceFrom: (l: { source: string; lat: number; lon: number }) => ({ ...resolvePlace({ gps: l.source === 'home' ? null : { lat: l.lat, lon: l.lon, stale: l.source === 'last' }, lastZone: 'dampas' }), lastZone: 'dampas', settled: true, picked: true }) }
})

beforeEach(async () => {
  await db.kv.clear()
  h.refine.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 25, humidity: 40 })), { status: 200 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Weather fix age (S22 G)', () => {
  it('a fresh fix: no old-fix line, no precise read', async () => {
    h.ageMin = 10
    render(<WeatherScreen />)
    await screen.findByRole('region', { name: 'Now' })
    expect(screen.queryByTestId('wx-fix-old')).toBeNull()
    expect(h.refine).not.toHaveBeenCalled()
  })
  it('a 2 h old fix: says so, offers the update button, and asks for a precise read once', async () => {
    h.ageMin = 120
    render(<WeatherScreen />)
    const note = await screen.findByTestId('wx-fix-old')
    expect(note.textContent).toContain('Using your location from 2 h ago')
    expect(screen.getByRole('button', { name: 'Update my location' })).toBeTruthy()
    expect(h.refine).toHaveBeenCalledTimes(1)
  })
  it('a 40 min old fix: precise read, but no old-fix line yet', async () => {
    h.ageMin = 40
    render(<WeatherScreen />)
    await screen.findByRole('region', { name: 'Now' })
    expect(screen.queryByTestId('wx-fix-old')).toBeNull()
    expect(h.refine).toHaveBeenCalledTimes(1)
  })
  it('a 7 h old fix is no fix for Weather: the forecast follows the home zone, no old-fix line', async () => {
    h.ageMin = 7 * 60
    render(<WeatherScreen />)
    await screen.findByRole('region', { name: 'Now' })
    expect(screen.queryByTestId('wx-fix-old')).toBeNull()
    const urls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).filter((u) => u.includes('latitude='))
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) { expect(u).toContain('latitude=9.6'); expect(u).not.toContain('latitude=10.3') } // the home zone, not the Cebu fix
  })
})
