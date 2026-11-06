// @vitest-environment node
import { createHash } from 'node:crypto'
import { PMTiles } from 'pmtiles'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PackRow } from '../../db'
import { P, pmtilesFile, tileBytes } from '../../../e2e/fixtures/p2/pmtilesFixture'
import { type BasemapEntry, basemapEntries, blobSource, pickBasemap, type StoredBasemap, storedBasemaps } from './basemap'
import { downloadBasemap, type PackIndex, removeBasemap, resetIndexCache, type Store } from './packs'

const BASE = 'https://files.test/region-packs/'
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
// Invented boxes: Bohol-like [123.7, 9.5, 124.7, 10.2] and a world overview [60, -15, 160, 55] (zoom 0-6).
const BOHOL: BasemapEntry = { code: 'B', version: 1, checksum: 'b1', size: 10, path: 'B/basemap-b1.pmtiles', bounds: [123.7, 9.5, 124.7, 10.2], minzoom: 0, maxzoom: 15 }
const WORLD: BasemapEntry = { code: 'world', version: 1, checksum: 'w1', size: 10, path: 'world/basemap-w1.pmtiles', bounds: [60, -15, 160, 55], minzoom: 0, maxzoom: 6 }
const blob = new Blob(['x'])
const STORED: StoredBasemap = { code: 'B', checksum: 'b1', bounds: [123.7, 9.5, 124.7, 10.2], blob, savedAt: '2026-11-06T00:00:00.000Z' }
const IN = { lat: 9.85, lon: 124.2, zoom: 13 }

describe('pickBasemap', () => {
  it('uses a stored file that covers the view, online or offline, ahead of the stream', () => {
    for (const online of [true, false]) {
      const c = pickBasemap(IN, { online, entries: [BOHOL], stored: [STORED] })
      expect(c.kind).toBe('blob'); expect(c.blob).toBe(blob); expect(c.entry?.code).toBe('B')
    }
  })
  it('streams inside a listed box when online and nothing is stored', () => {
    const c = pickBasemap(IN, { online: true, entries: [BOHOL], stored: [] })
    expect(c).toEqual({ kind: 'stream', entry: BOHOL })
  })
  it('falls to OSM pictures online outside every listed box, and to nothing offline', () => {
    const out = { lat: 14.6, lon: 121, zoom: 13 }
    expect(pickBasemap(out, { online: true, entries: [BOHOL], stored: [STORED] }).kind).toBe('osm')
    expect(pickBasemap(out, { online: false, entries: [BOHOL], stored: [STORED] }).kind).toBe('none')
    expect(pickBasemap(IN, { online: false, entries: [BOHOL], stored: [] }).kind).toBe('none')
    expect(pickBasemap(IN, { online: true, entries: [], stored: [] }).kind).toBe('osm') // index not known: today's behaviour
  })
  it('counts the edge of a box as inside and a hair past it as outside', () => {
    const at = (lat: number, lon: number) => pickBasemap({ lat, lon, zoom: 13 }, { online: true, entries: [BOHOL], stored: [] }).kind
    expect(at(9.5, 123.7)).toBe('stream') // south-west corner
    expect(at(10.2, 124.7)).toBe('stream') // north-east corner
    expect(at(10.2001, 124.2)).toBe('osm')
    expect(at(9.85, 123.6999)).toBe('osm')
  })
  it('does not stream a province file when zoomed far out, but does the world file', () => {
    expect(pickBasemap({ ...IN, zoom: 5 }, { online: true, entries: [BOHOL], stored: [] }).kind).toBe('osm')
    const c = pickBasemap({ lat: 9.85, lon: 124.2, zoom: 4 }, { online: true, entries: [BOHOL, WORLD], stored: [] })
    expect(c).toEqual({ kind: 'stream', entry: WORLD })
    expect(pickBasemap({ ...IN, zoom: 14 }, { online: true, entries: [WORLD], stored: [] }).kind).toBe('osm') // world file is too coarse this close
  })
  it('prefers the smaller box when two cover the view', () => {
    expect(pickBasemap({ ...IN, zoom: 8 }, { online: true, entries: [WORLD, BOHOL], stored: [] }).entry?.code).toBe('B')
  })
  it('reads the stored file without the index (offline, entry list empty)', () => {
    const c = pickBasemap(IN, { online: false, entries: [], stored: [STORED] })
    expect(c.kind).toBe('blob'); expect(c.entry).toMatchObject({ code: 'B', maxzoom: 15, bounds: STORED.bounds })
  })
})

describe('basemapEntries and storedBasemaps', () => {
  it('lists each pack basemap and the world file; old indexes give none', () => {
    const idx = { format: 1, built: 'x', packs: [{ code: 'B', name: 'B', version: 1, checksum: 'c', size: 1, rows: 1, path: 'p', neighbours: [], basemap: { ...BOHOL, code: undefined } }, { code: 'N', name: 'N', version: 1, checksum: 'c', size: 1, rows: 1, path: 'p', neighbours: [] }], world: { ...WORLD, code: undefined } } as unknown as PackIndex
    expect(basemapEntries(idx).map((e) => e.code)).toEqual(['B', 'world'])
    expect(basemapEntries({ ...idx, world: undefined }).map((e) => e.code)).toEqual(['B'])
    expect(basemapEntries(null)).toEqual([])
  })
  it('takes only rows that hold a basemap', () => {
    const r = (code: string, basemap?: PackRow['basemap']): PackRow => ({ code, version: 1, checksum: 'x', name: code, neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true, basemap })
    const got = storedBasemaps([r('A'), r('B', { checksum: 'b1', bounds: [1, 2, 3, 4], blob, savedAt: 's' })])
    expect(got).toEqual([{ code: 'B', checksum: 'b1', bounds: [1, 2, 3, 4], blob, savedAt: 's' }])
  })
})

