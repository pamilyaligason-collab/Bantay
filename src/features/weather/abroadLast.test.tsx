import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resolvePlace } from '../location/place'
import { openMeteoFixture } from './fixture'
import WeatherScreen from './WeatherScreen'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../location/ZonePicker', () => ({ default: () => null }))
vi.mock('../safety/LiveMaps', async (orig) => ({ ...(await orig<typeof import('../safety/LiveMaps')>()), default: ({ loc }: { loc: { lat: number } }) => <p data-testid="map-at">{loc.lat}</p> }))
// location denied now; the last fix is old and in Texas, so the place falls back to the home zone
vi.mock('../location/useLocation', () => {
  const l = { source: 'last', lat: 32.78, lon: -96.8, at: 1, ask: async () => null, forget: async () => {} }
  return { ZONE_KEY: 'test.zone', useLocation: () => l, usePlaceFrom: () => ({ ...resolvePlace({ gps: { lat: 32.78, lon: -96.8, stale: true }, lastZone: 'dampas' }), lastZone: 'dampas', settled: true, picked: true }) }
})

beforeEach(async () => {
  await db.kv.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 25, humidity: 40 })), { status: 200 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Weather with only an old fix abroad', () => {
  it('fetches the forecast for the home zone the label names, never for the foreign point', async () => {
    render(<WeatherScreen />)
    await screen.findByRole('region', { name: 'Now' })
    const urls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).filter((u) => u.includes('latitude='))
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) { expect(u).not.toContain('latitude=32.78'); expect(u).toContain('latitude=9.6') }
  })
  it('the live map centres on the same home zone, never the old foreign point', async () => {
    render(<WeatherScreen />)
    const card = await screen.findByTestId('wx-live-map')
    expect(card.querySelector('iframe')!.getAttribute('src')).toMatch(/lat=9\.6/) // the live map is open by default, on the home zone
  })
})
