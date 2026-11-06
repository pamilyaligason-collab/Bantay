// Basemap for the Safety maps (D-131, D-132): a stored PMTiles Blob, else the same file streamed by range requests, else OSM pictures, else nothing.
// Only used when FLAGS.offlineMaps is on. This file stays small: protomaps-leaflet and pmtiles load only when a map actually draws a vector basemap.
import type { Layer, TileLayer } from 'leaflet'
import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { Source } from 'pmtiles'
import { db, type PackRow } from '../../db'
import { downloadBasemap, getIndex, packBase, type PackIndex, removeBasemap } from './packs'

type Leaflet = typeof import('leaflet')
type Bounds = [number, number, number, number] // west, south, east, north

/** The index.json shape of a basemap file, under a pack's `basemap` or the top level `world`. */
export interface BasemapFile { version: number; checksum: string; size: number; path: string; bounds: Bounds; minzoom: number; maxzoom: number }
/** `code` is the pack's code, or 'world' for the overview file. */
export interface BasemapEntry extends BasemapFile { code: string }
export interface StoredBasemap { code: string; checksum: string; bounds: Bounds; blob: Blob; savedAt: string }
export interface View { lat: number; lon: number; zoom: number }
export interface BasemapChoice { kind: 'blob' | 'stream' | 'osm' | 'none'; entry?: BasemapEntry; /** set when kind is 'blob' */ blob?: Blob }

export const ATTRIBUTION = '© OpenStreetMap contributors'
export const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
/** Vector tiles are scaled up this many zoom levels past the file's own maxzoom before the picture is judged too blurry. */
const OVERZOOM = 4
/** A province file is mostly blank when zoomed out: below this the regional files give way (the world file has no such floor). */
const REGION_MIN_ZOOM = 8

export { downloadBasemap, removeBasemap }

/** Every basemap the index lists: one per pack that has one, plus the world file. */
export function basemapEntries(index: PackIndex | null): BasemapEntry[] {
  if (!index) return []
  const out = index.packs.flatMap((p) => (p.basemap ? [{ ...p.basemap, code: p.code }] : []))
  return index.world ? [...out, { ...index.world, code: 'world' }] : out
}

export function storedBasemaps(rows: PackRow[]): StoredBasemap[] {
  return rows.flatMap((r) => (r.basemap ? [{ code: r.code, ...r.basemap }] : []))
}

const inside = (b: readonly number[], v: View) => v.lon >= b[0]! && v.lon <= b[2]! && v.lat >= b[1]! && v.lat <= b[3]!
const area = (b: readonly number[]) => (b[2]! - b[0]!) * (b[3]! - b[1]!)
const smallest = <T extends { bounds: readonly number[] }>(xs: T[]) => xs.reduce<T | undefined>((m, x) => (!m || area(x.bounds) < area(m.bounds) ? x : m), undefined)

/** The order: (1) a stored file whose bounds hold the view, (2) online and inside a listed file's bounds: stream it, (3) online: OSM pictures, (4) nothing. Edges count as inside. */
export function pickBasemap(view: View, opts: { online: boolean; entries: BasemapEntry[]; stored: StoredBasemap[] }): BasemapChoice {
  const usable = (e: Pick<BasemapEntry, 'code' | 'minzoom' | 'maxzoom'>) => view.zoom >= Math.max(e.minzoom, e.code === 'world' ? 0 : REGION_MIN_ZOOM) && view.zoom <= e.maxzoom + OVERZOOM
  const have = smallest(opts.stored.filter((s) => inside(s.bounds, view) && usable(opts.entries.find((e) => e.code === s.code) ?? { code: s.code, minzoom: 0, maxzoom: 15 })))
  if (have) {
    const listed = opts.entries.find((e) => e.code === have.code)
    return { kind: 'blob', blob: have.blob, entry: listed ?? { code: have.code, version: 0, checksum: have.checksum, size: have.blob.size, path: '', bounds: have.bounds, minzoom: 0, maxzoom: 15 } }
  }
  if (!opts.online) return { kind: 'none' }
  const entry = smallest(opts.entries.filter((e) => inside(e.bounds, view) && usable(e)))
  return entry ? { kind: 'stream', entry } : { kind: 'osm' }
}

/** A PMTiles source over a stored file: the reader asks for byte ranges, the Blob hands them out without reading the rest. */
export const blobSource = (blob: Blob, key: string): Source => ({
  getKey: () => key,
  getBytes: async (offset, length) => ({ data: await blob.slice(offset, offset + length).arrayBuffer() })
})

let warned = false
/** One line per session: the app's client error report when it can send (it dedupes and drops message text), else the console. */
function warnOnce(e: unknown) {
  if (warned) return
  warned = true
  import('../monitor/errors').then((m) => m.reportError('unhandledrejection', e instanceof Error ? `${e.name}: ${e.message}` : 'basemap', e)).catch(() => console.warn('basemap: vector basemap failed, using OSM pictures'))
}

/** The Leaflet layer for a choice. Returns at once; a vector basemap fills in when its library has loaded, and is dropped if the layer left the map first. */
export function basemapLayer(L: Leaflet, choice: BasemapChoice): Layer {
  if (choice.kind === 'osm') return L.tileLayer(OSM_URL, { maxZoom: 19, attribution: ATTRIBUTION })
  const group = L.layerGroup()
  const { entry, blob } = choice
  if (!entry || (choice.kind !== 'blob' && choice.kind !== 'stream')) return group
  let run = 0, inner: TileLayer | null = null
  group.on('add', () => {
    const mine = ++run
    void (async () => {
      const [{ leafletLayer }, { PMTiles }] = await Promise.all([import('protomaps-leaflet'), import('pmtiles')])
      if (mine !== run) return
      const base = packBase()
      const url = blob ? new PMTiles(blobSource(blob, `basemap:${entry.code}:${entry.checksum}`)) : base ? `${base}${entry.path}` : null
      if (!url) throw new Error('no pack base')
      inner = leafletLayer({ url, flavor: 'light', lang: 'en', attribution: ATTRIBUTION, maxZoom: 19, maxDataZoom: entry.maxzoom }) as unknown as TileLayer
      group.addLayer(inner)
    })().catch((e: unknown) => {
      if (mine !== run) return
      warnOnce(e)
      group.addLayer(L.tileLayer(OSM_URL, { maxZoom: 19, attribution: ATTRIBUTION })) // the map stays usable: OSM pictures
    })
  })
  group.on('remove', () => { run++; if (inner) { group.removeLayer(inner); inner = null } })
  return group
}

/** Everything pickBasemap needs for one map, read now: what is stored on the phone and, when online and nothing stored covers the view, the server's list. */
export async function chooseBasemap(view: View, online = typeof navigator === 'undefined' || navigator.onLine): Promise<BasemapChoice> {
  let stored: StoredBasemap[] = []
  try { stored = storedBasemaps(await db.packs.toArray()) } catch { /* no storage: stream or OSM */ }
  const first = pickBasemap(view, { online, entries: [], stored })
  if (first.kind === 'blob' || !online) return first
  const index = await Promise.race([getIndex().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3000))])
  return pickBasemap(view, { online, entries: basemapEntries(index), stored })
}

/** The basemap files on the phone, kept up to date as they are downloaded and removed. */
export function useStoredBasemaps(): StoredBasemap[] {
  const [rows, setRows] = useState<StoredBasemap[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.packs.toArray()).subscribe({ next: (r) => setRows(storedBasemaps(r)), error: () => setRows([]) })
    return () => sub.unsubscribe()
  }, [])
  return rows
}
