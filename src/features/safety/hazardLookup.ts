// Hazard levels at a point, offline, from the unit's NOAH PMTiles file (docs/local-data/HAZARDS.md section 4).
// A small PMTiles v3 reader and Mapbox vector tile decoder, so no dependency is added; both are only ever imported lazily.
// shortcut: reads the root directory and one leaf level, which is what tippecanoe/pmtiles write for province-sized files; upgrade to the pmtiles package for deeper trees.
import type { LatLon } from '../location/geo'

export interface Bytes { get(offset: number, length: number): Promise<Uint8Array> }
export const blobBytes = (b: Blob): Bytes => ({ get: async (o, l) => new Uint8Array(await b.slice(o, o + l).arrayBuffer()) })

const SMALL = 2_000_000 // header, metadata, directories and z12 tiles are far below this; only these are kept for the session
const sources = new Map<string, Bytes>()
/** A pack file read straight from its public URL with HTTP Range requests (HAZ-ONLINE, D-147): the 30 MB file is never downloaded whole.
 *  A server that ignores Range (answers 200) is refused, so a misconfigured host can never cost the whole file. Small ranges are kept per URL for the session; a failed read is never kept. */
export function urlBytes(url: string, f: typeof fetch = fetch): Bytes {
  const mine = sources.get(url)
  if (mine && f === fetch) return mine
  const memo = new Map<string, Promise<Uint8Array>>()
  const b: Bytes = {
    get(o, l) {
      const k = `${o}:${l}`, hit = memo.get(k)
      if (hit) return hit
      const p = (async () => {
        const r = await f(url, { headers: { Range: `bytes=${o}-${o + l - 1}` }, signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(15_000) : undefined })
        if (r.status !== 206) { void r.body?.cancel().catch(() => undefined); throw new Error(`range not honoured (${r.status})`) }
        const buf = new Uint8Array(await r.arrayBuffer())
        if (buf.byteLength !== l) throw new Error('short range')
        return buf
      })()
      if (l <= SMALL) { memo.set(k, p); p.catch(() => memo.delete(k)) }
      return p
    }
  }
  if (f === fetch) sources.set(url, b)
  return b
}

export interface Header {
  rootOffset: number; rootLength: number; metaOffset: number; metaLength: number; leafOffset: number; leafLength: number; dataOffset: number; dataLength: number
  internalCompression: number; tileCompression: number; minZoom: number; maxZoom: number; bounds: [number, number, number, number]
}
interface Dir { tileId: number; offset: number; length: number; run: number }

const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true))

export function parseHeader(b: Uint8Array): Header {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (b.length < 127 || String.fromCharCode(...b.subarray(0, 7)) !== 'PMTiles' || b[7] !== 3) throw new Error('not a PMTiles v3 file')
  const deg = (o: number) => v.getInt32(o, true) / 1e7
  return {
    rootOffset: u64(v, 8), rootLength: u64(v, 16), metaOffset: u64(v, 24), metaLength: u64(v, 32), leafOffset: u64(v, 40), leafLength: u64(v, 48), dataOffset: u64(v, 56), dataLength: u64(v, 64),
    internalCompression: b[97]!, tileCompression: b[98]!, minZoom: b[100]!, maxZoom: b[101]!, bounds: [deg(102), deg(106), deg(110), deg(114)]
  }
}

