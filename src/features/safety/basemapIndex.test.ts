import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { basemapEntry, reachableManifest, withBasemaps, worldEntry } from '../../../scripts/local-data/lib.mjs'

const seed = JSON.parse(readFileSync('scripts/local-data/basemaps.json', 'utf8'))
const BOHOL = '0701200000', SCOT = '1206300000', GENSAN = '1230800000'

// Same shape as the live index.json (format 1): a pack with hazards, GenSan pointing at South Cotabato, and a pack with no map data.
const hazards = (pack: string) => ({ pack, version: 1, checksum: 'h' + pack, size: 5, path: `${pack}/h.pmtiles`, bounds: { flood: [1, 2, 3, 4] } })
const live = () => ({
  format: 1, built: '2026-11-01',
  packs: [
    { code: BOHOL, name: 'Bohol', version: 1, checksum: 'a', size: 9, rows: 133, path: `${BOHOL}/a.json`, neighbours: ['0702200000'], hazards: hazards(BOHOL) },
    { code: '0702200000', name: 'Cebu', version: 1, checksum: 'b', size: 5, rows: 1, path: '0702200000/b.json', neighbours: [] },
    { code: SCOT, name: 'South Cotabato', version: 1, checksum: 'c', size: 7, rows: 3, path: `${SCOT}/c.json`, neighbours: [], hazards: hazards(SCOT) },
    { code: GENSAN, name: 'City of General Santos', version: 1, checksum: 'd', size: 8, rows: 4, path: `${GENSAN}/d.json`, neighbours: [SCOT], hazards: hazards(SCOT) }
  ]
})

describe('index.json basemap entries (D-131)', () => {
  it('builds the Bohol entry from the manifest', () => {
    expect(basemapEntry(BOHOL, seed)).toEqual({
      pack: BOHOL, version: 1, checksum: '2b49f016548f44ed917213c9145650fc83207d978c5297940c08e2e8067d8e46', size: 11416670,
      path: '0701200000/basemap-2b49f016548f44ed917213c9145650fc83207d978c5297940c08e2e8067d8e46.pmtiles', bounds: [123.7, 9.5, 124.7, 10.2], minzoom: 0, maxzoom: 15
    })
  })

  it('points GenSan at the South Cotabato file, like its hazards entry', () => {
    const want = {
      pack: SCOT, version: 1, checksum: '73a97538de0af3a87e7da9860a5c69d3df383157788e347f05bb9f4ad6ad3de0', size: 19447477,
      path: '1206300000/basemap-73a97538de0af3a87e7da9860a5c69d3df383157788e347f05bb9f4ad6ad3de0.pmtiles', bounds: [124.6, 5.9, 125.4, 6.6], minzoom: 0, maxzoom: 15
    }
    expect(basemapEntry(SCOT, seed)).toEqual(want)
    expect(basemapEntry(GENSAN, seed)).toEqual(want)
  })

  it('has no entry for a unit without a basemap, or whose pointer has no file', () => {
    expect(basemapEntry('0702200000', seed)).toBeUndefined()
    expect(basemapEntry(GENSAN, { basemaps: { [GENSAN]: { pack: SCOT } } })).toBeUndefined()
    expect(basemapEntry(BOHOL, {})).toBeUndefined()
  })

  it('builds the world overview entry (no pack key)', () => {
    expect(worldEntry(seed)).toEqual({
      version: 1, checksum: '6e904ac9639965dd65ee8b457b062153d01e160f6ab9be9af3a496af02776eab', size: 8843473,
      path: 'world/basemap-6e904ac9639965dd65ee8b457b062153d01e160f6ab9be9af3a496af02776eab.pmtiles', bounds: [60, -15, 160, 55], minzoom: 0, maxzoom: 6
    })
    expect(worldEntry({})).toBeUndefined()
  })

  it('adds basemap and world and keeps every existing key unchanged', () => {
    const before = live()
    const out = withBasemaps(before, seed)
    const bm = (pack: string, checksum: string, size: number, bounds: number[]) => ({ pack, version: 1, checksum, size, path: `${pack}/basemap-${checksum}.pmtiles`, bounds, minzoom: 0, maxzoom: 15 })
    const BOHOL_BM = bm(BOHOL, '2b49f016548f44ed917213c9145650fc83207d978c5297940c08e2e8067d8e46', 11416670, [123.7, 9.5, 124.7, 10.2])
    const SCOT_BM = bm(SCOT, '73a97538de0af3a87e7da9860a5c69d3df383157788e347f05bb9f4ad6ad3de0', 19447477, [124.6, 5.9, 125.4, 6.6])
    const h = (pack: string) => ({ pack, version: 1, checksum: `h${pack}`, size: 5, path: `${pack}/h.pmtiles`, bounds: { flood: [1, 2, 3, 4] } })
    // hand-written, not built with basemapEntry
    expect(out).toEqual({
      format: 1, built: '2026-11-01',
      packs: [
        { code: BOHOL, name: 'Bohol', version: 1, checksum: 'a', size: 9, rows: 133, path: `${BOHOL}/a.json`, neighbours: ['0702200000'], hazards: h(BOHOL), basemap: BOHOL_BM },
        { code: '0702200000', name: 'Cebu', version: 1, checksum: 'b', size: 5, rows: 1, path: '0702200000/b.json', neighbours: [] },
        { code: SCOT, name: 'South Cotabato', version: 1, checksum: 'c', size: 7, rows: 3, path: `${SCOT}/c.json`, neighbours: [], hazards: h(SCOT), basemap: SCOT_BM },
        { code: GENSAN, name: 'City of General Santos', version: 1, checksum: 'd', size: 8, rows: 4, path: `${GENSAN}/d.json`, neighbours: [SCOT], hazards: h(SCOT), basemap: SCOT_BM }
      ],
      world: { version: 1, checksum: '6e904ac9639965dd65ee8b457b062153d01e160f6ab9be9af3a496af02776eab', size: 8843473, path: 'world/basemap-6e904ac9639965dd65ee8b457b062153d01e160f6ab9be9af3a496af02776eab.pmtiles', bounds: [60, -15, 160, 55], minzoom: 0, maxzoom: 6 }
    })
    expect(Object.keys(out)).toEqual(['format', 'built', 'packs', 'world'])
    expect(out.packs[1]).not.toHaveProperty('basemap')
    expect(live()).toEqual(before) // input not mutated
  })

  it('is idempotent on an index that already has the entries', () => {
    const once = withBasemaps(live(), seed)
    expect(withBasemaps(once, seed)).toEqual(once)
  })
})

