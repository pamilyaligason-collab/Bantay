import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resetRefresh } from '../location/useLocation'
import { ALERTS_KEY, CHECKED_KEY, type Alert } from '../safety/alerts'
import { parseHash } from '../shell/routes'
import { openMeteoFixture } from './fixture'
import WeatherScreen from './WeatherScreen'
import { WX_PAUSE_KEY } from './WxLive'

const track = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../admin/events', () => ({ track }))

const calls: string[] = []
beforeEach(async () => {
  resetRefresh()
  await db.kv.clear()
  calls.length = 0
  track.mockClear()
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    calls.push(String(u))
    return new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 })), { status: 200 })
  }))
  location.hash = '#weather'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

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
    expect([...regions.slice(0, 4), ...regions.slice(4, 6).sort(), ...regions.slice(6, 10)]).toEqual(['Now', 'What to do', 'Next 2 hours', 'Live weather map', 'Next 48 hours', 'Rain chance', 'Storm check', '10 days', 'Details', 'Official']) // rain card and strip swap places with the weather (adapt.test.tsx)
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
    expect(screen.queryByText(/nothing to centre on/)).toBeNull() // the home zone is a point, so the map has something to centre on
    expect(screen.getByText('Your rounded location is sent only to the weather and map services.')).toBeTruthy()
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
    await db.kv.clear(); resetRefresh()
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(document.querySelector('.wx-k')!.textContent).toBe('Dampas · your home area')
  })

  it('blend plug point is absent by default; with bantay.flag.wx.blend an empty state and no numbers', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(screen.getByTestId('wx-next2h-est').querySelector('.empty-state')).toBeNull() // flag off: the 15-minute block from hourly data (X3), not the blend's empty state
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
    expect(map.queryByText(/not known yet/)).toBeNull() // a picked zone is a point: the map centres on it, no empty card (D-125)
    expect(screen.getByTestId('wx-live-map').querySelector('iframe')!.getAttribute('src')).toContain('&lat=6.20&lon=125.19&') // Conel 6.2015121, 125.1878084
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
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 5, 12, 0, 0) }) // noon local: an hour ago is still today, so this passes at any real hour
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

  it('D-125: the live map loads by default, one frame, Rain first; a layer change swaps the src and never stacks a frame', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    const card = await screen.findByTestId('wx-live-map')
    expect(screen.queryByRole('button', { name: 'Open live map' })).toBeNull()
    expect(within(card).getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['Rain'])
    expect(card.querySelectorAll('iframe')).toHaveLength(1)
    expect(card.querySelector('iframe')!.getAttribute('src')).toContain('overlay=rain')
    expect(card.querySelector('iframe')!.getAttribute('referrerpolicy')).toBe('no-referrer')
    fireEvent.click(within(card).getByRole('button', { name: 'Wind' }))
    expect(card.querySelectorAll('iframe')).toHaveLength(1)
    expect(card.querySelector('iframe')!.getAttribute('src')).toContain('overlay=wind')
    expect(card.textContent).toContain('Forecast map, not radar. Needs internet. For radar pictures, open PAGASA.')
  })

  it('D-125: Pause on mobile data is off by default, has its own key, and on cellular it holds the frame until Load live layer', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true })
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    await waitFor(() => expect(screen.getByTestId('wx-live-map').querySelector('iframe')!.getAttribute('src')).toMatch(/lat=10\.32/)) // settled on the last fix
    const card = screen.getByTestId('wx-live-map')
    const sw = within(card).getByRole('switch', { name: 'Pause on mobile data' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(card.querySelector('iframe')).not.toBeNull() // default off: cellular still loads
    fireEvent.click(sw)
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Load live layer' })).toBeTruthy())
    expect(card.querySelector('iframe')).toBeNull()
    expect((await db.kv.get('wx.windyPause'))?.value).toBe(true)
    delete (navigator as unknown as { connection?: unknown }).connection
    expect(await db.kv.get('safety.windyPause')).toBeUndefined() // Storm tracker's own switch is untouched
    fireEvent.click(within(card).getByRole('button', { name: 'Load live layer' }))
    await waitFor(() => expect(card.querySelector('iframe')).not.toBeNull())
  })

  it('D-125: Storms near you only with an advisory (listed storm, signal only, none, stale)', async () => {
    const NOWISO = new Date().toISOString()
    const storm = { id: 'gdacs-TC-9', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone SAMPLE', what: '', where: '', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: NOWISO, lat: 12, lon: 128, bulletin: '' } as Alert
    const sig = { id: 'tcws-1', kind: 'tcws', level: 'Signal No. 2', title: 'Wind signal', what: '', where: '', when: '', doNow: '', source: 'PAGASA', sourceUrl: null, issuedAt: NOWISO, lat: null, lon: null, bulletin: '' } as unknown as Alert
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [storm] })
    render(<WeatherScreen />)
    const near = await screen.findByTestId('wx-storms-near')
    expect(near.querySelectorAll('iframe')).toHaveLength(1)
    expect(near.querySelector('iframe')!.getAttribute('src')).toContain('overlay=wind')
    expect(near.textContent).toMatch(/Orange alert · since/)
    expect(within(near).getByRole('link', { name: /Storm tracker/ }).getAttribute('href')).toBe('#safety/storms')
    expect(screen.queryByTestId('wx-storms-none')).toBeNull()
    cleanup()
    await db.kv.put({ key: ALERTS_KEY, value: [sig] })
    render(<WeatherScreen />)
    expect((await screen.findByTestId('wx-storms-near')).textContent).toContain('A PAGASA wind signal is up, though GDACS lists no storm yet.')
    cleanup()
    await db.kv.put({ key: ALERTS_KEY, value: [] })
    render(<WeatherScreen />)
    const none = await screen.findByTestId('wx-storms-none')
    await waitFor(() => expect(none.textContent).toContain('No storm warnings for the Philippines right now.'))
    expect(none.textContent).not.toContain('GDACS')
    expect(screen.queryByTestId('wx-storms-near')).toBeNull()
    expect(none.querySelector('iframe')).toBeNull()
    cleanup()
    await db.kv.delete(CHECKED_KEY)
    render(<WeatherScreen />)
    const stale = await screen.findByTestId('wx-storms-none')
    expect(stale.textContent).toContain('Storms have not been checked lately')
    expect(stale.textContent).not.toContain('No storm warnings')
  })

  it('live map: without a fix the map centres on the home zone, no empty card', async () => {
    render(<WeatherScreen />)
    await screen.findByText('Partly cloudy')
    expect(screen.queryByRole('button', { name: 'Open live map' })).toBeNull()
    const map = within(await screen.findByRole('region', { name: 'Live weather map' }))
    expect(map.queryByRole('button', { name: 'Find me' })).toBeNull()
    const src = screen.getByTestId('wx-live-map').querySelector('iframe')!.getAttribute('src')!
    expect(src).toContain('&lat=9.65&lon=123.88&detailLat=9.65&detailLon=123.88&') // Dampas 9.645705, 123.877951 rounded to two places
  })

  it('live map: the last real fix centres the map', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } })
    render(<WeatherScreen />)
    expect((await screen.findByTestId('place-last')).textContent).toContain('last known')
    const src = (await screen.findByTestId('wx-live-map')).querySelector('iframe')!.getAttribute('src')!
    expect(src).toMatch(/lat=10\.32/)
    expect(src).not.toMatch(/lat=9\.65/)
  })
})