/** Hilbert-curve tile id, as the PMTiles spec defines it. */
export function tileId(z: number, x: number, y: number): number {
  let acc = 0
  for (let t = 0; t < z; t++) acc += 4 ** t
  let tx = x, ty = y, d = 0
  for (let s = 2 ** z / 2; s >= 1; s /= 2) {
    const rx = (tx & s) > 0 ? 1 : 0, ry = (ty & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (ry === 0) { if (rx === 1) { tx = s - 1 - tx; ty = s - 1 - ty } [tx, ty] = [ty, tx] }
  }
  return acc + d
}

async function inflate(b: Uint8Array, kind: number): Promise<Uint8Array> {
  if (kind === 1) return b
  if (kind !== 2) throw new Error('unsupported compression')
  const s = new Response(b as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}

function varints(b: Uint8Array) {
  let p = 0
  return () => { let r = 0, m = 1, c: number; do { c = b[p++]!; r += (c & 0x7f) * m; m *= 128 } while (c & 0x80); return r }
}
function readDir(b: Uint8Array): Dir[] {
  const rd = varints(b), n = rd(), out: Dir[] = []
  let id = 0
  for (let i = 0; i < n; i++) { id += rd(); out.push({ tileId: id, offset: 0, length: 0, run: 0 }) }
  for (const e of out) e.run = rd()
  for (const e of out) e.length = rd()
  for (let i = 0; i < n; i++) { const o = rd(); out[i]!.offset = o === 0 && i > 0 ? out[i - 1]!.offset + out[i - 1]!.length : o - 1 }
  return out
}
const find = (dir: Dir[], id: number): Dir | null => {
  let lo = 0, hi = dir.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1, e = dir[m]!
    if (id < e.tileId) hi = m - 1
    else if (id > e.tileId) lo = m + 1
    else return e
  }
  const e = dir[hi]
  return e && (e.run === 0 || id - e.tileId < e.run) ? e : null
}

/** The raw (decompressed) tile bytes, or null when the file has no such tile. */
export async function getTile(src: Bytes, h: Header, z: number, x: number, y: number): Promise<Uint8Array | null> {
  const id = tileId(z, x, y)
  let dir = readDir(await inflate(await src.get(h.rootOffset, h.rootLength), h.internalCompression))
  for (let depth = 0; depth < 3; depth++) {
    const e = find(dir, id)
    if (!e) return null
    if (e.run > 0) return inflate(await src.get(h.dataOffset + e.offset, e.length), h.tileCompression)
    dir = readDir(await inflate(await src.get(h.leafOffset + e.offset, e.length), h.internalCompression))
  }
  throw new Error('directory tree too deep') // not an answer: a deeper tree than this reader handles must read as "not checked", never as "no tile"
}

/** Layers the file's own metadata lists with a "level" field (tippecanoe writes vector_layers). Anything not listed is not trusted: a layer-name mismatch must not read as "no hazard". */
export async function metaLayers(src: Bytes, h: Header): Promise<Set<string>> {
  if (!h.metaLength) return new Set()
  const raw = await src.get(h.metaOffset, h.metaLength) // a read failure rejects: it must never look like "the file lists no layers"
  try {
    const m = JSON.parse(new TextDecoder().decode(await inflate(raw, h.internalCompression))) as { vector_layers?: { id?: unknown; fields?: Record<string, unknown> }[] }
    return new Set((m.vector_layers ?? []).filter((l) => typeof l.id === 'string' && l.fields && Object.hasOwn(l.fields, 'level')).map((l) => l.id as string))
  } catch { return new Set() }
}

/* ---- Mapbox vector tile: only polygon layers with an integer `level` property ---- */
interface Feature { level: number | null; rings: [number, number][][] }
export interface Layer { name: string; extent: number; features: Feature[] }

function pb(b: Uint8Array) {
  let p = 0
  const varint = () => { let r = 0, m = 1, c: number; do { c = b[p++]!; r += (c & 0x7f) * m; m *= 128 } while (c & 0x80); return r }
  return {
    more: () => p < b.length,
    tag: () => { const t = varint(); return [t >> 3, t & 7] as const },
    varint,
    f64: () => { const v = new DataView(b.buffer, b.byteOffset + p, 8).getFloat64(0, true); p += 8; return v },
    f32: () => { const v = new DataView(b.buffer, b.byteOffset + p, 4).getFloat32(0, true); p += 4; return v },
    bytes: () => { const n = varint(); const s = b.subarray(p, p + n); p += n; return s },
    skip: (wt: number) => { if (wt === 0) varint(); else if (wt === 1) p += 8; else if (wt === 2) { const n = varint(); p += n } else if (wt === 5) p += 4 }
  }
}
const zig = (n: number) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2)

export function decodeTile(tile: Uint8Array): Layer[] {
  const out: Layer[] = [], t = pb(tile)
  while (t.more()) {
    const [f, wt] = t.tag()
    if (f !== 3 || wt !== 2) { t.skip(wt); continue }
    const l = pb(t.bytes()), keys: string[] = [], vals: (number | string | boolean)[] = [], raw: Uint8Array[] = []
    let name = '', extent = 4096
    while (l.more()) {
      const [lf, lw] = l.tag()
      if (lf === 1) name = new TextDecoder().decode(l.bytes())
      else if (lf === 2) raw.push(l.bytes())
      else if (lf === 3) keys.push(new TextDecoder().decode(l.bytes()))
      else if (lf === 4) { const v = pb(l.bytes()); let val: number | string | boolean = 0; while (v.more()) { const [vf, vw] = v.tag(); if (vf === 1) val = new TextDecoder().decode(v.bytes()); else if (vf === 3) val = v.f64(); else if (vf === 2) val = v.f32(); else if (vf === 6) val = zig(v.varint()); else if (vf === 4 || vf === 5 || vf === 7) val = v.varint(); else v.skip(vw) } vals.push(val) }
      else if (lf === 5) extent = l.varint()
      else l.skip(lw)
    }
    const features: Feature[] = []
    for (const fb of raw) {
      const fr = pb(fb)
      let tags: number[] = [], type = 0, geom: number[] = []
      while (fr.more()) {
        const [ff, fw] = fr.tag()
        if (ff === 2 || ff === 4) { const s = pb(fr.bytes()), a: number[] = []; while (s.more()) a.push(s.varint()); if (ff === 2) tags = a; else geom = a }
        else if (ff === 3) type = fr.varint()
        else fr.skip(fw)
      }
      if (type !== 3) continue
      let level: number | null = null
      for (let i = 0; i + 1 < tags.length; i += 2) if (keys[tags[i]!] === 'level' && typeof vals[tags[i + 1]!] === 'number') level = vals[tags[i + 1]!] as number
      const rings: [number, number][][] = []
      let cur: [number, number][] = [], x = 0, y = 0
      for (let i = 0; i < geom.length;) {
        const c = geom[i++]!, id = c & 7, n = c >> 3
        if (id === 7) { if (cur.length) rings.push(cur); cur = []; continue }
        for (let k = 0; k < n; k++) {
          x += zig(geom[i++]!); y += zig(geom[i++]!)
          if (id === 1) { if (cur.length) rings.push(cur); cur = [] }
          cur.push([x, y])
        }
      }
      if (cur.length) rings.push(cur)
      features.push({ level, rings })
    }
    out.push({ name, extent, features })
  }
  return out
}