describe('reachableManifest: only files that answer at the public URL', () => {
  const BASE = 'https://files.test/region-packs/'
  const paths = { [BOHOL]: seed.basemaps[BOHOL].path, [SCOT]: seed.basemaps[SCOT].path, world: seed.world.path }
  /** A fake server: `answers` maps a path to what HEAD and a 0-0 range read return (a status, or 'throw'). */
  const server = (answers: Record<string, { head?: number | 'throw'; range?: number | 'throw' }>) => {
    const calls: string[] = []
    const f = async (url: string, init?: RequestInit) => {
      const path = url.replace(BASE, ''), kind = init?.method === 'HEAD' ? 'head' : 'range'
      calls.push(`${kind} ${path}`)
      const a = answers[path]?.[kind]
      if (a === 'throw') throw new Error('network')
      return { status: a ?? 404 }
    }
    return { f, calls }
  }

  it('keeps every file that answers 200 on HEAD or 206 on a 0-0 range read', async () => {
    const s = server({ [paths[BOHOL]]: { head: 200 }, [paths[SCOT]]: { head: 405, range: 206 }, [paths.world]: { head: 403, range: 200 } })
    const lines: string[] = []
    const m = await reachableManifest(seed, BASE, s.f, (l) => lines.push(l))
    expect(m).toEqual(seed)
    expect(lines).toEqual([])
    expect(s.calls).toContain(`range ${paths[SCOT]}`)
  })

  it('leaves out the world file and a province file that are not uploaded, with a log line each, and GenSan follows its target', async () => {
    const s = server({ [paths[BOHOL]]: { head: 200 }, [paths[SCOT]]: { head: 'throw', range: 404 } })
    const lines: string[] = []
    const m = await reachableManifest(seed, BASE, s.f, (l) => lines.push(l))
    expect(lines).toEqual([`basemap ${SCOT}: ${paths[SCOT]} not reachable, left out of index.json`, `basemap world: ${paths.world} not reachable, left out of index.json`])
    const out = withBasemaps(live(), m) as unknown as { world?: unknown; packs: { code: string; basemap?: unknown }[] }
    expect(out).not.toHaveProperty('world')
    expect(out.packs.map((p) => [p.code, p.basemap !== undefined])).toEqual([[BOHOL, true], ['0702200000', false], [SCOT, false], [GENSAN, false]])
    expect(seed.world.sha256).toBeTruthy() // the input manifest is not mutated
    expect(Object.keys(seed.basemaps)).toContain(SCOT)
  })
})