describe('Windy map: once, after the forecast settles; the storm map frame; offline; PAGASA link (D-128)', () => {
  const addedFrames = () => { // every iframe element that ever enters the page
    let n = 0
    const mo = new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((x) => { if (x instanceof Element) n += (x.matches('iframe') ? 1 : 0) + x.querySelectorAll('iframe').length }) })
    mo.observe(document.body, { childList: true, subtree: true })
    return { count: () => n, stop: () => mo.disconnect() }
  }
  const NOWISO = new Date().toISOString()
  const storm = (lat: number | null, lon: number | null) => ({ id: 'gdacs-TC-9', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone SAMPLE', what: '', where: 'Invented Sea', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: NOWISO, lat, lon, bulletin: '' }) as Alert

  it('a delayed forecast: no frame while it loads, then exactly one frame is ever mounted', async () => {
    let open: () => void = () => undefined
    const gate = new Promise<void>((res) => { open = res }) // every forecast call waits here, however late it is made
    vi.stubGlobal('fetch', vi.fn(async () => { await gate; return new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 })), { status: 200 }) }))
    const seen = addedFrames()
    render(<WeatherScreen />)
    await screen.findByText(/Loading the forecast/)
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.queryByTestId('wx-live-map')).toBeNull()
    open()
    await screen.findByText('Partly cloudy')
    await screen.findByTestId('wx-live-map')
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    expect(seen.count()).toBe(1)
    seen.stop()
  })

  it('the forecast failed but a point exists: the map still shows, once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const seen = addedFrames()
    render(<WeatherScreen />)
    await screen.findByText(/Could not load the forecast/)
    expect((await screen.findByTestId('wx-live-map')).querySelectorAll('iframe')).toHaveLength(1)
    expect(seen.count()).toBe(1)
    seen.stop()
  })

  it('storm map frame: the place (Dampas 9.645705, 123.877951) and a storm at 12N 128E, centred halfway at zoom 6 and 23 px south of the midpoint, pin on the place', async () => {
    // about 521 km apart (261.8 km north, 450.2 km east): zoom 6 is 300 to 600 km. Windy is Mercator, so the middle is the Mercator midpoint: y 0.16916 and 0.21099 average 0.19007, which is 10.825 degrees -> 10.83; the map sits 23 px lower so the pin clears Windy's bottom controls: 23 / (256 * 64 / 360 / cos 10.8) = 0.50 degrees, so 10.33; 125.94 east.
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [storm(12, 128)] })
    render(<WeatherScreen />)
    const src = (await screen.findByTestId('wx-storms-near')).querySelector('iframe')!.getAttribute('src')!
    expect(src).toContain('zoom=6&overlay=wind')
    expect(src).toContain('&lat=10.33&lon=125.94&detailLat=9.65&detailLon=123.88&')
  })

  it('signal only, or a storm with no position: the place alone at zoom 5, pin on the place', async () => {
    const sig = { id: 'tcws-1', kind: 'tcws', level: 'Signal No. 2', title: 'Wind signal', what: '', where: '', when: '', doNow: '', source: 'PAGASA', sourceUrl: null, issuedAt: NOWISO, lat: null, lon: null, bulletin: '' } as unknown as Alert
    for (const list of [[sig], [storm(null, null)]]) {
      await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: list })
      render(<WeatherScreen />)
      const src = (await screen.findByTestId('wx-storms-near')).querySelector('iframe')!.getAttribute('src')!
      expect(src).toContain('zoom=5&overlay=wind')
      expect(src).toContain('&lat=9.65&lon=123.88&detailLat=9.65&detailLon=123.88&')
      cleanup()
    }
  })

  it('the PAGASA bulletin link, and no invented source line on the storm card', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [storm(12, 128)] })
    render(<WeatherScreen />)
    const near = await screen.findByTestId('wx-storms-near')
    const a = within(near).getByRole('link', { name: /PAGASA bulletin/ })
    expect(a.getAttribute('href')).toBe('https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toContain('noopener')
    expect(near.textContent).not.toContain('checked every 10 minutes')
  })

  it('offline: both map cards say "Maps need internet" and load no frame', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    try {
      await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [storm(12, 128)] })
      render(<WeatherScreen />)
      const live = await screen.findByTestId('wx-live-map')
      await waitFor(() => expect(within(live).getByText('Maps need internet')).toBeTruthy())
      expect(within(await screen.findByTestId('wx-storms-near')).getByText('Maps need internet')).toBeTruthy()
      expect(document.querySelector('iframe')).toBeNull()
    } finally { delete (navigator as unknown as { onLine?: unknown }).onLine }
  })

  it('the calm card is one line with a status dot: green when checked, amber when not', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [] })
    render(<WeatherScreen />)
    const calm = await screen.findByTestId('wx-storms-none')
    await waitFor(() => expect(calm.querySelector('.wx-dot')!.getAttribute('data-tone')).toBe('calm'))
    cleanup()
    await db.kv.delete(CHECKED_KEY)
    render(<WeatherScreen />)
    expect((await screen.findByTestId('wx-storms-none')).querySelector('.wx-dot')!.getAttribute('data-tone')).toBe('watch')
  })

  it('round 3: the calm card says when it was checked, and Storm tracker is a chevron row', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: new Date(Date.now() - 12 * 60_000).toISOString() }); await db.kv.put({ key: ALERTS_KEY, value: [] })
    render(<WeatherScreen />)
    const calm = await screen.findByTestId('wx-storms-none')
    await waitFor(() => expect(within(calm).getByText('Checked 12 min ago')).toBeTruthy())
    const go = within(calm).getByRole('link', { name: /^Storm tracker/ })
    expect(go.className).toBe('wx-go')
    expect(go.getAttribute('href')).toBe('#safety/storms')
    expect(go.querySelector('svg')).not.toBeNull() // the shared chevron Icon, not a text arrow
  })

  it('the credit reads "Map by Windy" in every state: no Live, no dot (a frame fires load on an error page too)', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [storm(12, 128)] })
    render(<WeatherScreen />)
    const credits = async () => (await Promise.all(['wx-live-map', 'wx-storms-near'].map(async (id) => (await screen.findByTestId(id)).querySelector('.wx-credit')!)))
    for (const id of ['wx-live-map', 'wx-storms-near']) await waitFor(() => expect(screen.getByTestId(id).querySelector('iframe')).not.toBeNull())
    for (const c of await credits()) { expect(c.textContent).toBe('Map by Windy'); expect(c.querySelector('.wx-dot')).toBeNull() } // mounted, not loaded
    for (const id of ['wx-live-map', 'wx-storms-near']) fireEvent.load(screen.getByTestId(id).querySelector('iframe')!)
    for (const c of await credits()) expect(c.textContent).toBe('Map by Windy') // loaded
    try {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      fireEvent(window, new Event('offline'))
      await waitFor(() => expect(screen.getAllByText('Maps need internet')).toHaveLength(2))
      for (const c of await credits()) { expect(c.textContent).toBe('Map by Windy'); expect(c.querySelector('.wx-dot')).toBeNull() } // offline
    } finally { delete (navigator as unknown as { onLine?: unknown }).onLine }
    cleanup()
    fireEvent(window, new Event('online'))
    Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true })
    await db.kv.put({ key: WX_PAUSE_KEY, value: true }) // cellular alone does not hold the map: Pause must be on
    try {
      render(<WeatherScreen />)
      await waitFor(() => expect(within(screen.getByTestId('wx-live-map')).getByRole('button', { name: 'Load live layer' })).toBeTruthy())
      for (const c of await credits()) expect(c.textContent).toBe('Map by Windy') // held by Pause
    } finally { delete (navigator as unknown as { connection?: unknown }).connection }
  })

  it('S21 P: the storm map frame title says what the frame holds', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO })
    for (const [list, title] of [[[storm(12, 128)], 'Windy wind map framed on your place and the nearest storm'], [[storm(60, 124)], 'Windy wind map of your place']] as const) {
      await db.kv.put({ key: ALERTS_KEY, value: [...list] })
      render(<WeatherScreen />)
      expect((await screen.findByTestId('wx-storms-near')).querySelector('iframe')!.getAttribute('title')).toBe(title)
      cleanup()
    }
  })

  it('round 3: a storm too far to share the frame says so under the map', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [storm(60, 124)] })
    render(<WeatherScreen />)
    const near = await screen.findByTestId('wx-storms-near')
    expect(near.textContent).toContain('The storm is too far to share this map with your place')
    expect(near.querySelector('iframe')!.getAttribute('src')).toContain('zoom=5&overlay=wind')
  })

  it('round 3: while the forecast cannot load, the storm card keeps no invented source line and has a Storm tracker link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await db.kv.put({ key: CHECKED_KEY, value: NOWISO }); await db.kv.put({ key: ALERTS_KEY, value: [storm(12, 128)] })
    render(<WeatherScreen />)
    await screen.findByText(/Could not load the forecast/)
    const card = await screen.findByTestId('wx-storm')
    expect(card.textContent).not.toMatch(/checked every 10 minutes|From GDACS and Open-Meteo/)
    expect(within(card).getByRole('link', { name: /^Storm tracker/ }).getAttribute('href')).toBe('#safety/storms')
    expect(within(card).getByRole('link', { name: /PAGASA bulletin/ })).toBeTruthy()
  })

  it('with the blended forecast on, the privacy line also says what the map gets', async () => {
    localStorage.setItem('bantay.flag.wx.blend', '1')
    try {
      render(<WeatherScreen />)
      expect(await screen.findByText(/The map gets the same rounded location\./)).toBeTruthy()
    } finally { localStorage.removeItem('bantay.flag.wx.blend') }
  })
})

describe('route', () => {
  it('#weather and #weather?from=action open the weather view under Today', () => {
    expect(parseHash('#weather')).toEqual({ tab: 'today', view: 'weather' })
    expect(parseHash('#weather?from=action')).toEqual({ tab: 'today', view: 'weather' })
  })
})
