// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { P, pmtilesFile, tileBytes, tileWithLevel } from '../../../e2e/fixtures/p2/pmtilesFixture'
import { type Bytes, decodeTile, hazardsAt, tileId, tileOf } from './hazardLookup'

// The fixture file: a flood square (level 2, a double) around P and a landslide square (level 3, a sint) elsewhere in the same z12 tile; no surge layer.
const bytes = (file: Buffer): Bytes => ({ get: async (o, l) => new Uint8Array(file.subarray(o, o + l)) })
const build = (tile: Uint8Array | null, gz: boolean) => bytes(pmtilesFile(tile, gz))

describe('tileId', () => {
  it('matches the PMTiles spec for the first zooms (hand-computed)', () => {
    expect([tileId(0, 0, 0), tileId(1, 0, 0), tileId(1, 0, 1), tileId(1, 1, 1), tileId(1, 1, 0)]).toEqual([0, 1, 2, 3, 4])
    expect(tileId(2, 0, 0)).toBe(5)
  })
})

describe('decodeTile', () => {
  it('reads layer names, levels (double and sint) and a square ring', () => {
    const l = decodeTile(tileBytes())
    expect(l.map((x) => [x.name, x.features[0]!.level])).toEqual([['flood', 2], ['landslide', 3]])
    expect(l[0]!.features[0]!.rings[0]).toHaveLength(4)
  })
})

describe('hazardsAt', () => {
  for (const gz of [false, true]) {
    it(`gives per-layer levels from the tile (tile compression ${gz ? 'gzip' : 'none'})`, async () => {
      expect(await hazardsAt(P, build(tileBytes(), gz))).toEqual({ flood: 2, landslide: 0, surge: 0 })
    })
  }
  it('a point inside the bounds but with no tile is "no mapped hazard" (0), not a bare unknown', async () => {
    expect(await hazardsAt(P, build(null, false))).toEqual({ flood: 0, landslide: 0, surge: 0 })
  })
  it('a point outside the file bounds is null for every layer ("not checked")', async () => {
    expect(await hazardsAt({ lat: 6.2, lon: 125.19 }, build(tileBytes(), false))).toEqual({ flood: null, landslide: null, surge: null })
  })
  it('a point in the bounds but outside the squares reads 0', async () => {
    const far = { lat: P.lat + 0.01, lon: P.lon }
    expect(await hazardsAt(far, build(tileBytes(), false))).toEqual({ flood: 0, landslide: 0, surge: 0 })
  })
  it('per-layer bounds: a layer with no bounds, or a point outside its box, is null, never "no mapped hazard"', async () => {
    const box = [P.lon - 0.1, P.lat - 0.1, P.lon + 0.1, P.lat + 0.1]
    const outside = [P.lon + 0.2, P.lat - 0.1, P.lon + 0.3, P.lat + 0.1]
    expect(await hazardsAt(P, build(tileBytes(), false), { flood: box, landslide: outside })).toEqual({ flood: 2, landslide: null, surge: null })
    expect(await hazardsAt(P, build(tileBytes(), false), {})).toEqual({ flood: null, landslide: null, surge: null })
  })
  it('a file that is not PMTiles is rejected', async () => {
    await expect(hazardsAt(P, { get: async () => new Uint8Array(127) })).rejects.toThrow()
  })
  it('the fixture point sits in the tile the reader asks for', () => {
    expect(tileOf(P, 12).x).toBeGreaterThan(0)
  })
})

// What the real packs look like (read-only check on 2026-11-05): gzip root directory, gzip metadata listing flood, landslide and surge, gzip tiles.
describe('hazardsAt on the real pack format', () => {
  const real = { gzipDirs: true }
  it('gzip root directory and metadata, gzip tile', async () => {
    expect(await hazardsAt(P, bytes(pmtilesFile(tileBytes(), true, P, undefined, real)))).toEqual({ flood: 2, landslide: 0, surge: 0 })
  })
  it('a gzip root that points to a gzip leaf directory finds the tile', async () => {
    expect(await hazardsAt(P, bytes(pmtilesFile(tileBytes(), true, P, undefined, { ...real, leaf: true })))).toEqual({ flood: 2, landslide: 0, surge: 0 })
    expect(await hazardsAt(P, bytes(pmtilesFile(tileBytes(), false, P, undefined, { leaf: true })))).toEqual({ flood: 2, landslide: 0, surge: 0 })
  })
  it('the z12 tile id of the fixture point equals an independent Hilbert reference (Wikipedia xy2d, full-size rotation)', () => {
    const ref = (z: number, x: number, y: number) => {
      const n = 2 ** z
      let acc = 0
      for (let t = 0; t < z; t++) acc += 4 ** t
      let d = 0
      for (let s = n / 2; s >= 1; s /= 2) {
        const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0
        d += s * s * ((3 * rx) ^ ry)
        if (ry === 0) { if (rx === 1) { x = n - 1 - x; y = n - 1 - y } [x, y] = [y, x] }
      }
      return acc + d
    }
    const t = tileOf(P, 12)
    expect(tileId(12, t.x, t.y)).toBe(ref(12, t.x, t.y))
    expect(tileId(12, 3423, 1763)).toBe(ref(12, 3423, 1763))
  })
  it('a layer the file metadata does not list is null ("not checked"), never 0', async () => {
    expect(await hazardsAt(P, bytes(pmtilesFile(tileBytes(), false, P, undefined, { layers: ['flood', 'landslide'] })))).toEqual({ flood: 2, landslide: 0, surge: null })
    expect(await hazardsAt(P, bytes(pmtilesFile(tileBytes(), false, P, undefined, { layers: ['depth'] })))).toEqual({ flood: null, landslide: null, surge: null })
  })
  it('a file with no readable layer list proves no layer: all null', async () => {
    expect(await hazardsAt(P, bytes(pmtilesFile(tileBytes(), false, P, undefined, { layers: null })))).toEqual({ flood: null, landslide: null, surge: null })
  })
  it('a feature whose level is not 1, 2 or 3 makes that layer null, not "no mapped hazard"', async () => {
    for (const lv of ['high', 0, 4, 1.5, -1]) {
      expect((await hazardsAt(P, bytes(pmtilesFile(tileWithLevel(lv), false)))).flood, String(lv)).toBeNull()
    }
    expect((await hazardsAt(P, bytes(pmtilesFile(tileWithLevel(3), false)))).flood).toBe(3)
  })
})
