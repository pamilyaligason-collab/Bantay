import 'fake-indexeddb/auto'
import { createHash } from 'node:crypto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resetIndexCache } from './packs'

const flags = vi.hoisted(() => ({ offlineMaps: false }))
vi.mock('./flags', () => ({ FLAGS: flags }))
const where = vi.hoisted(() => ({ place: { weather: { lat: 9.85, lon: 124.2 } } as { weather: { lat: number; lon: number } } | null }))
vi.mock('../location/useLocation', () => ({ usePlace: () => where.place }))
import OfflineMaps, { basemapAt, mb } from './OfflineMaps'

const BASE = 'https://files.test/storage/v1/object/public/region-packs/'
const BOHOL = '0701200000', SOCO = '1206300000'
const FILE = new TextEncoder().encode('invented map file bytes')
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const entry = (code: string, name: string, bounds: number[]) => ({ code, name, version: 1, checksum: 'c', size: 1, rows: 1, path: `${code}/p.json`, neighbours: [], basemap: { version: 1, checksum: sha(FILE), size: 11_416_670, path: `${code}/basemap.pmtiles`, bounds, minzoom: 0, maxzoom: 15 } })
const INDEX = { format: 1, built: 'x', packs: [entry(BOHOL, 'Bohol', [123.7, 9.5, 124.7, 10.2]), entry(SOCO, 'South Cotabato', [124.6, 5.9, 125.4, 6.6])], world: { version: 1, checksum: 'w', size: 8_843_473, path: 'world/w.pmtiles', bounds: [60, -15, 160, 55], minzoom: 0, maxzoom: 6 } }
const net = (file: Uint8Array | 500 = FILE) => vi.fn(async (u: string) => {
  const rel = String(u).replace(BASE, '')
  if (rel === 'index.json') return new Response(JSON.stringify(INDEX))
  return file === 500 ? new Response('no', { status: 500 }) : new Response(file as BodyInit)
})
const row = (code: string, name: string) => ({ code, version: 1, checksum: 'c', name, neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true })
const have = (code: string, name: string, bounds: number[], bytes = 12_000_000) => db.packs.put({ ...row(code, name), basemap: { checksum: sha(FILE), bounds: bounds as [number, number, number, number], blob: new Blob([new Uint8Array(bytes)]), savedAt: '2026-11-06T13:10:00.000Z' } })
const show = () => render(<OfflineMaps />)
const state = (code: string) => within(screen.getByTestId(`ofm-row-${code}`)).getByText(/^(Ready|Downloading|Not downloaded)/).textContent?.split(' · ')[0]

