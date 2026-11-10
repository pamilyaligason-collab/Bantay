import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import type { Alert } from '../safety/alerts'
import { openMeteoFixture, type FixtureOpts } from './fixture'
import WeatherScreen from './WeatherScreen'

// A3: the Weather screen is fresh and follows the current weather. Made-up forecasts; the clock is fixed at 12:00 in Manila so nothing depends on when the test runs.
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const NOW = new Date('2026-11-03T04:00:00Z') // 12:00 in Manila
const calls = { n: 0 }
const serve = (o: FixtureOpts) => vi.stubGlobal('fetch', vi.fn(async (u: unknown) => { if (String(u).includes('air-quality')) return new Response('{}'); calls.n++; return new Response(JSON.stringify(openMeteoFixture({ now: NOW, ...o })), { status: 200 }) }))
const DRY: FixtureOpts = { code: 0, temp: 28, humidity: 50, hourlyProb: () => 5 }
const names = () => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? document.getElementById(r.getAttribute('aria-labelledby')!)?.textContent)
const before = (a: string, b: string) => { const n = names(); return n.indexOf(a) >= 0 && n.indexOf(a) < n.indexOf(b) }
const ageCache = async (ms: number) => { // make the saved reading look `ms` old so the next call goes to the network
  for (const r of await db.kv.toArray()) if (r.key.startsWith('weather.forecast.')) await db.kv.put({ key: r.key, value: { ...(r.value as object), fetchedAt: new Date(Date.now() - ms).toISOString() } })
}

beforeEach(async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); await db.kv.clear(); calls.n = 0; location.hash = '#weather'; localStorage.setItem('bantay.flag.wx.blend', '0') // the blend is on by default since 2026-11-10; these tests cover the direct Open-Meteo path
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Weather stays fresh', () => {
  it('asks again when the app comes back to the front, once the reading is 10 minutes old', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    const first = calls.n
    document.dispatchEvent(new Event('visibilitychange')) // a young reading is reused: no new request
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(calls.n).toBe(first)
    await ageCache(11 * 60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(calls.n).toBe(first + 1))
  })
  it('asks again on a timer while open', async () => {
    serve(DRY)
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(NOW)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    const first = calls.n
    await ageCache(11 * 60_000)
    await act(async () => { vi.advanceTimersByTime(5 * 60_000 + 10) })
    await waitFor(() => expect(calls.n).toBeGreaterThan(first))
  })
  it('asks again when the network comes back', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    const first = calls.n
    await ageCache(11 * 60_000)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(calls.n).toBe(first + 1))
  })
  it('does not ask while the page is hidden, and asks once it shows again', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    const first = calls.n
    await ageCache(11 * 60_000)
    let state: DocumentVisibilityState = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
      expect(calls.n).toBe(first)
      state = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await waitFor(() => expect(calls.n).toBe(first + 1))
    } finally { delete (document as { visibilityState?: unknown }).visibilityState }
  })
  it('after the screen closes nothing asks again: not the online event, not the page showing, not the timer', async () => {
    serve(DRY)
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(NOW)
    const { unmount } = render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    const first = calls.n
    unmount()
    await ageCache(11 * 60_000)
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => { vi.advanceTimersByTime(30 * 60_000) })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(calls.n).toBe(first)
    expect(vi.getTimerCount()).toBe(0) // the refresh timer and the minute tick are both cleared
  })
  it('a request that hangs ends as "could not refresh", not as the old "Updated" time', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    // a fetch that only ends when its signal does; the 8 s wait runs on the fake clock
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, no) => { init?.signal?.addEventListener('abort', () => no(new DOMException('timed out', 'AbortError'))) })))
    await ageCache(11 * 60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    await act(async () => { vi.advanceTimersByTime(8_000) })
    expect(await screen.findByText(/as of \d{1,2}:\d\d [AP]M, could not refresh/)).toBeTruthy()
    expect(screen.queryByText(/Updated \d/)).toBeNull()
  })
  it('left open and offline for more than a day, the old reading is not shown as current', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down') }))
    vi.setSystemTime(new Date(NOW.getTime() + 25 * 3600_000))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText(/Could not load the forecast/)).toBeTruthy()
    expect(document.querySelector('.wx-temp')).toBeNull()
    expect(screen.queryByText(/Updated \d|as of/)).toBeNull()
  })
  it('a day-old reading is still shown with "as of" before the 24 hours are up', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down') }))
    vi.setSystemTime(new Date(NOW.getTime() + 23 * 3600_000))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText(/as of \d{1,2}:\d\d [AP]M yesterday, could not refresh/)).toBeTruthy()
  })
  it('when a refresh fails it keeps the last reading and says so, never "Updated"', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText(/Updated \d/)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down') }))
    await ageCache(11 * 60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText(/as of \d{1,2}:\d\d [AP]M, could not refresh/)).toBeTruthy()
    expect(screen.queryByText(/Updated \d/)).toBeNull()
    expect(document.querySelector('.wx-temp')?.textContent).toBe('28°')
  })
})

