import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, CHECKED_KEY, EONET_KEY, type Alert } from '../safety/alerts'
import { ALERT_KEY } from './prefs'
import { PANEL_KEY } from './panels'

const flags = vi.hoisted(() => ({ worldFeeds: false, phivolcs: false, eonet: false, digest: false, offlineMaps: false }))
const seen = vi.hoisted(() => ({ map: null as null | { center: [number, number]; zoom: number; setup?: (L: never, m: never) => void } }))
const proto = vi.hoisted(() => ({ opts: null as null | Record<string, unknown> }))
// LazyMap stays real; the wrapper only keeps the props World hands it (jsdom never builds the Leaflet map, so the pins are drawn by calling setup with a fake Leaflet).
vi.mock('../safety/LazyMap', async (orig) => { const real = await orig<typeof import('../safety/LazyMap')>(); return { default: (p: Parameters<typeof real.default>[0]) => { seen.map = p; return <real.default {...p} /> } } })
vi.mock('protomaps-leaflet', () => ({ leafletLayer: (o: Record<string, unknown>) => { proto.opts = o; return {} } }))
vi.mock('pmtiles', () => ({ PMTiles: class {} }))
const feed = vi.hoisted(() => ({ v: { state: 'off', news: [], digest: null } as import('./useWorldNews').WorldNews }))
vi.mock('./useWorldNews', async (orig) => ({ ...(await orig<typeof import('./useWorldNews')>()), useWorldNews: () => feed.v }))
vi.mock('../safety/flags', () => ({ FLAGS: flags }))
vi.mock('../location/useLocation', () => ({
  useLocation: () => ({}),
  usePlaceFrom: () => ({ weather: { lat: 9.6457, lon: 123.878 }, zone: 'dampas', source: 'zone' })
}))
vi.mock('../location/ZonePicker', () => ({ default: () => <span>chip</span> }))
import World from './World'
import { basemapLayer, pickBasemap, type BasemapEntry } from '../safety/basemap'

const quake: Alert = { id: 'q1', kind: 'quake', level: 'M5.1', title: 'M5.1 quake near Bohol', what: '', where: '', when: '', doNow: '', source: 'USGS', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 9.7, lon: 123.9, bulletin: '' }

beforeEach(async () => { await db.kv.clear(); Object.assign(flags, { worldFeeds: false, phivolcs: false, eonet: false, digest: false, offlineMaps: false }); feed.v = { state: 'off', news: [], digest: null } })
afterEach(() => { cleanup(); vi.useRealTimers() })
const eonet = { ...quake, id: 'eonet-1', kind: 'eonet', level: null, title: 'Volcano eruption, Example Island', what: 'Open event', source: 'NASA EONET', issuedAt: '2026-11-05T00:00:00Z', lat: 40, lon: 10 } as unknown as Alert
const volc = { ...quake, id: 'v1', kind: 'volcano', level: 'Level 2', title: 'Example volcano level 2', source: 'PHIVOLCS', issuedAt: '2026-11-05T00:00:00Z' } as Alert

