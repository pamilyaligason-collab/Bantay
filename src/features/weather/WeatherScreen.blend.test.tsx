import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Blended } from '../../../supabase/functions/weather-blend/blend.ts'
import { db } from '../../db'
import { Next2h, nextRainLine } from './BlendCards'
import { openMeteoFixture } from './fixture'
import WeatherScreen from './WeatherScreen'

const track = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../admin/events', () => ({ track }))
const invoke = vi.hoisted(() => vi.fn())
vi.mock('../auth/client', () => ({ supabase: { functions: { invoke } } }))

const t = (m: number) => `2026-11-04T19:${String(m).padStart(2, '0')}`
type Reply = { data: Blended & { ok: true; stale?: boolean }; error: null }
const blend = (): Reply => ({
  error: null,
  data: {
    ok: true, cell: { lat: 6.2, lon: 125.2 }, fetchedAt: new Date().toISOString(), tz: 'Asia/Manila', utcOffset: 28800,
    now: { time: t(0), temp: 31, humidity: 70, feels: 36, code: 3, wind: 9, gust: 18, uv: 6 },
    next2h: [0, 10, 20, 30, 40, 50].map((m, i) => ({ time: t(m), mmh: [0, 0, 0.5, 2.8, 1.4, 0.3][i]!, estimated: true })),
    hourly48: [], daily10: [], aqi: { index: 3, label: 'Moderate', pm25: 21, pm10: 40 },
    alerts: [{ source: 'OpenWeather', event: 'Invented gale notice', start: '', end: '', description: '' }], check: null,
    sources: [
      { id: 'open-meteo', ok: true, credit: 'Weather data by Open-Meteo.com (CC BY 4.0)', url: 'https://open-meteo.com/' },
      { id: 'met-norway', ok: true, credit: 'Data from MET Norway (CC BY 4.0)', url: 'https://api.met.no/' },
      { id: 'openweather', ok: true, credit: 'Weather data by OpenWeather', url: 'https://openweathermap.org/' }
    ]
  }
})
// the hook calls supabase.functions.invoke and reads { data }
const reply = (r: Reply) => ({ data: r.data, error: null })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-04T11:00:00Z')) // 7:00 PM in Manila, so the made-up slots are current
  await db.kv.clear(); invoke.mockReset(); track.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 })), { status: 200 })))
  location.hash = '#weather'
})
afterEach(() => { vi.useRealTimers(); cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('Weather screen with the blend', () => {
  it('flag off: the function is never called and no blend cards or credits appear', async () => {
    invoke.mockResolvedValue(reply(blend()))
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(invoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Around you' })).toBeNull()
    expect(screen.getByTestId('wx-next2h-est').textContent).toContain('estimated') // the 15-minute block from hourly data exists without the blend (X3)
    expect(screen.queryByTestId('wx-other-alerts')).toBeNull()
    expect(screen.getByText('Forecast for your spot (rounded to about 1 km) from Open-Meteo. Its global weather models work on a grid of roughly 10 km, so a shower over one street can be missed. Official warnings: PAGASA.')).toBeTruthy()
  })

  it('flag on: Next 2 hours (estimated), air quality word, credits; OpenWeather notices sit below the PAGASA row', async () => {
    localStorage.setItem('bantay.flag.wx.blend', '1')
    invoke.mockResolvedValue(reply(blend()))
    render(<WeatherScreen />)
    const card = await screen.findByTestId('wx-next2h')
    const { lat, lon } = invoke.mock.calls[0]![1].body as { lat: number; lon: number }
    for (const v of [lat, lon]) expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6) // 2 decimals at most
    expect(within(card).getByText('estimated')).toBeTruthy()
    expect(within(card).getByText(/Rain likely from about 7:20 PM, heaviest around 7:30 PM/)).toBeTruthy()
    expect(within(screen.getByTestId('wx-air')).getByText('Moderate')).toBeTruthy()
    const warn = screen.getByTestId('wx-warn')
    const other = screen.getByTestId('wx-other-alerts')
    expect(warn.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const c of ['Weather data by Open-Meteo.com (CC BY 4.0)', 'Data from MET Norway (CC BY 4.0)', 'Weather data by OpenWeather']) expect(screen.getByText(c)).toBeTruthy()
    expect(screen.queryByText(/from Open-Meteo \(global models/)).toBeNull()
  })

  it('flag on, function down: the direct forecast, an honest empty state, no blend cards', async () => {
    localStorage.setItem('bantay.flag.wx.blend', '1')
    invoke.mockRejectedValue(new Error('down'))
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(screen.queryByTestId('wx-air')).toBeNull()
    expect(screen.getByText('Not available yet')).toBeTruthy()
  })

  it('flag on, stale blend: says so in the hero and shows no frozen rain chart', async () => {
    localStorage.setItem('bantay.flag.wx.blend', '1')
    const b = blend(); b.data.stale = true
    invoke.mockResolvedValue(reply(b))
    render(<WeatherScreen />)
    const card = await screen.findByTestId('wx-next2h')
    expect(within(card).getByText('Not available now')).toBeTruthy()
    expect(screen.queryByTestId('wx-air')).toBeNull() // no frozen air numbers either
    expect(document.querySelector('.wx-stamp')!.textContent).toMatch(/^as of /)
  })
})

describe('nextRainLine', () => {
  const s = (v: (number | null)[]) => v.map((mmh, i) => ({ time: t(i * 10), mmh, estimated: false }))
  it('says dry, wet-now, wet-later and unknown without inventing', () => {
    expect(nextRainLine(s([0, 0, 0.05]))).toBe('No rain expected in the next 2 hours')
    expect(nextRainLine(s([1, 2]))).toMatch(/^Raining now, heaviest around 7:10 PM/)
    expect(nextRainLine(s([0, 1]))).toMatch(/^Rain likely from about 7:10 PM/)
    expect(nextRainLine(s([null, null]))).toBeNull()
    expect(nextRainLine(s([0, null]))).toBeNull() // part unknown is not "dry"
  })
  it('Next2h drops slots already past, so the first bar is the present', () => {
    const slots = [0, 10, 20, 30].map((m, i) => ({ time: t(m), mmh: [0, 0, 1, 2][i]!, estimated: false }))
    const { container } = render(<Next2h slots={slots} offline={false} now={Date.parse('2026-11-04T11:25:00Z')} />) // 7:25 PM: the 7:00 and 7:10 steps are over
    expect(container.querySelectorAll('.wx-n2h-bars li')).toHaveLength(2)
    expect(container.textContent).toMatch(/Raining now, heaviest around 7:30 PM/)
  })
})