const inside = (x: number, y: number, ring: [number, number][]) => {
  let r = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r
  }
  return r
}

export const LOOKUP_ZOOM = 12
export function tileOf(p: LatLon, z: number) {
  const n = 2 ** z, rad = (p.lat * Math.PI) / 180
  const fx = ((p.lon + 180) / 360) * n, fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  return { x: Math.floor(fx), y: Math.floor(fy), px: fx - Math.floor(fx), py: fy - Math.floor(fy) }
}

/** null = not on this phone / outside the file's bounds ("Not checked for this place yet"); 0 = inside the bounds with no mapped hazard; 1-3 = low, medium, high. */
export type Level = 0 | 1 | 2 | 3 | null
export interface HazardLevels { flood: Level; landslide: Level; surge: Level }
export const NONE: HazardLevels = { flood: null, landslide: null, surge: null }

export type LayerBounds = Partial<Record<keyof HazardLevels, number[]>>
const within = (p: LatLon, b: readonly number[] | undefined) => !!b && b.length === 4 && p.lon >= b[0]! && p.lon <= b[2]! && p.lat >= b[1]! && p.lat <= b[3]!

/** Highest level per layer at the point. Reads the z12 tile (or the file's top zoom when lower).
 *  `bounds` are the index's per-layer extents (HAZARDS.md section 4 step 3): a layer with no bounds, or a point outside them, is null ("not checked"), never "no mapped hazard".
 *  Without `bounds` (tests, older rows) the file header's one box is used for all three layers. */
export async function hazardsAt(p: LatLon, src: Bytes, bounds?: LayerBounds): Promise<HazardLevels> {
  const h = parseHeader(await src.get(0, 127))
  const listed = await metaLayers(src, h)
  const ok = (l: keyof HazardLevels) => listed.has(l) && within(p, bounds ? bounds[l] : h.bounds)
  if (!(ok('flood') || ok('landslide') || ok('surge'))) return NONE
  const z = Math.min(LOOKUP_ZOOM, h.maxZoom), t = tileOf(p, z)
  const tile = await getTile(src, h, z, t.x, t.y)
  const out: HazardLevels = { flood: ok('flood') ? 0 : null, landslide: ok('landslide') ? 0 : null, surge: ok('surge') ? 0 : null }
  if (!tile) return out // tippecanoe writes no tile where no feature falls (HAZARDS.md section 3), and the real directories resolve (checked on both live packs), so an in-bounds miss means none mapped; an unresolvable tree throws above
  for (const layer of decodeTile(tile)) {
    if (!Object.hasOwn(out, layer.name) || out[layer.name as keyof HazardLevels] === null) continue
    const lx = t.px * layer.extent, ly = t.py * layer.extent
    let best = 0
    let bad = false
    for (const f of layer.features) {
      if (f.level === null || !Number.isInteger(f.level) || f.level < 1 || f.level > 3) { bad = true; continue } // an unreadable level is not 'none'
      if (f.level <= best) continue
      // even-odd over all rings of the feature: the hole of a polygon is outside it
      if (f.rings.filter((r) => inside(lx, ly, r)).length % 2 === 1) best = f.level
    }
    out[layer.name as keyof HazardLevels] = (bad && best === 0 ? null : best) as Level // a readable hit still counts; only a miss next to an unreadable level is unknown
  }
  return out
}

/** Levels at a point read online from the pack's public URL. urlBytes keeps the header, directories and tile ranges for the session, so a nearby point costs no new request.
 *  `key` names the file version (its checksum) and is kept for callers. Throws when the read fails: the caller treats that as "not checked", never as "no hazard". */
export const hazardsOnline = (p: LatLon, url: string, _key: string, bounds?: LayerBounds, f: typeof fetch = fetch): Promise<HazardLevels> => hazardsAt(p, urlBytes(url, f), bounds)
export const resetOnlineCache = () => sources.clear()
