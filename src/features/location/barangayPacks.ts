import { distanceKm } from './geo'

/** Offline barangay points (D-181): 1-degree tiles built from OpenStreetMap by scripts/places/build-barangays.mjs.
 *  Data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright */
type Row = [lat: number, lon: number, name: string, town: string]
export interface NearestBarangay { name: string; town: string; km: number }

const KM_PER_DEG = 111.195
const tiles = new Map<string, Promise<Row[]>>()
let listed: Promise<Set<string>> | null = null

/** A JSON answer or nothing: Cloudflare Pages serves index.html with 200 for a missing file, so the content type is checked. */
async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url) // a network failure rejects: the caller decides whether to retry
  if (!r.ok || !/json/i.test(r.headers?.get('content-type') ?? '')) return null
  return (await r.json()) as T
}

/** index.json is read once; only tiles listed there are fetched. An HTTP error or a non-JSON answer is "no packs" for the session; a network failure is retried next time. */
function tileList(): Promise<Set<string>> {
  if (!listed) {
    const p: Promise<Set<string>> = getJson<{ tiles?: Record<string, number> }>('/geo/barangays/index.json')
      .then((j) => new Set(Object.keys(j?.tiles ?? {})))
      .catch((e) => { if (listed === p) listed = null; throw e })
    listed = p
  }
  return listed
}

/** One tile, cached in memory. Not listed, an HTTP error or a non-JSON answer is an empty tile for the session; a network failure is retried next time. */
function tile(key: string): Promise<Row[]> {
  let p = tiles.get(key)
  if (!p) {
    p = tileList()
      .then((l) => (l.has(key) ? getJson<Row[]>(`/geo/barangays/${key}.json`) : null))
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch(() => { tiles.delete(key); return [] as Row[] })
    tiles.set(key, p)
  }
  return p
}

/** OSM names a few barangays only by number ("670"): shown as "Barangay 670". */
const shown = (name: string) => (/^\d+$/.test(name) ? `Barangay ${name}` : name)

/** Nearest barangay point within maxKm, or null. Fetches the tile holding the point, plus a neighbour only when the point is within maxKm of that edge. */
export async function nearestBarangay(lat: number, lon: number, opts: { maxKm?: number } = {}): Promise<NearestBarangay | null> {
  const maxKm = opts.maxKm ?? 3
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const la = Math.floor(lat), lo = Math.floor(lon)
  const kmLon = KM_PER_DEG * Math.cos((lat * Math.PI) / 180)
  const dLats = [0, ...((lat - la) * KM_PER_DEG <= maxKm ? [-1] : []), ...((la + 1 - lat) * KM_PER_DEG <= maxKm ? [1] : [])]
  const dLons = [0, ...((lon - lo) * kmLon <= maxKm ? [-1] : []), ...((lo + 1 - lon) * kmLon <= maxKm ? [1] : [])]
  const keys = dLats.flatMap((a) => dLons.map((b) => `${la + a}_${lo + b}`))
  let best: NearestBarangay | null = null
  for (const rows of await Promise.all(keys.map(tile)))
    for (const [rl, ro, name, town] of rows) {
      const km = distanceKm({ lat, lon }, { lat: rl, lon: ro })
      if (km <= maxKm && (!best || km < best.km)) best = { name: shown(name), town, km }
    }
  return best
}

/** Test hook: forget every cached tile. */
export const _resetBarangayPacks = () => { tiles.clear(); listed = null }