describe('World', () => {
  it('with no alerts and a fresh check the three lists show their empty lines', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
    render(<World />)
    expect(await screen.findByText('No active hazards at Dampas or Conel')).toBeTruthy()
    expect(screen.getByText('No official warnings right now')).toBeTruthy()
    expect(screen.getByText('No big events listed by GDACS')).toBeTruthy()
    expect(screen.queryByText(/may be out of date/i)).toBeNull()
  })
  it('the map card runs edge to edge at 300 px and the key lists the pin colours', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake] })
    render(<World />)
    const card = await screen.findByTestId('world-map')
    expect(card.parentElement!.parentElement!.className).toBe('wd-bleed') // LazyMap region inside the bleed wrapper (negative gutter in world.css)
    expect(card.style.getPropertyValue('--h')).toBe('300px')
    expect(screen.getByText('You').parentElement!.querySelector('.wd-mark.wd-you svg')).toBeTruthy() // a symbol, not a bare dot
    await waitFor(() => expect(document.querySelector('.wd-legend .wd-mark.wd-quake svg')).toBeTruthy()) // the key symbol, with its text label beside it
    expect(screen.getByText('Quake')).toBeTruthy()
    expect(document.querySelector('.wd-dot')).toBeNull()
  })
  it('pins are symbols in tinted circles on the map itself', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake, volc] })
    render(<World />)
    await waitFor(() => expect(document.querySelectorAll('.wd-legend .wd-quake, .wd-legend .wd-volcano').length).toBe(2)) // the pins are in by now
    const drawn: { at: number[]; html: string }[] = []
    const L = { divIcon: (o: { html: string }) => o, marker: (at: number[], o: { icon: { html: string } }) => { const m = { bindTooltip: () => m, addTo: () => m }; drawn.push({ at, html: o.icon.html }); return m } }
    seen.map!.setup!(L as never, {} as never)
    const kind = (d: { html: string }) => /wd-(?!mark)(\w+)/.exec(d.html)![1]
    expect(drawn.map(kind).sort()).toEqual(['quake', 'volcano', 'you']) // a symbol for the family place, then one per alert
    expect(drawn.every((d) => d.html.includes('<svg'))).toBe(true)
    expect(drawn.find((d) => kind(d) === 'quake')!.at).toEqual([9.7, 123.9])
  })
  it('flag on: at the start view of the card (zoom 4 over the Philippines) the world overview streams, and its labels are English', async () => {
    flags.offlineMaps = true
    render(<World />)
    await screen.findByTestId('world-map')
    const { center: [lat, lon], zoom } = seen.map!
    expect(zoom).toBe(4) // inside the world file's zoom 0-6, so the overview, not the area files and not OSM pictures
    const WORLD: BasemapEntry = { code: 'world', version: 1, checksum: 'w1', size: 10, path: 'world/basemap-w1.pmtiles', bounds: [60, -15, 160, 55], minzoom: 0, maxzoom: 6 }
    const choice = pickBasemap({ lat, lon, zoom }, { online: true, entries: [WORLD], stored: [] })
    expect(choice).toEqual({ kind: 'stream', entry: WORLD })
    vi.stubEnv('VITE_SUPABASE_URL', 'https://files.test')
    const on: Record<string, () => void> = {}
    const added: unknown[] = []
    const group = { on: (e: string, f: () => void) => { on[e] = f }, addLayer: (l: unknown) => { added.push(l) } }
    basemapLayer({ layerGroup: () => group, tileLayer: () => ({ osm: true }) } as never, choice)
    on.add!()
    await waitFor(() => expect(proto.opts).not.toBeNull())
    expect(proto.opts).toMatchObject({ lang: 'en', url: 'https://files.test/storage/v1/object/public/region-packs/world/basemap-w1.pmtiles' })
    vi.unstubAllEnvs()
  })
  it('R1 stopped ingest (checked 10 days ago): no "none" lines, the outdated note shows', async () => {
    await db.kv.put({ key: CHECKED_KEY, value: new Date(Date.now() - 10 * 86_400_000).toISOString() })
    render(<World />)
    expect((await screen.findAllByText(/Not checked lately/)).length).toBe(3)
    expect(screen.queryByText('No official warnings right now')).toBeNull()
    expect(screen.queryByText('No active hazards at Dampas or Conel')).toBeNull()
    expect(screen.getAllByRole('status').some((s) => /may be out of date/.test(s.textContent ?? ''))).toBe(true)
  })
  it('hides the feed sections and the volcano row while their flags are off', () => {
    render(<World />)
    for (const t of ['Forecasts to watch', 'Macro and news', 'Volcanoes', 'Your panels']) expect(screen.queryByRole('heading', { name: t })).toBeNull()
    expect(screen.queryByText('Volcano alert levels')).toBeNull()
  })
  it('shows the feed sections as empty states when the flag is on', () => {
    flags.worldFeeds = true; flags.phivolcs = true
    render(<World />)
    expect(screen.getByRole('heading', { name: 'Forecasts to watch' })).toBeTruthy()
    expect(screen.getByText('Volcano alert levels')).toBeTruthy()
  })
  it('lists a real alert and the filter hides the other lists', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake] })
    await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
    render(<World />)
    expect((await screen.findAllByText('M5.1 quake near Bohol')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'World' }))
    expect(screen.queryByText('M5.1 quake near Bohol')).toBeNull()
    expect(screen.getByText('No big events listed by GDACS')).toBeTruthy()
  })
  it('flag off: there is no Daily digest card at all', async () => {
    render(<World />)
    await screen.findByTestId('world-map')
    expect(screen.queryByText(/Daily digest/)).toBeNull()
  })
  it('the digest card shows the saved time and links to the settings', async () => {
    flags.digest = true
    await db.kv.put({ key: ALERT_KEY, value: { digestTime: '06:30' } })
    render(<World />)
    await waitFor(() => expect(screen.getByText('Daily digest (coming) · 06:30')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#safety/alerts')
  })
  it('flags off: an EONET row in the table is not listed, pinned or counted', async () => {
    await db.kv.put({ key: EONET_KEY, value: [eonet] })
    await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
    render(<World />)
    expect(await screen.findByText('No big events listed by GDACS')).toBeTruthy()
    expect(screen.queryByText(eonet.title)).toBeNull()
  })
  it('flags off: an EONET row inside the official list is hidden as well (lane A + G together)', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [eonet] })
    await db.kv.put({ key: EONET_KEY, value: [eonet] })
    await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
    render(<World />)
    expect(await screen.findByText('No big events listed by GDACS')).toBeTruthy()
    expect(screen.queryByText(eonet.title)).toBeNull()
  })
  it('FLAGS.eonet on: the EONET row lists under World and under Forecasts and Volcanoes', async () => {
    flags.eonet = true; flags.worldFeeds = true
    await db.kv.put({ key: EONET_KEY, value: [eonet] })
    await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
    render(<World />)
    expect((await screen.findAllByText(eonet.title)).length).toBe(3) // World list, Forecasts, Volcano bulletins
    expect(screen.getByRole('list', { name: 'Forecasts to watch' }).textContent).toContain('NASA EONET')
    expect(screen.getByRole('list', { name: 'Volcano bulletins' }).textContent).toContain(eonet.title)
  })
  it('worldFeeds on and no data: honest lines, no invented rows', async () => {
    flags.worldFeeds = true
    await db.kv.put({ key: CHECKED_KEY, value: new Date().toISOString() })
    render(<World />)
    expect(await screen.findByText('No forecasts listed yet.')).toBeTruthy()
    expect(screen.getByText('No headlines yet.')).toBeTruthy()
    expect(screen.getByText('No volcano bulletins listed right now.')).toBeTruthy()
  })
  it('a failed headline read says so', () => {
    flags.worldFeeds = true; feed.v = { state: 'error', news: [], digest: null }
    render(<World />)
    expect(screen.getByText('Could not load headlines. Try again later.')).toBeTruthy()
  })
  it('headlines are plain text links that open out with noopener noreferrer', () => {
    flags.worldFeeds = true
    feed.v = { state: 'ok', digest: null, news: [{ id: 'n1', title: '<b>Fuel prices</b> change', url: 'https://news.example/a', source: 'news.example', seenAt: '2026-11-05T00:00:00Z' }] }
    render(<World />)
    const a = screen.getByText('<b>Fuel prices</b> change').closest('a')!
    expect(a.getAttribute('href')).toBe('https://news.example/a')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.querySelectorAll('b').length).toBe(1) // only the row title: the markup in the headline stayed text
  })
  it('a volcano alert fills the Volcanoes panel', async () => {
    flags.worldFeeds = true
    await db.kv.put({ key: ALERTS_KEY, value: [volc] })
    render(<World />)
    expect(await screen.findByRole('list', { name: 'Volcano bulletins' })).toBeTruthy()
  })
  it('Manage panels turns a panel off and keeps the choice', async () => {
    flags.worldFeeds = true
    render(<World />)
    expect(screen.getByRole('heading', { name: 'Macro and news' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Manage panels' }))
    const sw = screen.getByRole('switch', { name: 'Macro and news' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Macro and news' })).toBeNull())
    expect((await db.kv.get(PANEL_KEY))?.value).toEqual({ forecasts: true, macro: false, volcanoes: true })
    expect(screen.getByRole('heading', { name: 'Forecasts to watch' })).toBeTruthy()
  })
  describe('digest card (clock pinned)', () => {
    const digest = { day: '2026-11-05', total: 2, summary: 'Two warnings, none urgent.', sources: 'PAGASA, USGS', top: [{ id: 'a', title: 'Example warning', kind: 'tcws', level: null, source: 'PAGASA' }] }
    const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.parse(iso)) }
    it('shows the digest from the chosen time on, on the same Manila day', () => {
      flags.digest = true; feed.v = { state: 'ok', news: [], digest }; at('2026-11-05T00:30:00Z') // 08:30 in Manila
      render(<World />)
      expect(screen.getByText('Two warnings, none urgent.')).toBeTruthy()
      expect(screen.getByText(/Example warning · PAGASA/)).toBeTruthy()
      expect(screen.queryByText(/coming/)).toBeNull()
    })
    it('before the chosen time it keeps the coming line', () => {
      flags.digest = true; feed.v = { state: 'ok', news: [], digest }; at('2026-11-04T22:30:00Z') // 06:30 on the 5th
      render(<World />)
      expect(screen.getByText('Daily digest (coming) · 07:00')).toBeTruthy()
    })
    it('after midnight in Manila, yesterday digest is not shown as today', () => {
      flags.digest = true; feed.v = { state: 'ok', news: [], digest }; at('2026-11-05T16:30:00Z') // 00:30 on the 6th
      render(<World />)
      expect(screen.getByText('Daily digest (coming) · 07:00')).toBeTruthy()
    })
    it('an empty day says so plainly', () => {
      flags.digest = true; feed.v = { state: 'ok', news: [], digest: { ...digest, total: 0, top: [], summary: 'No warnings in the last 24 h' } }; at('2026-11-05T00:30:00Z')
      render(<World />)
      expect(screen.getByText('No warnings in the last 24 h')).toBeTruthy()
    })
    it('flag off ignores a digest', () => {
      feed.v = { state: 'ok', news: [], digest }; at('2026-11-05T00:30:00Z')
      render(<World />)
      expect(screen.queryByText(/Daily digest|Two warnings/)).toBeNull()
    })
  })
})
