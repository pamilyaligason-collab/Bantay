import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { hazardsFor } from './hazardCards'
import { hazardOverlay, hazardPaintRules, LEVEL_INK, layerState, levelsStatus, noneRingText, pickHazardSource, NOAH_URL, readDate, ringsFor, useHazardBlob, useHazardUrl } from './hazardsLayers'

const P = vi.hoisted(() => ({ index: null as unknown }))
vi.mock('./packs', async (orig) => ({ ...(await orig<typeof import('./packs')>()), packFileUrl: (p: string) => `https://h.test/${p}`, getIndex: () => (P.index instanceof Error ? Promise.reject(P.index) : Promise.resolve(P.index)) }))

const dampas = hazardsFor('dampas')

describe('layerState', () => {
  it('flood has no reading and says there is no map', () => {
    expect(layerState('flood', dampas)).toMatchObject({ label: 'Flood', reading: null, text: 'No flood map for this place yet. Hazard maps arrive with the local data pack.' })
  })
  it('landslide reads Low (good), surge reads Safe', () => {
    expect(layerState('landslide', dampas)).toMatchObject({ reading: 'Low', tone: 'good' })
    expect(layerState('surge', dampas)).toMatchObject({ reading: 'Safe', tone: 'good' })
    expect(layerState('surge', dampas).text).toContain('shows your place only')
  })
  it('a place with no readings is not checked', () => {
    const conel = hazardsFor('conel')
    for (const id of ['flood', 'landslide', 'surge'] as const) expect(layerState(id, conel)).toMatchObject({ reading: null, text: 'Not checked for this place yet.' })
  })
})

describe('constants and dates', () => {
  it('NOAH url', () => expect(NOAH_URL).toBe('https://noah.up.edu.ph/'))
  it('readDate', () => {
    expect(readDate('HazardHunterPH, Dampas pin 9.6, 123.8, read 2026-10-17')).toBe('17 Oct 2026')
    expect(readDate('no date')).toBeNull()
  })
})

describe('ringsFor', () => {
  const by = (rs: ReturnType<typeof ringsFor>) => Object.fromEntries(rs.map((r) => [r.id, r]))
  it('six rings in the board order; earthquake filled from the HazardHunterPH intensity, Dampas VIII is 8 tenths and red', () => {
    const rs = ringsFor(dampas, null)
    expect(rs.map((r) => r.label)).toEqual(['Earthquake', 'Flood', 'Landslide', 'Storm surge', 'Tsunami', 'Liquefaction'])
    expect(by(rs).quake).toMatchObject({ state: 'filled', word: 'VIII', level: 3, fill: 0.8 })
  })
  it('no levels on the phone: the three NOAH rings, tsunami and liquefaction are all dashed', () => {
    const r = by(ringsFor(dampas, null))
    for (const id of ['flood', 'landslide', 'surge', 'tsunami', 'liquefaction']) expect(r[id]).toMatchObject({ state: 'dashed', word: '--', fill: 0 })
    expect(by(ringsFor(dampas, { flood: null, landslide: null, surge: null })).flood!.state).toBe('dashed')
  })
  it('NOAH levels: 1 Low a third green, 2 Medium two thirds amber, 3 High full red, 0 None empty and solid', () => {
    const r = by(ringsFor(dampas, { flood: 1, landslide: 2, surge: 3 }))
    expect(r.flood).toMatchObject({ state: 'filled', word: 'Low', level: 1 })
    expect(r.flood!.fill).toBeCloseTo(1 / 3)
    expect(r.landslide).toMatchObject({ word: 'Medium', level: 2 })
    expect(r.landslide!.fill).toBeCloseTo(2 / 3)
    expect(r.surge).toMatchObject({ word: 'High', level: 3, fill: 1 })
    expect(by(ringsFor(dampas, { flood: 0, landslide: null, surge: null })).flood).toMatchObject({ state: 'none', word: 'No hazard mapped', level: 0, fill: 0 })
  })
  it('tsunami and liquefaction stay dashed even with every NOAH level in; no readings at all gives a dashed earthquake', () => {
    const r = by(ringsFor(dampas, { flood: 3, landslide: 3, surge: 3 }))
    expect(r.tsunami!.state).toBe('dashed')
    expect(r.liquefaction!.state).toBe('dashed')
    expect(by(ringsFor(null, null)).quake).toMatchObject({ state: 'dashed', word: '--' })
  })
})

