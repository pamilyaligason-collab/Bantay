import { describe, expect, it } from 'vitest'
import { autoTarget } from './autoMaps'
import type { StoredBasemap } from './basemap'
import { mapSourceLabel } from './LazyMap'
import type { PackIndex } from './packs'
import { readyRows } from './SafetyHub'

const file = (bounds: [number, number, number, number], checksum = 'aa') => ({ version: 1, checksum, size: 10, path: 'x.pmtiles', bounds, minzoom: 0, maxzoom: 15 })
// invented boxes: west, south, east, north
const index = { format: 1, built: '2026-11-01', world: file([-180, -85, 180, 85]), packs: [{ code: 'p1', name: 'Example Isle', basemap: file([10, 10, 11, 11]) }, { code: 'p2', name: 'Other Isle', basemap: file([20, 20, 21, 21]) }] } as unknown as PackIndex
const have = (code: string, checksum = 'aa'): StoredBasemap => ({ code, checksum, bounds: [10, 10, 11, 11], blob: new Blob(['x']), savedAt: '2026-11-01T00:00:00Z' })

describe('autoTarget', () => {
  it('names the regional map that covers the place, never the world file', () => {
    expect(autoTarget(index, [], 10.5, 10.5)).toBe('p1')
    expect(autoTarget(index, [], 20.5, 20.5)).toBe('p2')
    expect(autoTarget(index, [], 50, 50)).toBeNull()
  })
  it('nothing is due when it is already stored with the listed checksum; a changed checksum is due again', () => {
    expect(autoTarget(index, [have('p1')], 10.5, 10.5)).toBeNull()
    expect(autoTarget(index, [have('p1', 'old')], 10.5, 10.5)).toBe('p1')
  })
  it('an unknown place or no index is nothing, never 0,0 (ML-05)', () => {
    expect(autoTarget(index, [], null, 10.5)).toBeNull()
    expect(autoTarget(index, [], 10.5, undefined)).toBeNull()
    expect(autoTarget(null, [], 10.5, 10.5)).toBeNull()
  })
})

describe('map source badge and Safety rows', () => {
  it('only a stored file is Offline map', () => {
    expect(mapSourceLabel('blob')).toBe('Offline map')
    for (const k of ['stream', 'osm', undefined] as const) expect(mapSourceLabel(k)).toBe('Online map')
  })
  it('the ID row and the Offline maps row carry their own glyphs', () => {
    const r = readyRows({ dial: 1, cards: 1, ids: 0, offline: true, sosLast: null, phoneFix: 0 })
    expect(r.find((x) => x.title === 'IDs and insurance')!.icon).toBe('id')
    expect(r.find((x) => x.title === 'Offline maps')!.icon).toBe('dl')
    expect(r.find((x) => x.title === 'Hotlines')).toMatchObject({ icon: 'phone', tint: 'red' })
  })
})