beforeEach(async () => {
  flags.offlineMaps = true
  where.place = { weather: { lat: 9.85, lon: 124.2 } }
  vi.stubEnv('VITE_SUPABASE_URL', 'https://files.test')
  vi.stubGlobal('fetch', net())
  resetIndexCache()
  await db.kv.clear(); await db.packs.clear()
})
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('OfflineMaps', () => {
  it('flag off: only the empty state, nothing fetched', () => {
    flags.offlineMaps = false
    show()
    expect(screen.getByText('Offline maps are not ready yet. They arrive with the Bohol map pack.')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to Safety' }).getAttribute('href')).toBe('#safety')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('nothing stored: no hero, two rows (no world, no whole Philippines), both Not downloaded with the listed size', async () => {
    show()
    await waitFor(() => expect(screen.getByTestId(`ofm-row-${SOCO}`)).toBeTruthy())
    expect(screen.queryByText('Your area is ready offline')).toBeNull()
    expect(screen.getAllByRole('listitem').map((r) => r.querySelector('.rw-title')?.textContent)).toEqual(['Bohol', 'South Cotabato and General Santos', 'Wi-Fi only'])
    expect(state(BOHOL)).toBe('Not downloaded'); expect(state(SOCO)).toBe('Not downloaded')
    expect(within(screen.getByTestId(`ofm-row-${BOHOL}`)).getByText('Not downloaded · 11.4 MB')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Whole Philippines|World|Luzon|Mindanao/)
    expect(screen.getByText('Maps © OpenStreetMap contributors, built with Protomaps.')).toBeTruthy()
  })

  it('one stored, place inside it: hero with name, size and date; that row Ready with Remove; the other Download', async () => {
    await have(BOHOL, 'Bohol', [123.7, 9.5, 124.7, 10.2])
    show()
    const hero = await screen.findByTestId('ofm-hero')
    expect(within(hero).getByText('Your area is ready offline')).toBeTruthy()
    expect(hero.textContent).toContain('Bohol · 12.0 MB · saved Nov 6')
    await waitFor(() => expect(state(BOHOL)).toBe('Ready'))
    expect(screen.getByRole('button', { name: 'Remove Bohol' })).toBeTruthy()
    expect(state(SOCO)).toBe('Not downloaded')
    expect(screen.getByRole('button', { name: 'Download South Cotabato and General Santos' })).toBeTruthy()
    expect(screen.getByText('Maps on this phone: 12.0 MB')).toBeTruthy()
  })

  it('two stored, place outside both: rows Ready, no hero; an unknown place never gets the hero', async () => {
    await have(BOHOL, 'Bohol', [123.7, 9.5, 124.7, 10.2], 11_000_000)
    await have(SOCO, 'South Cotabato', [124.6, 5.9, 125.4, 6.6], 19_000_000)
    where.place = { weather: { lat: 14.6, lon: 121 } }
    show()
    await waitFor(() => expect(state(SOCO)).toBe('Ready'))
    expect(state(BOHOL)).toBe('Ready')
    expect(screen.queryByTestId('ofm-hero')).toBeNull()
    expect(screen.getByText('Maps on this phone: 30.0 MB')).toBeTruthy()
    cleanup(); where.place = null; show()
    await waitFor(() => expect(state(SOCO)).toBe('Ready'))
    expect(screen.queryByTestId('ofm-hero')).toBeNull()
  })

  it('Wi-Fi only on (default), connection known cellular: a tap waits for Wi-Fi and stores nothing', async () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { type: 'cellular' } })
    await db.packs.put(row(BOHOL, 'Bohol'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Download Bohol' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Waiting for Wi-Fi')
    expect(state(BOHOL)).toBe('Not downloaded')
    expect((await db.packs.get(BOHOL))?.basemap).toBeUndefined()
  })

  it('Wi-Fi only on, connection type unknown (iPhone, Firefox): a tap downloads', async () => {
    await db.packs.put(row(BOHOL, 'Bohol'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Download Bohol' }))
    await waitFor(() => expect(state(BOHOL)).toBe('Ready'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Remove failing shows a plain line and the row stays Ready', async () => {
    await have(BOHOL, 'Bohol', [123.7, 9.5, 124.7, 10.2])
    show()
    await waitFor(() => expect(state(BOHOL)).toBe('Ready'))
    const put = vi.spyOn(db.packs, 'put').mockRejectedValueOnce(new Error('x'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bohol' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Could not remove this map')
    expect(state(BOHOL)).toBe('Ready')
    put.mockRestore()
  })

  it('Wi-Fi only off: Download shows Downloading, then Ready with the hero, and Remove takes it back off', async () => {
    await db.packs.put(row(BOHOL, 'Bohol'))
    show()
    fireEvent.click(await screen.findByRole('switch', { name: 'Wi-Fi only' }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Wi-Fi only' }).getAttribute('aria-checked')).toBe('false'))
    fireEvent.click(await screen.findByRole('button', { name: 'Download Bohol' }))
    expect(state(BOHOL)).toBe('Downloading')
    await waitFor(() => expect(state(BOHOL)).toBe('Ready'))
    expect((await db.packs.get(BOHOL))?.basemap?.checksum).toBe(sha(FILE)) // fake-indexeddb does not keep a cloned Blob's size, so the bytes are proven by the sha test
    expect(await screen.findByText('Your area is ready offline')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bohol' }))
    await waitFor(() => expect(state(BOHOL)).toBe('Not downloaded'))
    expect(screen.queryByTestId('ofm-hero')).toBeNull()
    expect((await db.packs.get(BOHOL))?.name).toBe('Bohol') // only the map goes
  })

  it('failed download (server error): message, nothing stored, button back', async () => {
    vi.stubGlobal('fetch', net(500))
    await db.kv.put({ key: 'safety.offlinePrefs', value: { wifiOnly: false } })
    await db.packs.put(row(BOHOL, 'Bohol'))
    show()
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Wi-Fi only' }).getAttribute('aria-checked')).toBe('false'))
    fireEvent.click(await screen.findByRole('button', { name: 'Download Bohol' }))
    expect((await screen.findByRole('alert')).textContent).toContain('did not download or did not match, so nothing was saved')
    expect(state(BOHOL)).toBe('Not downloaded')
    expect((await db.packs.get(BOHOL))?.basemap).toBeUndefined()
  })

  it('sha256 mismatch: same message, nothing stored', async () => {
    vi.stubGlobal('fetch', net(new TextEncoder().encode('tampered')))
    await db.kv.put({ key: 'safety.offlinePrefs', value: { wifiOnly: false } })
    await db.packs.put(row(BOHOL, 'Bohol'))
    show()
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Wi-Fi only' }).getAttribute('aria-checked')).toBe('false'))
    fireEvent.click(await screen.findByRole('button', { name: 'Download Bohol' }))
    expect((await screen.findByRole('alert')).textContent).toContain('nothing was saved')
    expect((await db.packs.get(BOHOL))?.basemap).toBeUndefined()
  })

  it('offline with no list: a hint when nothing is stored; stored maps still show and can be removed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    show()
    expect(await screen.findByText('The map list needs internet. Try again when you are online.')).toBeTruthy()
    cleanup()
    await have(BOHOL, 'Bohol', [123.7, 9.5, 124.7, 10.2])
    show()
    await waitFor(() => expect(state(BOHOL)).toBe('Ready'))
    expect(screen.getByRole('button', { name: 'Remove Bohol' })).toBeTruthy()
  })

  it('Storage line uses the browser estimate', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { storage: { estimate: async () => ({ usage: 52_000_000, quota: 4_000_000_000 }) } }))
    show()
    expect(await screen.findByText('Apps and data use 52.0 MB of 4.0 GB the browser may keep.')).toBeTruthy()
  })
})

describe('helpers', () => {
  it('basemapAt: inside the box, edges count, unknown or outside is null', () => {
    const s = [{ code: 'B', checksum: 'x', bounds: [123.7, 9.5, 124.7, 10.2] as [number, number, number, number], blob: new Blob(['x']), savedAt: '' }]
    expect(basemapAt(s, 9.85, 124.2)?.code).toBe('B')
    expect(basemapAt(s, 9.5, 123.7)?.code).toBe('B')
    expect(basemapAt(s, 14.6, 121)).toBeNull()
    expect(basemapAt(s, null, 124.2)).toBeNull()
    expect(basemapAt(s, 0, 0)).toBeNull()
  })
  it('mb', () => { expect(mb(0)).toBe('None'); expect(mb(1)).toBe('1 KB'); expect(mb(11_416_670)).toBe('11.4 MB'); expect(mb(2_500_000_000)).toBe('2.5 GB') })
})
