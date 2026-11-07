// Which pack unit (province or city) is the phone in? Worked out on the phone from public/geo/units.json
// (geoBoundaries PHL ADM2, CC BY 3.0 IGO, built by scripts/local-data/units.mjs). No position is sent anywhere.
import type { LatLon } from '../location/geo'

/** polys: one entry per polygon; a polygon is a list of rings; a ring is [lon, lat] pairs.
 *  parent: the code of the unit whose outline contains this one (a city inside its province; set by scripts/local-data/units.mjs nest). */
export interface Unit { code: string; name: string; bbox: [number, number, number, number]; polys: number[][][][]; parent?: string }
export interface UnitsFile { format: 1; source: string; sha256: string; units: Unit[] }

const inRing = (x: number, y: number, ring: number[][]): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside
  }
  return inside
}
const holds = (u: Unit, p: LatLon): boolean => {
  const [w, s, e, n] = u.bbox
  if (p.lon < w || p.lon > e || p.lat < s || p.lat > n) return false
  // even-odd over all rings of a polygon: a hole (a second ring inside the first) takes the point out
  return u.polys.some((poly) => poly.reduce((c, ring) => c + (inRing(p.lon, p.lat, ring) ? 1 : 0), 0) % 2 === 1)
}
const area = (u: Unit) => (u.bbox[2] - u.bbox[0]) * (u.bbox[3] - u.bbox[1])

/** The unit holding the point, or null (at sea, abroad, no data). Bounding box first; the smallest box wins, so a city beats the province around it. */
export function unitAt(p: LatLon, units: readonly Unit[]): string | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null
  let best: Unit | null = null
  for (const u of units) {
    if (best && area(u) >= area(best)) continue
    if (holds(u, p)) best = u
  }
  return best?.code ?? null
}

/** Switch only after two fixes at least 2 minutes apart both fall in the new unit, so a road along a border does not flap.
 *  A fix in no unit (at sea) changes nothing. The first fix is taken at once. */
export const SWITCH_MS = 120_000
export class UnitTracker {
  cand: { unit: string; at: number } | null = null
  constructor(public cur: string | null = null) {}
  push(unit: string | null, at: number): string | null {
    if (unit === null) return this.cur
    if (this.cur === null) { this.cur = unit; return unit }
    if (unit === this.cur) { this.cand = null; return this.cur }
    if (this.cand?.unit !== unit) this.cand = { unit, at }
    else if (at - this.cand.at >= SWITCH_MS) { this.cur = unit; this.cand = null }
    return this.cur
  }
}

/** How many outlines hold the point. The outlines are simplified (~440 m), so neighbours overlap in thin border strips; a point two units both claim is not proven
 *  (each hazard file is clipped at its own border, so reading the wrong one would give a false 0, ML-05). A province that holds a city outline (`parent`) does not count
 *  while that city holds the point too: the city is inside it on purpose, so a point in a city is claimed once. A city counts only where its province also holds the point:
 *  a city sliver outside the province outline is read from the province's hazard file, which may not cover it, so it stays unproven. */
export const claims = (p: LatLon, units: readonly Unit[]): number => {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return 0
  const held = units.filter((u) => holds(u, p))
  return held.filter((u) => !held.some((c) => c.parent === u.code) && (!u.parent || held.some((q) => q.code === u.parent))).length
}

let cache: Promise<Unit[]> | null = null
/** shortcut: units.json is fetched once per load; a failed fetch is retried on the next load. */
export function loadUnits(fetcher: typeof fetch = fetch): Promise<Unit[]> {
  cache ??= fetcher('/geo/units.json').then((r) => (r.ok ? r.json() : null)).then((j: UnitsFile | null) => (j?.format === 1 && Array.isArray(j.units) ? j.units : [])).catch(() => { cache = null; return [] })
  return cache
}
