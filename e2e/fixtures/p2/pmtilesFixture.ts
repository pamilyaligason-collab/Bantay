// A tiny PMTiles v3 hazard file for tests (Node only): one z12 tile holding a flood square around the point at the given level
// (stored as a double, as tippecanoe does) and a landslide square elsewhere in the tile (level 3, sint). No surge layer. Invented coordinates.
import { gzipSync } from 'node:zlib'
import { tileId, tileOf } from '../../../src/features/safety/hazardLookup'

export const P = { lat: 9.6, lon: 123.9 }
const varint = (n: number) => { const o: number[] = []; while (n > 127) { o.push((n % 128) | 128); n = Math.floor(n / 128) } o.push(n); return o }
const zig = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n)
const field = (f: number, wt: number, body: number[]) => [...varint((f << 3) | wt), ...(wt === 2 ? varint(body.length) : []), ...body]
const str = (s: string) => [...Buffer.from(s)]
const square = (x0: number, y0: number, x1: number, y1: number) => [
  ...varint((1 << 3) | 1), ...varint(zig(x0)), ...varint(zig(y0)),
  ...varint((3 << 3) | 2), ...varint(zig(x1 - x0)), ...varint(0), ...varint(0), ...varint(zig(y1 - y0)), ...varint(zig(x0 - x1)), ...varint(0),
  ...varint((1 << 3) | 7)
]
function layer(name: string, level: { f: number; body: number[] }, geom: number[]) {
  const feat = [...field(2, 2, [0, 0]), ...field(3, 0, [3]), ...field(4, 2, geom)]
  return field(3, 2, [...field(1, 2, str(name)), ...field(2, 2, feat), ...field(3, 2, str('level')), ...field(4, 2, field(level.f, level.f === 3 ? 1 : 0, level.body)), ...field(5, 0, varint(4096)), ...field(15, 0, [2])])
}
const f64 = (n: number) => [...Buffer.from(new Float64Array([n]).buffer)]

export function tileBytes(p = P, flood = 2) {
  const t = tileOf(p, 12), px = Math.round(t.px * 4096), py = Math.round(t.py * 4096)
  return new Uint8Array([
    ...layer('flood', { f: 3, body: f64(flood) }, square(px - 100, py - 100, px + 100, py + 100)),
    ...layer('landslide', { f: 6, body: varint(zig(3)) }, square(px + 500, py + 500, px + 700, py + 700))
  ])
}

/** The whole file as bytes. `bounds` = [west, south, east, north]. */
export interface FileOpts {
  /** The metadata JSON's vector_layers ids (each with a `level` field). Default: flood, landslide, surge, as tippecanoe writes for the real packs. null = no metadata at all. */
  layers?: string[] | null
  /** gzip the directories and the metadata (internal compression 2), as the real packs do. Default false. */
  gzipDirs?: boolean
  /** Root directory holds one pointer (run 0) to a leaf directory, which holds the tile entry (after two decoy entries). Default false. */
  leaf?: boolean
}
const entries = (es: { id: number; run: number; length: number; offset: number }[]) => {
  const out = [...varint(es.length)]
  let prev = 0
  for (const e of es) { out.push(...varint(e.id - prev)); prev = e.id }
  for (const e of es) out.push(...varint(e.run))
  for (const e of es) out.push(...varint(e.length))
  for (const e of es) out.push(...varint(e.offset + 1))
  return Buffer.from(out)
}

export function pmtilesFile(tile: Uint8Array | null, gz: boolean, at = P, bounds = [at.lon - 0.4, at.lat - 0.3, at.lon + 0.3, at.lat + 0.3], opts: FileOpts = {}): Buffer {
  const t = tileOf(at, 12)
  const id = tileId(12, t.x, t.y)
  const zip = (b: Buffer) => (opts.gzipDirs ? gzipSync(b) : b)
  const data = tile ? (gz ? gzipSync(tile) : Buffer.from(tile)) : Buffer.alloc(0)
  const tileEntries = tile ? [{ id: id - 3, run: 1, length: 1, offset: 0 }, { id: id - 1, run: 1, length: 1, offset: 0 }, { id, run: 1, length: data.length, offset: 0 }] : []
  const leaf = opts.leaf && tile ? zip(entries(tileEntries)) : Buffer.alloc(0)
  const rootEntries = opts.leaf && tile ? [{ id: 0, run: 0, length: leaf.length, offset: 0 }] : tileEntries
  const root = zip(rootEntries.length ? entries(rootEntries) : Buffer.from([0]))
  const layers = opts.layers === undefined ? ['flood', 'landslide', 'surge'] : opts.layers
  const meta = layers === null ? Buffer.alloc(0) : zip(Buffer.from(JSON.stringify({ vector_layers: layers.map((l) => ({ id: l, fields: { level: 'Number' } })) })))
  const h = Buffer.alloc(127)
  h.write('PMTiles'); h[7] = 3
  h.writeBigUInt64LE(127n, 8); h.writeBigUInt64LE(BigInt(root.length), 16)
  h.writeBigUInt64LE(BigInt(127 + root.length), 24); h.writeBigUInt64LE(BigInt(meta.length), 32)
  h.writeBigUInt64LE(BigInt(127 + root.length + meta.length), 40); h.writeBigUInt64LE(BigInt(leaf.length), 48)
  h.writeBigUInt64LE(BigInt(127 + root.length + meta.length + leaf.length), 56); h.writeBigUInt64LE(BigInt(data.length), 64)
  h[97] = opts.gzipDirs ? 2 : 1; h[98] = gz ? 2 : 1; h[99] = 1; h[100] = 8; h[101] = 12
  bounds.forEach((d, i) => h.writeInt32LE(Math.round(d * 1e7), 102 + 4 * i))
  return Buffer.concat([h, root, meta, leaf, data])
}

/** A tile whose flood feature carries the given level (any number, or a string), for the bad-level tests. */
export function tileWithLevel(level: number | string, at = P): Uint8Array {
  const t = tileOf(at, 12), px = Math.round(t.px * 4096), py = Math.round(t.py * 4096)
  const sq = square(px - 100, py - 100, px + 100, py + 100)
  const val = typeof level === 'string' ? field(1, 2, str(level)) : field(3, 1, f64(level))
  const feat = [...field(2, 2, [0, 0]), ...field(3, 0, [3]), ...field(4, 2, sq)]
  return new Uint8Array(field(3, 2, [...field(1, 2, str('flood')), ...field(2, 2, feat), ...field(3, 2, str('level')), ...field(4, 2, val), ...field(5, 0, varint(4096)), ...field(15, 0, [2])]))
}
