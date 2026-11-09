import { distanceKm } from './geo'

/** Offline barangay points (D-181): 1-degree tiles built from OpenStreetMap by scripts/places/build-barangays.mjs.
 *  Data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright */
type Row = [lat: number, lon: number, name: string, town: string]
export interface NearestBarangay { name: string; town: string; km: number }

const KM_PER_DEG = 111.195
const tiles = new Map<string, Promise<Row[]>>()

/** One tile, cached in memory. A missing tile (404) is an empty tile for good; a network failure is retried next time. */
function tile(key: string): Promise<Row[]> {
  let p = tiles.get(key)
  if (!p) {
    p = fetch(`/geo/barangays/${key}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : r.status === 404 ? [] : Promise.reject(new Error(String(r.status)))))
      .catch(() => { tiles.delete(key); return [] as Row[] })
    tiles.set(key, p)
  }
  return p
}

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
      if (km <= maxKm && (!best || km < best.km)) best = { name, town, km }
    }
  return best
}

/** Test hook: forget every cached tile. */
export const _resetBarangayPacks = () => tiles.clear()
