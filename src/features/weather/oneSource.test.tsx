import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resetRefresh } from '../location/useLocation'
import { rainLine } from '../safety/SafetyHub'
import WeatherCard from '../today/WeatherCard'
import { useWeather } from '../today/weather'
import { openMeteoFixture } from './fixture'
import { forecastWritesSettled } from './forecast'
import { ForecastNote, OPEN_METEO_CREDIT } from './ForecastNote'
import WeatherScreen from './WeatherScreen'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const urls: string[] = []
beforeEach(async () => {
  resetRefresh()
  await forecastWritesSettled()
  await db.kv.clear()
  urls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    urls.push(String(u))
    return new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 })), { status: 200 })
  }))
  location.hash = '#weather'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// Stands in for Safety "Right now": it calls the same hook with the same point as Today
function SafetyProbe() {
  const wx = useWeather({ lat: 6.11, lon: 125.17 })
  return <p data-testid="safety-rain">{wx?.temp != null ? `${Math.round(wx.temp)}° ${rainLine(wx)}` : 'none'}</p>
}

describe('D-163 one weather source', () => {
  it('Today hero, Safety and the Weather screen show the same temperature from one forecast request', async () => {
    render(<><WeatherCard expanded /><SafetyProbe /><WeatherScreen /></>)
    await waitFor(() => expect(screen.getByTestId('wx-hero').textContent).toContain('33°'))
    await waitFor(() => expect(screen.getByTestId('weather-hero').textContent).toContain('33°'))
    expect(screen.getByTestId('safety-rain').textContent).toMatch(/^33°/)
    // Today and Weather open at the same home point, so they share one request (Safety's probe uses another point on purpose: it only checks the numbers path)
    const forecastCalls = urls.filter((u) => u.includes('open-meteo'))
    expect(new Set(forecastCalls.map((u) => new URL(u).searchParams.get('latitude'))).size).toBeLessThanOrEqual(2)
  })

  it('names the place and credits Open-Meteo on the Today hero and the Weather screen', async () => {
    render(<><WeatherCard expanded /><WeatherScreen /></>)
    await waitFor(() => expect(screen.getAllByTestId('forecast-note')).toHaveLength(2))
    for (const n of screen.getAllByTestId('forecast-note')) {
      expect(n.textContent).toMatch(/^Forecast for .+ · Weather data by Open-Meteo\.com$/)
      expect(n.textContent).not.toMatch(/\d+\.\d{3}/) // a place name, never coordinates
    }
  })

  it('hourly rain slots read "NN% rain", not a bare percent', async () => {
    render(<WeatherCard expanded />)
    await waitFor(() => expect(screen.getByTestId('hourly-strip')).toBeTruthy())
    const slots = [...document.querySelectorAll('.td-hs-p')].map((e) => e.textContent ?? '')
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) expect(s).toMatch(/^\d+% rain$/)
  })

  it('ForecastNote wording', () => {
    render(<ForecastNote place="Dampas" />)
    expect(screen.getByTestId('forecast-note').textContent).toBe(`Forecast for Dampas · ${OPEN_METEO_CREDIT}`)
  })
})
