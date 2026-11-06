import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { CHECKED_KEY } from '../safety/alerts'
import { resolvePlace } from '../location/place'
import { openMeteoFixture } from './fixture'
import WeatherScreen from './WeatherScreen'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../location/ZonePicker', () => ({ default: () => null }))
vi.mock('../safety/LiveMaps', async (orig) => ({ ...(await orig<typeof import('../safety/LiveMaps')>()), default: () => null }))
// a live, rough (1500 m) phone fix in Dampas, Tagbilaran (invented test data)
const FIX = { lat: 9.6457, lon: 123.878 }
vi.mock('../location/useLocation', () => {
  const useLocation = () => ({ source: 'gps', ...FIX, at: Date.now(), accuracy: 1500, ask: async () => null, refine: async () => null, forget: async () => {} })
  return { ZONE_KEY: 'test.zone', useLocation, usePlaceFrom: (l: { lat: number; lon: number; at: number; accuracy: number }) => ({ ...resolvePlace({ gps: { lat: l.lat, lon: l.lon, stale: false }, lastZone: 'dampas' }), lastZone: 'dampas', settled: true, picked: true, fixAt: l.at, accuracy: l.accuracy }) }
})

beforeEach(async () => {
  await db.kv.clear()
  await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() }) // a fresh check, so the row says "no warning" and not "Not checked lately"
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 25, humidity: 40 })), { status: 200 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('S22 G: a rough fix on the real Weather screen', () => {
  it('the Official warnings row says "no warning near <place>", never "near around"; "around" stays on the place line', async () => {
    render(<WeatherScreen />)
    await screen.findByRole('region', { name: 'Now' })
    const row = (await screen.findByTestId('wx-warn')).textContent ?? ''
    expect(row).toContain('PAGASA: no warning near Tagbilaran')
    expect(row).not.toMatch(/around/)
    expect(screen.getByRole('region', { name: 'Now' }).textContent).toContain('around Tagbilaran') // the kicker is the place line
  })
})
