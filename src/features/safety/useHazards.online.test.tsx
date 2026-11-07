import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pmtilesFile, tileBytes } from '../../../e2e/fixtures/p2/pmtilesFixture'
import { db } from '../../db'

const h = vi.hoisted(() => ({ index: null as unknown, download: vi.fn(async () => 'wait' as string) }))
vi.mock('./flags', () => ({ FLAGS: { get localPacks() { return true } } }))
vi.mock('./packs', () => ({
  loadPack: async () => null, syncPacks: async () => ({ fetched: [], bad: [], offline: true }), cleanup: async () => [],
  getIndex: async () => h.index, downloadHazards: (...a: unknown[]) => h.download(...(a as [])), packFileUrl: (p: string) => `https://example.test/region-packs/${p}`
}))
import { resetOnlineCache } from './hazardLookup'
import { useHazards } from './useHazards'

// An invented point and file: the Dampas home pin is where the unit's pack row sits; the file has a Medium flood square around it.
const DAMPAS = { lat: 9.645705, lon: 123.877951 }
const BOUNDS = [123.4, 9.3, 124.2, 9.9]
const body = (b: Uint8Array) => b as unknown as BodyInit
const file = pmtilesFile(tileBytes(DAMPAS, 2), false, DAMPAS)
const entry = (hazards: boolean) => ({ format: 1, built: 'x', packs: [{ code: '0701200000', name: 'Bohol', version: 1, checksum: 'c', size: 1, rows: 1, path: 'p.json', neighbours: [], ...(hazards ? { hazards: { pack: '0701200000', version: 1, checksum: 'h1', size: 31_000_000, path: 'hazards/invented.pmtiles', bounds: { flood: BOUNDS, landslide: BOUNDS, surge: BOUNDS } } } : {}) }] })
const seedRow = (withFile: boolean) => db.packs.put({ code: '0701200000', version: 1, checksum: 'c', name: 'Bohol', neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true, ...(withFile ? { hazards: { checksum: 'h1', bounds: { flood: BOUNDS, landslide: BOUNDS, surge: BOUNDS }, blob: new NodeBlob([new Uint8Array(file)]) as unknown as Blob } } : {}) })
const range = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
  const m = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? '')
  return m ? new Response(body(file.subarray(Number(m[1]), Number(m[2]) + 1)), { status: 206 }) : new Response(body(file), { status: 200 })
})
const online = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
const zone = { source: 'zone', zone: 'dampas', weather: DAMPAS }

beforeEach(async () => {
  await db.packs.clear(); resetOnlineCache(); range.mockClear(); h.download.mockClear(); h.index = entry(true); online(true)
  vi.stubGlobal('fetch', range)
})
afterEach(() => { vi.unstubAllGlobals(); online(true) })

describe('useHazards fallback order: stored file > online > empty', () => {
  it('a stored file wins: no network read at all', async () => {
    await seedRow(true)
    const { result } = renderHook(() => useHazards(zone))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.levels).toEqual({ flood: 2, landslide: 0, surge: 0 })
    expect(result.current.online).toBeFalsy()
    expect(range).not.toHaveBeenCalled()
  })
  it('no file, online, unit lists a hazard file: the point is read by Range requests and marked online; the Wi-Fi download still starts', async () => {
    await seedRow(false)
    const { result } = renderHook(() => useHazards(zone))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.online).toBe(true)
    expect(result.current.levels).toEqual({ flood: 2, landslide: 0, surge: 0 })
    expect(range.mock.calls.every(([, i]) => /^bytes=\d+-\d+$/.test(new Headers((i as RequestInit).headers).get('Range') ?? ''))).toBe(true)
    await waitFor(() => expect(h.download).toHaveBeenCalled())
  })
  it('no file and offline: the empty state stays ("not saved on this phone"), nothing is fetched', async () => {
    await seedRow(false); online(false)
    const { result } = renderHook(() => useHazards(zone))
    await waitFor(() => expect(result.current.status).toBe('missing'))
    await waitFor(() => expect(result.current.gap).toBe('offline'))
    expect(result.current.levels).toBeNull()
    expect(range).not.toHaveBeenCalled()
  })
  it('the index lists no hazard file for the unit: gap is "nopack", nothing is fetched', async () => {
    await seedRow(false); h.index = entry(false)
    const { result } = renderHook(() => useHazards(zone))
    await waitFor(() => expect(result.current.gap).toBe('nopack'))
    expect(result.current.status).toBe('missing')
    expect(range).not.toHaveBeenCalled()
  })
  it('a failed online read leaves the empty state, never "no mapped hazard"', async () => {
    await seedRow(false); range.mockImplementation(async () => new Response('', { status: 500 }))
    const { result } = renderHook(() => useHazards(zone))
    await waitFor(() => expect(range).toHaveBeenCalled())
    await waitFor(() => expect(h.download).toHaveBeenCalled())
    expect(result.current.status).toBe('missing')
    expect(result.current.levels).toBeNull()
    range.mockImplementation(async (_u, init) => { const m = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? ''); return m ? new Response(body(file.subarray(Number(m[1]), Number(m[2]) + 1)), { status: 206 }) : new Response(body(file), { status: 200 }) })
  })
})