describe('Weather follows the conditions', () => {
  it('raining now: the rain card leads the 48-hour strip, Rain next 12 h replaces Sunrise, the scene rains', async () => {
    serve({ code: 63, temp: 27, humidity: 90, hourlyProb: () => 85 })
    render(<WeatherScreen />)
    await screen.findByText('Rainy')
    expect(before('Rain chance', 'Next 48 hours')).toBe(true)
    expect(screen.getByText('Rain next 12 h')).toBeTruthy()
    expect(screen.queryByText('Sunrise')).toBeNull()
    expect(document.querySelector('.wxs')?.getAttribute('data-cond')).toBe('rain')
  })
  it.each([[63, 'rain'], [95, 'storm']])('code %i falling now with a low chance still counts as wet: rain card first, tile shows the figure', async (code, cond) => {
    serve({ code, temp: 27, humidity: 90, hourlyProb: () => 5 })
    render(<WeatherScreen />)
    await waitFor(() => expect(document.querySelector('.wxs')?.getAttribute('data-cond')).toBe(cond))
    expect(before('Rain chance', 'Next 48 hours')).toBe(true)
    expect(screen.getByText('Rain next 12 h').parentElement?.textContent).toContain('Low chance')
  })
  it.each([[63, 'Raining now'], [95, 'Thunderstorm now']])('code %i with a low chance and strong sun: the What to do card says it is falling, no calm line, no sun tip', async (code, words) => {
    serve({ code, temp: 27, humidity: 90, uvMax: 10, hourlyProb: () => 5 })
    render(<WeatherScreen />)
    await waitFor(() => expect(screen.getByTestId('wx-advice').textContent).toContain(words))
    expect(screen.getByTestId('wx-advice').textContent).not.toMatch(/Nothing to act on|No heat, rain|Strong sun/)
  })
  it('unknown rain chances while it rains show n/a, never 0%', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const j = openMeteoFixture({ now: NOW, code: 63, temp: 27, humidity: 90 })
      j.hourly.precipitation_probability = j.hourly.precipitation_probability.map(() => null as unknown as number)
      return new Response(JSON.stringify(j), { status: 200 })
    }))
    render(<WeatherScreen />)
    const tile = (await screen.findByText('Rain next 12 h')).parentElement!
    expect(tile.textContent).toContain('n/a')
    expect(tile.textContent).not.toContain('0%')
  })
  it.each([1, 5, 7, 11])('rain likely %i h from now: the rain line and the Rain next 12 h tile never disagree', async (ahead) => {
    const h = (NOW.getUTCHours() + 8 + ahead) % 24
    serve({ code: 0, temp: 28, humidity: 50, hourlyProb: (x) => (x === h ? 85 : 5) })
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    const line = screen.getByTestId('wx-advice').textContent ?? ''
    expect(line).toContain('Rain likely') // the line looks 12 h ahead ...
    expect(screen.getByText('Rain next 12 h').parentElement?.textContent).toContain('85%') // ... so the tile does too
  })
  it('no rain likely in the next 12 h: the tile never claims a high chance', async () => {
    const h = (NOW.getUTCHours() + 8 + 13) % 24 // 13 h away, outside both windows
    serve({ code: 63, temp: 27, humidity: 90, hourlyProb: (x) => (x === h ? 90 : 5) })
    render(<WeatherScreen />)
    await screen.findByText('Rainy')
    expect(screen.getByTestId('wx-advice').textContent).not.toContain('Rain likely')
    expect(screen.getByText('Rain next 12 h').parentElement?.textContent).toContain('Low chance')
  })
  it('clear and dry: the strip comes first, Sunrise stays, no rain tile, the sky is clear', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    expect(before('Next 48 hours', 'Rain chance')).toBe(true)
    expect(screen.getByText('Sunrise')).toBeTruthy()
    expect(screen.queryByText('Rain next 12 h')).toBeNull()
    expect(document.querySelector('.wxs')?.getAttribute('data-cond')).toBe('clear')
  })
  it('dry now but rain likely later today: rain card first, tile follows', async () => {
    const h = (NOW.getUTCHours() + 8 + 2) % 24 // two hours from now, place-local (14:00)
    serve({ code: 0, temp: 28, humidity: 50, hourlyProb: (x) => (x === h || x === (h + 1) % 24 ? 85 : 5) })
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    expect(before('Rain chance', 'Next 48 hours')).toBe(true)
    expect(screen.getByText('Rain next 12 h')).toBeTruthy()
  })
  it('a storm is listed: the storm track sits above What to do and the rain card', async () => {
    await db.kv.put({ key: 'alerts:checkedAt', value: NOW.toISOString() })
    const a = { id: 'gdacs-TC-1', kind: 'gdacs', level: null, title: 'Tropical Cyclone INVENTED', what: '', where: '', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: NOW.toISOString(), lat: 12, lon: 128, bulletin: '' } as Alert
    await db.kv.put({ key: 'safety.alerts', value: [a] })
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    expect(before('Storm track', 'What to do')).toBe(true)
    expect(before('Storm track', 'Rain chance')).toBe(true)
  })
  it('a storm is listed and the forecast cannot load: the storm track still shows', async () => {
    await db.kv.put({ key: 'alerts:checkedAt', value: NOW.toISOString() })
    await db.kv.put({ key: 'safety.alerts', value: [{ id: 'gdacs-TC-2', kind: 'gdacs', level: null, title: 'Tropical Cyclone INVENTED', what: '', where: '', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: NOW.toISOString(), lat: 12, lon: 128, bulletin: '' }] })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down') }))
    render(<WeatherScreen />)
    await screen.findByText(/Could not load the forecast/)
    expect(screen.getByRole('region', { name: 'Storm track' })).toBeTruthy()
  })
  it('no storm listed: no storm card', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    expect(names()).not.toContain('Storm track')
  })
  it('very hot: the heat guidance is the first thing under the hero and the scene is hot', async () => {
    serve({ code: 0, temp: 36, humidity: 75, hourlyProb: () => 5 })
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    expect(screen.getByTestId('wx-advice').getAttribute('data-id')).toBe('heat')
    const n = names()
    expect(n.slice(0, 2)).toEqual(['Now', 'What to do']) // no card between the hero and the heat guidance (the warning row is a link, not a card)
    expect(document.querySelector('.wxs')?.getAttribute('data-hot')).toBe('1')
  })
  it('no typhoon-season sentence: there is no sourced rule for its dates', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    expect(screen.queryByText(/typhoon season/i)).toBeNull()
  })
})

