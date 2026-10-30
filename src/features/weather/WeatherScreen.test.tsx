import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
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
  it('draws the action line first, then the hero, 4 tiles, the strip, 5 of the 10 days (all on a tap), the live map toggle, then sources and the footer', async () => {
    render(<WeatherScreen />)
    expect(await screen.findByText(/Stay indoors 11 AM-3 PM/)).toBeTruthy() // 33 C at 70% is a heat index in the Danger band
    expect(screen.getByText(/Heat index 4\d° · Danger/)).toBeTruthy()
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(regions.slice(0, 8)).toEqual(['What to do', 'Now', 'Details', 'Rain and storm map', 'Next 48 hours', '10 days', 'Season and sun', 'Live weather map'])
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
    expect(screen.getByText('Today')).toBeTruthy()
    for (const n of ['PAGASA', 'Project NOAH', 'PANaHON']) expect(screen.getByText(n)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open live map' })).toBeTruthy()
    expect(screen.getByText('Forecast: Open-Meteo. Your rounded location is sent only to the weather service.')).toBeTruthy()
  })

  it('place toggle: Home 1 and Home 2 fetch their own forecast; without GPS the first button offers to use the location (N-2)', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(await screen.findByText(/Location is off for Bantay/)).toBeTruthy() // no GPS in the test: the tap says why instead of doing nothing (m-1)
    expect(screen.getByRole('button', { name: 'Home 1' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Home 2' }))
    expect(screen.getByRole('button', { name: 'Home 2' }).getAttribute('aria-pressed')).toBe('true')
    await vi.waitFor(() => expect(calls.some((u) => u.includes('latitude=6.2&'))).toBe(true))
    expect(await screen.findByText(/^Conel · updated/)).toBeTruthy()
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
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open live map' }))
    expect(screen.getByRole('button', { name: 'Hide live map' })).toBeTruthy()
  })
})

describe('route', () => {
  it('#weather and #weather?from=action open the weather view under Today', () => {
    expect(parseHash('#weather')).toEqual({ tab: 'today', view: 'weather' })
    expect(parseHash('#weather?from=action')).toEqual({ tab: 'today', view: 'weather' })
  })
})