describe('blobSource', () => {
  const bytes = pmtilesFile(tileBytes(P, 2), false, P)
  it('hands out exact byte ranges of the Blob', async () => {
    const src = blobSource(new Blob([new Uint8Array(bytes)]), 'k')
    expect(src.getKey()).toBe('k')
    expect(Buffer.from((await src.getBytes(0, 7)).data).toString()).toBe('PMTiles')
    expect(Buffer.from((await src.getBytes(10, 20)).data).equals(bytes.subarray(10, 30))).toBe(true)
    expect((await src.getBytes(bytes.length - 5, 100)).data.byteLength).toBe(5) // past the end: what is there
  })
  it('lets the pmtiles reader open the header and find the tile', async () => {
    const t = new PMTiles(blobSource(new Blob([new Uint8Array(bytes)]), 'k2'))
    const h = await t.getHeader()
    expect([h.minLon, h.minLat, h.maxLon, h.maxLat]).toEqual([123.5, 9.3, 124.2, 9.9]) // P = 9.6 N, 123.9 E, box -0.4/-0.3/+0.3/+0.3
    expect(h.maxZoom).toBe(12)
    const n = 2 ** 12, x = Math.floor(((P.lon + 180) / 360) * n)
    const y = Math.floor(((1 - Math.log(Math.tan((P.lat * Math.PI) / 180) + 1 / Math.cos((P.lat * Math.PI) / 180)) / Math.PI) / 2) * n)
    const tile = await t.getZxy(12, x, y)
    expect(tile?.data.byteLength).toBe(tileBytes(P, 2).length)
  })
})

describe('downloadBasemap and removeBasemap', () => {
  const FILE = new TextEncoder().encode('fake pmtiles bytes')
  const pack = (over: Partial<BasemapEntry> = {}): PackIndex => ({
    format: 1, built: 'x',
    packs: [{ code: 'B', name: 'B', version: 1, checksum: 'c', size: 1, rows: 1, path: 'B/B.json', neighbours: [], basemap: { version: 1, checksum: sha(FILE), size: FILE.length, path: 'B/basemap.pmtiles', bounds: BOHOL.bounds, minzoom: 0, maxzoom: 15, ...over } }]
  })
  const row: PackRow = { code: 'B', version: 1, checksum: 'c', name: 'B', neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true }
  const mem = (rows: PackRow[]): Store & { m: Map<string, PackRow> } => { const m = new Map(rows.map((r) => [r.code, r])); return { m, get: async (c) => m.get(c), put: async (r) => void m.set(r.code, r), all: async () => [...m.values()], remove: async (c) => void m.delete(c) } }
  const net = (idx: PackIndex, file: Uint8Array = FILE) => {
    const calls: string[] = []
    const f = (async (u: string) => { const rel = u.replace(BASE, ''); calls.push(rel); return rel === 'index.json' ? new Response(JSON.stringify(idx)) : new Response(file as BodyInit) }) as unknown as typeof fetch
    return { f, calls }
  }
  beforeEach(() => resetIndexCache())

  it('stores the Blob in the pack row after the sha256 matches, on a tap', async () => {
    const s = mem([row]), n = net(pack())
    expect(await downloadBasemap('B', { fetch: n.f, base: BASE, store: s, tapped: true, wifi: false, now: Date.UTC(2026, 10, 6) })).toBe('done')
    const b = s.m.get('B')!.basemap!
    expect(b).toMatchObject({ checksum: sha(FILE), bounds: BOHOL.bounds, savedAt: '2026-11-06T00:00:00.000Z' })
    expect(b.blob.size).toBe(FILE.length)
    // already current: no second download
    resetIndexCache(); n.calls.length = 0
    expect(await downloadBasemap('B', { fetch: n.f, base: BASE, store: s, tapped: true, now: 1 })).toBe('done')
    expect(n.calls).toEqual(['index.json'])
  })
  it('rejects a file whose sha256 does not match and stores nothing', async () => {
    const s = mem([row])
    expect(await downloadBasemap('B', { fetch: net(pack(), new TextEncoder().encode('tampered')).f, base: BASE, store: s, tapped: true })).toBe('bad')
    expect(s.m.get('B')!.basemap).toBeUndefined()
  })
  it('waits for Wi-Fi without a tap, and says none for an unlisted or unsynced pack', async () => {
    const s = mem([row]), n = net(pack())
    expect(await downloadBasemap('B', { fetch: n.f, base: BASE, store: s, wifi: false })).toBe('wait')
    expect(n.calls).toEqual([])
    expect(await downloadBasemap('ZZ', { fetch: n.f, base: BASE, store: s, tapped: true })).toBe('none')
    expect(await downloadBasemap('B', { fetch: net(pack()).f, base: BASE, store: mem([]), tapped: true })).toBe('none')
    expect(await downloadBasemap('B', { fetch: n.f, base: null, store: s, tapped: true })).toBe('offline')
  })
  it('removeBasemap drops only the basemap', async () => {
    const s = mem([{ ...row, basemap: { checksum: 'x', bounds: BOHOL.bounds, blob, savedAt: 's' } }])
    await removeBasemap('B', s)
    expect(s.m.get('B')).toEqual(row)
    await removeBasemap('nope', s)
  })
})
