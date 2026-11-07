import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pmtilesFile, tileBytes } from '../../../e2e/fixtures/p2/pmtilesFixture'
import { db } from '../../db'
import type { Unit } from './unitAt'

const h = vi.hoisted(() => ({ units: [] as Unit[], gate: null as Promise<Unit[]> | null }))
vi.mock('./flags', () => ({ FLAGS: { get localPacks() { return true } } }))
vi.mock('./unitAt', async (orig) => ({ ...(await orig<typeof import('./unitAt')>()), loadUnits: () => h.gate ?? Promise.resolve(h.units) }))
vi.mock('./packs', () => ({ loadPack: async () => null, syncPacks: async () => ({ fetched: [], bad: [], offline: true }), cleanup: async () => [], getIndex: async () => null, downloadHazards: async () => 'offline', packFileUrl: () => null }))
import { tracker } from './usePacks'
import { useHazards } from './useHazards'

// An invented point and file: the Dampas home pin is where the pack row sits; the file has a Medium flood square around it.
const DAMPAS = { lat: 9.645705, lon: 123.877951 }
const sq = (a: number, b: number, c: number, d: number) => [[a, c], [b, c], [b, d], [a, d], [a, c]]
beforeEach(async () => {
  tracker.cur = null; tracker.cand = null; h.units = []; h.gate = null
  await db.packs.clear()
  const file = pmtilesFile(tileBytes(DAMPAS, 2), false, DAMPAS)
  await db.packs.put({ code: '0701200000', version: 1, checksum: 'c', name: 'Bohol', neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true, hazards: { checksum: 'h', bounds: { flood: [123.4, 9.3, 124.2, 9.9], landslide: [123.4, 9.3, 124.2, 9.9], surge: [123.4, 9.3, 124.2, 9.9] }, blob: new NodeBlob([new Uint8Array(file)]) as unknown as Blob } })
})

describe('useHazards: "No mapped hazard" needs a point truly in the unit the file covers', () => {
  it('a picked home zone reads the file', async () => {
    const { result } = renderHook(() => useHazards({ source: 'zone', zone: 'dampas', weather: DAMPAS }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.levels).toEqual({ flood: 2, landslide: 0, surge: 0 })
  })
  it('a GPS place that is only inside the 30 km home circle (no outlines file shipped) is not checked, whatever the file holds', async () => {
    const { result } = renderHook(() => useHazards({ source: 'gps', zone: 'dampas', weather: DAMPAS }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.levels).toEqual({ flood: null, landslide: null, surge: null })
  })
  it('a GPS place that an outline puts in the unit reads the file', async () => {
    h.units = [{ code: '0701200000', name: 'Invented Bohol', bbox: [123, 9, 124.5, 10.5], polys: [[sq(123, 124.5, 9, 10.5)]] }]
    const { result } = renderHook(() => useHazards({ source: 'gps', zone: 'dampas', weather: DAMPAS }))
    await waitFor(() => expect(result.current.levels).toEqual({ flood: 2, landslide: 0, surge: 0 }))
  })
  it('zone to GPS while loadUnits is pending: the zone\'s levels are never handed out for the GPS position', async () => {
    const { result, rerender } = renderHook(({ p }) => useHazards(p), { initialProps: { p: { source: 'zone', zone: 'dampas', weather: DAMPAS } } })
    await waitFor(() => expect(result.current.levels).toEqual({ flood: 2, landslide: 0, surge: 0 }))
    h.gate = new Promise<Unit[]>(() => undefined) // never answers
    rerender({ p: { source: 'gps', zone: 'dampas', weather: { lat: DAMPAS.lat + 0.001, lon: DAMPAS.lon } } })
    expect(result.current.levels).toEqual({ flood: null, landslide: null, surge: null }) // at once, not after the effect
    await new Promise((r) => setTimeout(r, 30))
    expect(result.current.levels).toEqual({ flood: null, landslide: null, surge: null })
  })
})

describe('useHazards: a GPS place in a city that borrows its province pack (S23 F fix round)', () => {
  it('a GenSan fix is proven by the real outlines (city inside South Cotabato, claimed once) and reads the South Cotabato file through the hazardsFrom pointer', async () => {
    const GENSAN = { lat: 6.1164, lon: 125.1716 }
    h.units = JSON.parse(readFileSync('public/geo/units.json', 'utf8')).units
    const file = pmtilesFile(tileBytes(GENSAN, 2), false, GENSAN)
    const bounds: [number, number, number, number] = [124.6, 5.9, 125.4, 6.6]
    await db.packs.put({ code: '1206300000', version: 1, checksum: 'c', name: 'South Cotabato', neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true, hazards: { checksum: 'h', bounds: { flood: bounds, landslide: bounds, surge: bounds }, blob: new NodeBlob([new Uint8Array(file)]) as unknown as Blob } })
    await db.packs.put({ code: '1230800000', version: 1, checksum: 'c', name: 'City of General Santos', neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true, hazardsFrom: '1206300000' })
    const { result } = renderHook(() => useHazards({ source: 'gps', zone: 'conel', weather: GENSAN }))
    await waitFor(() => expect(result.current.levels).toEqual({ flood: 2, landslide: 0, surge: 0 }))
  })
})