describe('useHazardBlob', () => {
  const row = (code: string, bounds?: Record<string, number[]>) => ({ code, version: 1, checksum: 'x', name: code, neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true, ...(bounds ? { hazards: { checksum: 'h', bounds, blob: new Blob(['x']) } } : {}) })
  const later = () => new Promise((r) => setTimeout(r, 60))
  it("gives the stored file only when on, inside that layer's bounds; a layer the file does not list gets none", async () => {
    await db.packs.clear()
    await db.packs.put(row('A', { flood: [123.7, 9.5, 124.7, 10.2] }) as never)
    const off = renderHook(() => useHazardBlob(9.64, 123.87, 'flood', false, 'A'))
    const on = renderHook(() => useHazardBlob(9.64, 123.87, 'flood', true, 'A'))
    const outside = renderHook(() => useHazardBlob(14.5, 121, 'flood', true, 'A'))
    const unlisted = renderHook(() => useHazardBlob(9.64, 123.87, 'surge', true, 'A'))
    await waitFor(() => expect(on.result.current).not.toBeNull())
    await later()
    expect(off.result.current).toBeNull()
    expect(outside.result.current).toBeNull()
    expect(unlisted.result.current).toBeNull()
  })
  it('a pack row with no hazard file gives none', async () => {
    await db.packs.clear()
    await db.packs.put(row('B') as never)
    const none = renderHook(() => useHazardBlob(9.64, 123.87, 'flood', true, 'B'))
    await later()
    expect(none.result.current).toBeNull()
  })
  it("reads the unit's own file, not the first stored file whose box overlaps", async () => {
    await db.packs.clear()
    const withBlob = (code: string, text: string, extra = {}) => ({ ...row(code, { flood: [123.7, 9.5, 124.7, 10.2] }), hazards: { checksum: 'h', bounds: { flood: [123.7, 9.5, 124.7, 10.2] }, blob: { tag: text } }, ...extra })
    await db.packs.put(withBlob('A', 'first') as never)
    await db.packs.put(withBlob('B', 'second') as never)
    await db.packs.put({ ...row('C'), hazardsFrom: 'B' } as never)
    const b = renderHook(() => useHazardBlob(9.64, 123.87, 'flood', true, 'B'))
    const c = renderHook(() => useHazardBlob(9.64, 123.87, 'flood', true, 'C'))
    const none = renderHook(() => useHazardBlob(9.64, 123.87, 'flood', true, null))
    await waitFor(() => expect(b.result.current).not.toBeNull())
    await waitFor(() => expect(c.result.current).not.toBeNull())
    expect(b.result.current).toEqual({ tag: 'second' }) // not 'first'
    expect(c.result.current).toEqual({ tag: 'second' }) // linked row follows hazardsFrom
    expect(none.result.current).toBeNull()
  })
})

