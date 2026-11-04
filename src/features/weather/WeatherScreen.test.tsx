import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, CHECKED_KEY, type Alert } from '../safety/alerts'
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
    expect(document.querySelector('.wx')!.getAttribute('data-contrast-bg')).toMatch(/^#[0-9a-f]{6}$/) // the page, not the hero, carries the pinned worst-case sky colour
    await screen.findByRole('region', { name: 'Live weather map' }) // appears once the position is known
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? document.getElementById(r.getAttribute('aria-labelledby')!)?.textContent)
    expect([...regions.slice(0, 2), ...regions.slice(2, 4).sort(), ...regions.slice(4, 8)]).toEqual(['Now', 'What to do', 'Next 48 hours', 'Rain chance', '10 days', 'Details', 'Live weather map', 'Official']) // rain card and strip swap places with the weather (adapt.test.tsx)
    const warnRow = screen.getByRole('link', { name: /Official warnings/ }) // directly under the hero, above What to do
    expect(heroes[0]!.compareDocumentPosition(warnRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(warnRow.compareDocumentPosition(screen.getByRole('region', { name: 'What to do' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('.wx-temp')?.textContent).toBe('33°')
    expect(screen.getByText('Partly cloudy')).toBeTruthy()
    const details = within(screen.getByRole('region', { name: 'Details' }))
    for (const t of ['Wind', 'Humidity', 'UV today']) expect(details.getByText(t)).toBeTruthy()
    expect(details.queryByText('Sunrise') ?? details.queryByText('Rain next 12 h')).toBeTruthy() // which one follows the weather
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
    for (const n of ['Rain chance', 'Next 48 hours', '10 days', 'Official']) expect(screen.getByRole('heading', { level: 2, name: n })).toBeTruthy()
    const links = within(screen.getByRole('group', { name: 'Official sources' })).getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const a of links) expect(a.getAttribute('target')).toBe('_blank')
    expect(document.querySelector('details')).toBeNull()
    expect(screen.getByText('How this is made')).toBeTruthy()
    expect(screen.getByText('Forecast for your area from Open-Meteo (global models, about 9 km). Official warnings: PAGASA.')).toBeTruthy()
  })

  describe('the Official warnings row does not need a forecast', () => {
    const signal = { id: 's3', kind: 'tcws', level: 'Signal No. 3', title: 'Wind Signal No. 3: Typhoon Invented', what: '', where: 'Dampas', when: 'now', doNow: 'Follow your local DRRMO.', source: 'PAGASA', sourceUrl: null, issuedAt: new Date().toISOString(), lat: null, lon: null, bulletin: '', checkedAt: new Date().toISOString() } as Alert
    const row = () => screen.findByRole('link', { name: /Official warnings/ })
    it('Signal No. 3 saved, the fetch fails, no cache: the page says so and still shows the row and the signal', async () => {
      await db.kv.put({ key: ALERTS_KEY, value: [signal] })
      await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
      render(<WeatherScreen />)
      await screen.findByText(/Could not load the forecast/)
      await waitFor(async () => expect((await row()).textContent).toContain('Signal No. 3'))
      expect((await row()).querySelector('[data-tint="red"]')).toBeTruthy()
    })
    it('the same while a slow fetch is still loading', async () => {
      await db.kv.put({ key: ALERTS_KEY, value: [signal] })
      let end: (e: Error) => void = () => undefined
      vi.stubGlobal('fetch', vi.fn(() => new Promise((_, no) => { end = no })))
      render(<WeatherScreen />)
      await screen.findByText(/Loading the forecast/)
      await waitFor(async () => expect((await row()).textContent).toContain('Signal No. 3'))
      end(new Error('done')) // settle it: the fetch is shared per point between renders
      await screen.findByText(/Could not load the forecast/)
    })
    it('nothing saved and never checked, the fetch fails: "Not checked lately", never a green all-clear', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
      render(<WeatherScreen />)
      await screen.findByText(/Could not load the forecast/)
      const r = await row()
      expect(r.textContent).toContain('Not checked lately')
      expect(r.querySelector('[data-tint="green"]')).toBeNull()
    })
  })

  it('R1 Official row: stopped ingest (checked 10 days ago) or never checked -> no "no warning" wording, no green tint', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: new Date(Date.now() - 10 * 86_400_000).toISOString() })
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    const row = screen.getByRole('link', { name: /Official warnings/ })
    await waitFor(() => expect(row.textContent).toContain('Not checked lately'))
    expect(row.textContent).not.toContain('no warning')
    expect(row.querySelector('[data-tint="green"]')).toBeNull()
  })

  it('Official row: PAGASA all clear near the place, else the alert title; links to the warnings page', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    const row = screen.getByRole('link', { name: /Official warnings/ })
    expect(row.getAttribute('href')).toBe('#safety/warnings')
    await waitFor(() => expect(row.textContent).toContain('PAGASA: no warning near Dampas'))
    cleanup()
    const alert: Alert = { id: 'a1', kind: 'tcws', level: 'Signal No. 2', title: 'Signal No. 2 for Bohol', what: '', where: 'Bohol', when: '', doNow: 'Stay home.', source: 'PAGASA', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 9.645705, lon: 123.877951, bulletin: '' }
    await db.kv.put({ key: ALERTS_KEY, value: [alert] })
    render(<WeatherScreen />)
    expect(await screen.findByText('Signal No. 2 for Bohol', { selector: '.rw-sub' })).toBeTruthy()
  })

  it('hero kicker: the placeWords title (last known for the last fix, your home area for the default); Updated on its own line', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    render(<WeatherScreen />)
    expect((await screen.findByTestId('place-last')).textContent).toContain('last known') // the zone chip
    await waitFor(() => expect(document.querySelector('.wx-k')?.textContent).toContain('last known'), { timeout: 5000 })
    await waitFor(() => { // the forecast for the last fix replaces the first one, so read the settled hero
      const now = within(screen.getByRole('region', { name: 'Now' }))
      now.getByText(/^Updated \d{1,2}:\d\d [AP]M$/); now.getByText(/^Feels like \d+°$/); now.getByText(/^H:\d+°\s+L:\d+°$/)
    }, { timeout: 5000 })
    cleanup()
    await db.kv.clear()
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(document.querySelector('.wx-k')!.textContent).toBe('Dampas · your home area')
  })

  it('blend plug point is absent by default; with bantay.flag.wx.blend an empty state and no numbers', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(screen.queryByRole('heading', { name: 'Next 2 hours' })).toBeNull()
    cleanup()
    localStorage.setItem('bantay.flag.wx.blend', '1')
    try {
      render(<WeatherScreen />)
      await screen.findByText('Partly cloudy')
      for (const n of ['Next 2 hours']) {
        const card = screen.getByRole('heading', { level: 2, name: n }).closest('section')!.querySelector('.empty-state')!
        expect(card.textContent).not.toMatch(/\d/)
        expect(card.textContent!.length).toBeGreaterThan(0)
      }
    } finally { localStorage.clear() }
  })

  it('X5: no Home 1 / Home 2 switch and no heat strip; the zone chip names the place and picks a home zone', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(screen.queryByRole('button', { name: 'Home 1' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Place' })).toBeNull()
    expect(document.querySelector('.wx-scale')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Place: / }))
    fireEvent.click(screen.getByRole('button', { name: 'Conel' }))
    await vi.waitFor(() => expect(calls.some((u) => u.includes('latitude=6.2&'))).toBe(true))
    expect(await screen.findByText(/^Updated \d/)).toBeTruthy()
  })

  it('a zone picked by hand wins over a fix: forecast and kicker use the zone; with no pick the fix still wins', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    await db.kv.put({ key: 'loc.zone', value: 'conel' })
    await db.kv.put({ key: 'wx.follow', value: 'zone' })
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    await waitFor(() => expect(calls.some((u) => u.includes('latitude=6.2&'))).toBe(true))
    expect(calls.some((u) => u.includes('latitude=10.3'))).toBe(false)
    expect(document.querySelector('.wx-k')!.textContent).not.toContain('last known')
    expect(screen.queryByTestId('place-last')).toBeNull()
    const map = within(screen.getByRole('region', { name: 'Live weather map' }))
    expect(map.getByText('The map follows your phone, not the home area you picked.')).toBeTruthy() // a fix exists, so never "position not known"
    expect(map.queryByText(/not known yet/)).toBeNull()
    expect(map.getByRole('button', { name: 'Use my location' })).toBeTruthy()
    cleanup()
    calls.length = 0
    await db.kv.delete('wx.follow')
    render(<WeatherScreen />)
    expect((await screen.findByTestId('place-last')).textContent).toContain('last known')
    await waitFor(() => expect(calls.some((u) => u.includes('latitude=10.3'))).toBe(true))
  })

  it('X4: the rain card labels both figures (daily and next hours)', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(screen.getByTestId('wx-rain-figures').textContent).toMatch(/^Today up to \d+% · Next 12 h \d+%$/)
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
    expect(await screen.findByText(/as of \d{1,2}:\d\d [AP]M, could not refresh/)).toBeTruthy()
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
    const map = within(await screen.findByRole('region', { name: 'Live weather map' })) // hidden while the position is pending, so it never flashes
    expect(map.getByRole('button', { name: 'Find me' })).toBeTruthy()
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
