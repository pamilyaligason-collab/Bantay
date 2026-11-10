import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resolvePlace } from '../location/place'
import { resetRefresh, ZONE_KEY } from '../location/useLocation'
import { HOME_ZONES } from '../location/geo'
import { FOLLOW_KEY } from './weatherPlace'
import { RightNow } from '../safety/SafetyHub'
import WeatherCard from '../today/WeatherCard'
import { openMeteoFixture } from './fixture'
import { forecastWritesSettled } from './forecast'
import { ForecastNote, OPEN_METEO_CREDIT } from './ForecastNote'
import WeatherScreen from './WeatherScreen'

// one shared position for all three screens: tests set h.loc before render
const h = vi.hoisted(() => ({ loc: null as null | Record<string, unknown> }))
vi.mock('../location/useLocation', async (orig) => ({ ...(await orig<typeof import('../location/useLocation')>()), useLocation: () => h.loc ?? { source: 'pending', lat: null, lon: null } }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const urls: string[] = []
beforeEach(async () => {
  resetRefresh()
  await forecastWritesSettled()
  await db.kv.clear()
  urls.length = 0
  h.loc = { source: 'home', lat: 9.645705, lon: 123.877951, ...stubs }
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    urls.push(String(u))
    return new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 })), { status: 200 })
  }))
  location.hash = '#weather'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const stubs = { ask: async () => null, refine: () => null, forget: async () => {}, setHome: async () => {} }
const gps = (lat: number, lon: number, source: 'gps' | 'last', ageH: number) => ({ source, lat, lon, at: Date.now() - ageH * 3600_000, accuracy: 20, ...stubs })

// All three on one position: exactly one forecast request, and the same temperature, rain figure and place label everywhere.
async function threeScreens(): Promise<string> {
  render(<><WeatherCard expanded /><RightNow place={resolvePlace({ gps: null, lastZone: 'dampas' }) as never} /><WeatherScreen /></>)
  await waitFor(() => expect(screen.getByTestId('wx-hero').textContent).toContain('33°'))
  await waitFor(() => expect(screen.getByTestId('weather-hero').textContent).toContain('33°'))
  await waitFor(() => expect(screen.getAllByTestId('forecast-note')).toHaveLength(3))
  const notes = screen.getAllByTestId('forecast-note').map((n) => n.textContent)
  expect(new Set(notes).size).toBe(1) // same 'Forecast for <place>' and credit on Today, Safety and Weather
  const rain = screen.getByTestId('right-now').textContent ?? ''
  expect(rain).toContain('Today up to 30%') // the fixture's daily rain chance (daily[0].prob = 30)
  return notes[0]!
}
const forecastCalls = () => urls.filter((u) => u.includes('/v1/forecast'))

describe('D-163 one weather source', () => {
  it('fresh fix: Today hero, Safety Right now and the Weather screen make ONE forecast request and agree', async () => {
    h.loc = gps(6.11, 125.17, 'gps', 0.1)
    await threeScreens()
    expect(forecastCalls()).toHaveLength(1)
    expect(new URL(forecastCalls()[0]!).searchParams.get('latitude')).toBe('6.11')
  })

  it('a fix older than 6 h is no fix on any of the three: same place, one request, at the saved zone', async () => {
    await db.kv.put({ key: ZONE_KEY, value: 'dampas' })
    h.loc = gps(6.11, 125.17, 'last', 7)
    const note = await threeScreens()
    expect(note).toContain('Dampas')
    expect(forecastCalls()).toHaveLength(1)
    expect(Number(new URL(forecastCalls()[0]!).searchParams.get('latitude'))).toBeCloseTo(HOME_ZONES.find((z) => z.id === 'dampas')!.lat, 1)
  })

  it('a zone picked while holding a GPS fix wins on all three', async () => {
    await db.kv.put({ key: ZONE_KEY, value: 'dampas' })
    await db.kv.put({ key: FOLLOW_KEY, value: 'zone' })
    h.loc = gps(6.11, 125.17, 'gps', 0.1)
    const note = await threeScreens()
    expect(note).toContain('Dampas')
    expect(forecastCalls()).toHaveLength(1)
    expect(Number(new URL(forecastCalls()[0]!).searchParams.get('latitude'))).toBeCloseTo(HOME_ZONES.find((z) => z.id === 'dampas')!.lat, 1)
  })

  it('names the place and credits Open-Meteo on the Today hero and the Weather screen', async () => {
    render(<><WeatherCard expanded /><WeatherScreen /></>)
    await waitFor(() => expect(screen.getAllByTestId('forecast-note')).toHaveLength(2))
    const [today, screenNote] = screen.getAllByTestId('forecast-note')
    expect(today!.textContent).toBe('Weather data by Open-Meteo.com') // no fix: the card's one place line is "Location off: showing <place>", so the credit drops the place
    expect(screenNote!.textContent).toMatch(/^Forecast for .+ · Weather data by Open-Meteo\.com$/)
    for (const n of [today!, screenNote!]) expect(n.textContent).not.toMatch(/\d+\.\d{3}/) // a place name, never coordinates
  })

  it('hourly rain slots read "NN% rain", not a bare percent', async () => {
    render(<WeatherCard expanded />)
    await waitFor(() => expect(screen.getByTestId('hourly-strip')).toBeTruthy())
    const slots = [...document.querySelectorAll('.td-hs-p')].map((e) => e.textContent ?? '')
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) expect(s).toMatch(/^\d+% rain$/)
  })

  it('credit follows the data: blended names every provider that answered', () => {
    render(<ForecastNote place="Dampas" sources={['open-meteo', 'met-norway']} />)
    expect(screen.getByTestId('forecast-note').textContent).toBe('Forecast for Dampas · Weather data by Open-Meteo.com, MET Norway')
    cleanup()
    render(<ForecastNote place="Dampas" sources={['open-meteo', 'met-norway', 'openweather']} />)
    expect(screen.getByTestId('forecast-note').textContent).toContain('MET Norway, OpenWeather')
  })

  it('ForecastNote wording', () => {
    render(<ForecastNote place="Dampas" />)
    expect(screen.getByTestId('forecast-note').textContent).toBe(`Forecast for Dampas · ${OPEN_METEO_CREDIT}`)
  })
})
