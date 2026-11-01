import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { parseHash } from '../shell/routes'
import { openMeteoFixture } from './fixture'
import WeatherScreen from './WeatherScreen'

const track = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../admin/events', () => ({ track }))

const calls: string[] = []
beforeEach(async () => {
  await db.kv.clear()
  calls.length = 0
  track.mockClear()
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    calls.push(String(u))
    return new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 })), { status: 200 })
  }))
  location.hash = '#weather'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('WeatherScreen', () => {
  it('v13: Large Title with Back to Today, hero first, then action line, 4 tiles, the strip, 5 of the 10 days (all on a tap), the live map prompt, then sources and the footer', async () => {
    render(<WeatherScreen />)
    expect(await screen.findByText(/Stay indoors 11 AM-3 PM/)).toBeTruthy() // 33 C at 70% is a heat index in the Danger band
    expect(screen.getByText(/Heat index 4\d° · Danger/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Weather' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Today' }).getAttribute('href')).toBe('#today')
    const heroes = document.querySelectorAll('[data-hero]')
    expect(heroes).toHaveLength(1)
    expect(heroes[0]).toBe(screen.getByRole('region', { name: 'Now' }))
    expect(heroes[0]!.getAttribute('data-contrast-bg')).toBe('#0B1636')
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? document.getElementById(r.getAttribute('aria-labelledby')!)?.textContent)
    expect(regions.slice(0, 8)).toEqual(['Now', 'What to do', 'Details', 'Rain and storm map', 'Next 48 hours', '10 days', 'Season and sun', 'Live weather map'])
    expect(document.querySelector('.wx-temp')?.textContent).toBe('33°')
    expect(screen.getByText('Partly cloudy')).toBeTruthy()
    const details = within(screen.getByRole('region', { name: 'Details' }))
    for (const t of ['Rain next 6 h', 'Wind', 'Humidity', 'UV today']) expect(details.getByText(t)).toBeTruthy()
    expect(details.getByText('9 km/h')).toBeTruthy()
    expect(details.getByText('Gusts 18')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '10 days' })).getAllByRole('listitem')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 10 days' }))
    expect(within(screen.getByRole('region', { name: '10 days' })).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Show fewer days' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('group', { name: 'Official sources' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '10 days' })).getByText('Today')).toBeTruthy()
    for (const n of ['PAGASA', 'Project NOAH', 'PANaHON']) expect(screen.getByText(n)).toBeTruthy()
    expect(screen.getByText(/nothing to centre on/)).toBeTruthy() // no fix: the prompt, never a home-zone map
    expect(screen.getByText('Your rounded location is sent only to the weather service.')).toBeTruthy()
  })

  it('sections: h2 headings, sources open without a tap and leave the app, How this is made', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    for (const n of ['Rain map', 'Next 48 hours', '10 days', 'Season and sun', 'Official sources']) expect(screen.getByRole('heading', { level: 2, name: n })).toBeTruthy()
    const links = within(screen.getByRole('group', { name: 'Official sources' })).getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const a of links) expect(a.getAttribute('target')).toBe('_blank')
    expect(document.querySelector('details')).toBeNull()
    expect(screen.getByText('How this is made')).toBeTruthy()
    expect(screen.getByText('Forecast for your area from Open-Meteo (global models, about 9 km). Official warnings: PAGASA.')).toBeTruthy()
  })

  it('Official row: PAGASA all clear near the place, else the alert title; links to the warnings page', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    const row = screen.getByRole('link', { name: /Official/ })
    expect(row.getAttribute('href')).toBe('#safety/warnings')
    expect(row.textContent).toContain('PAGASA: no warning near Dampas')
    cleanup()
    const alert: Alert = { id: 'a1', kind: 'tcws', level: 'Signal No. 2', title: 'Signal No. 2 for Bohol', what: '', where: 'Bohol', when: '', doNow: 'Stay home.', source: 'PAGASA', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 9.645705, lon: 123.877951, bulletin: '' }
    await db.kv.put({ key: ALERTS_KEY, value: [alert] })
    render(<WeatherScreen />)
    expect(await screen.findByText('Signal No. 2 for Bohol', { selector: '.rw-sub' })).toBeTruthy()
  })

  it('hero kicker: near you for a GPS fix, last known for the last fix, the name alone for a home pick; Updated on its own line', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    render(<WeatherScreen />)
    const k = (await screen.findByTestId('place-last')).closest('.wx-k')!
    expect(k.textContent).toBe('My location · last known')
    expect(within(screen.getByRole('region', { name: 'Now' })).getByText(/^Updated \d{1,2}:\d\d [AP]M$/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Now' })).getByText(/^Feels like \d+°$/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Now' })).getByText(/^H:\d+°\s+L:\d+°$/)).toBeTruthy()
    cleanup()
    await db.kv.clear()
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(document.querySelector('.wx-k')!.textContent).toBe('Dampas')
  })

  it('place toggle: Home 1 and Home 2 fetch their own forecast; without GPS the first button offers to use the location (N-2)', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    fireEvent.click(screen.getAllByRole('button', { name: 'Use my location' })[0]!)
    expect(await screen.findByText(/Location is off for Bantay/)).toBeTruthy() // no GPS in the test: the tap says why instead of doing nothing (m-1)
    expect(screen.getByRole('button', { name: 'Home 1' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Home 2' }))
    expect(screen.getByRole('button', { name: 'Home 2' }).getAttribute('aria-pressed')).toBe('true')
    await vi.waitFor(() => expect(calls.some((u) => u.includes('latitude=6.2&'))).toBe(true))
    expect(await screen.findByText('Conel')).toBeTruthy()
    expect(await screen.findByText(/^Updated \d/)).toBeTruthy()
  })

  it('offline: the cached forecast shows with "as of HH:MM"', async () => {
    const first = render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    first.unmount()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    // an old reading is not "fresh", so the screen tries the network and falls back
    const row = await db.kv.toArray()
    const key = row.find((r) => r.key.startsWith('weather.forecast.'))!
    await db.kv.put({ key: key.key, value: { ...(key.value as object), fetchedAt: new Date(Date.now() - 3600_000).toISOString() } })
    render(<WeatherScreen />)
    expect(await screen.findByText(/as of \d{1,2}:\d\d [AP]M, offline/)).toBeTruthy()
  })

  it('emits weather_opened, and weather_opened_action only when opened from an action line', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(track.mock.calls).toEqual([['action', 'weather_opened']])
    cleanup()
    track.mockClear()
    location.hash = '#weather?from=action'
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(track.mock.calls).toEqual([['action', 'weather_opened'], ['action', 'weather_opened_action']])
  })

  it('live maps stay closed until asked', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Open live map' }))
    expect(screen.getByRole('button', { name: 'Hide live map' })).toBeTruthy()
  })

  it('live map: without any fix there is no map toggle, only the prompt', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(screen.queryByRole('button', { name: 'Open live map' })).toBeNull()
    const map = within(screen.getByRole('region', { name: 'Live weather map' }))
    expect(map.getByRole('button', { name: 'Use my location' })).toBeTruthy()
    expect(map.getByText('Your position is not known yet, so the map has nothing to centre on.')).toBeTruthy()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('live map: the last real fix centres the map', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    render(<WeatherScreen />)
    expect((await screen.findByTestId('place-last')).textContent).toContain('last known')
    fireEvent.click(screen.getByRole('button', { name: 'Open live map' }))
    const src = document.querySelector('iframe')!.getAttribute('src')!
    expect(src).toMatch(/lat=10\.32/)
    expect(src).not.toMatch(/lat=9\.65/)
  })
})

describe('route', () => {
  it('#weather and #weather?from=action open the weather view under Today', () => {
    expect(parseHash('#weather')).toEqual({ tab: 'today', view: 'weather' })
    expect(parseHash('#weather?from=action')).toEqual({ tab: 'today', view: 'weather' })
  })
})