describe('S29 W: the Weather screen tells one rain story while it rains', () => {
  it('Now cell: the current temperature and "Raining", never the hourly 34 degrees and "Low chance"; Next 2 hours does not say "No rain"; the place is said once', async () => {
    serve({ code: 63, temp: 27, humidity: 90, hourlyProb: () => 5 })
    render(<WeatherScreen />)
    await screen.findByText('Rainy')
    const first = within(screen.getByRole('list', { name: /Next 48 hours/ })).getAllByRole('listitem')[0]!
    expect(first.textContent).toContain('Now')
    expect(first.textContent).toContain('27°')
    expect(first.textContent).toContain('Raining')
    expect(first.textContent).not.toContain('Low chance')
    expect(screen.getByTestId('wx-next2h-est').textContent ?? '').not.toMatch(/No rain in the next/)
    expect(screen.getByTestId('wx-hero').querySelector('.wx-k')).toBeNull()
    expect(screen.getByTestId('forecast-note').textContent).toBe('Weather data by Open-Meteo.com')
  })
  it('no fix: the hero says "Location off: showing <place>" like Today', async () => {
    serve(DRY)
    render(<WeatherScreen />)
    await screen.findByText('Clear')
    expect(screen.getByTestId('location-off').textContent).toMatch(/^Location off: showing /)
  })
})
