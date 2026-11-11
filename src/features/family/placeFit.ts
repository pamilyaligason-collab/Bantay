import { distanceKm, type LatLon } from '../location/geo'

/** Two points farther apart than this are not one neighbourhood of the map (the Philippines is about 1,800 km long; Texas is about 13,000 km from Manila). */
export const FAR_KM = 3000

/** S30 L9 (F2): which pins the map fits and which one are "far away". Pins join one cluster when a chain of them is each within FAR_KM of the next
 *  (single link). The biggest cluster is fitted (a tie goes to the cluster of the first place given); every pin outside it is far, with its distance from the fitted cluster's centre.
 *  Everyone close together: no far pin, the same fit as before. */
export function fitPlan<T extends LatLon>(points: readonly T[], farKm: number = FAR_KM): { main: T[]; far: { place: T; km: number }[] } {
  const parent = points.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (distanceKm(points[i]!, points[j]!) <= farKm) parent[find(i)] = find(j)
  const groups = new Map<number, number[]>()
  points.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]) })
  let best: number[] = []
  for (const g of groups.values()) if (g.length > best.length) best = g // Map keeps insertion order, so a tie keeps the earlier cluster
  const main = best.map((i) => points[i]!)
  if (!main.length) return { main: [], far: [] }
  const c = { lat: main.reduce((a, p) => a + p.lat, 0) / main.length, lon: main.reduce((a, p) => a + p.lon, 0) / main.length }
  const far = points.filter((_, i) => !best.includes(i)).map((place) => ({ place, km: distanceKm(c, place) }))
  return { main, far }
}