describe('hazard overlay', () => {
  it('each level paints its own token colour and matches only its own level', () => {
    const ink = { [LEVEL_INK[1]]: '#111', [LEVEL_INK[2]]: '#222', [LEVEL_INK[3]]: '#333' }
    class Sym { constructor(public o: { fill: string; opacity: number }) {} }
    const rules = hazardPaintRules(Sym, (t) => ink[t as keyof typeof ink] ?? '', 'flood')
    expect(rules.map((r) => (r.symbolizer as Sym).o.fill)).toEqual(['#111', '#222', '#333'])
    for (const [i, r] of rules.entries()) {
      expect([1, 2, 3, 0].map((lv) => r.filter(10, { props: { level: lv } }))).toEqual([1, 2, 3, 0].map((lv) => lv === i + 1))
      expect(r.dataLayer).toBe('flood')
    }
  })
  it('a failing overlay keeps the page usable and reports once per session', async () => {
    const reportError = vi.fn().mockResolvedValue(true)
    vi.doMock('../monitor/errors', () => ({ reportError }))
    const handlers: Record<string, () => void> = {}
    const group = { on: (e: string, f: () => void) => { handlers[e] = f }, addLayer: vi.fn(), removeLayer: vi.fn() }
    const L = { layerGroup: () => group } as never
    hazardOverlay(L, new Blob(['too short']), 'flood')
    handlers.add!(); handlers.add!()
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 100))
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})

describe('level 0 ring wording', () => {
  it('says no mapped hazard and no promise of safety, never "None" or "safe"', () => {
    expect(noneRingText('Flood')).toBe("Flood: no mapped hazard in NOAH's maps (100-year scenario). Not a promise of safety.")
  })
})

describe('overlay source and away status', () => {
  it('the stored Blob wins over the public URL; the URL is used when no Blob; neither gives null', () => {
    const b = new Blob(['x'])
    expect(pickHazardSource(b, 'https://h.test/p.pmtiles')).toBe(b)
    expect(pickHazardSource(null, 'https://h.test/p.pmtiles')).toBe('https://h.test/p.pmtiles')
    expect(pickHazardSource(null, null)).toBeNull()
  })
  it('levelsStatus: none when nothing is read; top level and its layers; 0 is no promise of safety', () => {
    expect(levelsStatus({ flood: null, landslide: null, surge: null })).toBeNull()
    expect(levelsStatus(null)).toBeNull()
    expect(levelsStatus({ flood: 2, landslide: 2, surge: 1 })).toEqual({ text: 'Highest NOAH level here: Medium (flood and landslide)', tone: 'warn' })
    expect(levelsStatus({ flood: 1, landslide: null, surge: 0 })).toEqual({ text: 'Highest NOAH level among the layers checked: Low (flood)', tone: 'good' })
    expect(levelsStatus({ flood: 0, landslide: 0, surge: null })!.text).toContain('not a promise of safety')
  })
})

describe('useHazardUrl', () => {
  const bounds = { flood: [120.8, 14.4, 121.2, 14.8], landslide: null, surge: [120.8, 14.4, 121.2, 14.8] }
  const hz = { pack: '1380600000', version: 1, checksum: 'c', size: 5, path: '1380600000/hz.pmtiles', bounds }
  const run = async (index: unknown, on: boolean, unit: string | null, id: 'flood' | 'landslide' = 'flood', lat = 14.6, lon = 121) => {
    P.index = index
    const r = renderHook(() => useHazardUrl(lat, lon, id, on, unit))
    await new Promise((res) => setTimeout(res, 20))
    return r.result.current
  }
  const idx = (h: unknown) => ({ format: 1, built: 'x', packs: [{ code: '1380600000', name: 'Metro Manila', hazards: h }] })
  it('gives the public file URL when on, the unit has a hazard file and the point is inside the layer bounds', async () => {
    expect(await run(idx(hz), true, '1380600000')).toMatch(/1380600000\/hz\.pmtiles$/)
  })
  it('null when off, no unit, unit not in the index, point outside the bounds, layer without bounds, no hazard entry, or the index fails', async () => {
    expect(await run(idx(hz), false, '1380600000')).toBeNull()
    expect(await run(idx(hz), true, null)).toBeNull()
    expect(await run(idx(hz), true, '9999999999')).toBeNull()
    expect(await run(idx(hz), true, '1380600000', 'flood', 10, 100)).toBeNull()
    expect(await run(idx(hz), true, '1380600000', 'landslide')).toBeNull()
    expect(await run(idx(undefined), true, '1380600000')).toBeNull()
    expect(await run(new Error('offline'), true, '1380600000')).toBeNull()
  })
})
