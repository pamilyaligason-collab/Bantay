// Build public/geo/units.json: province and city outlines the phone uses to work out which pack unit it is in (APP-INTEGRATION.md section 3.2).
// Source: geoBoundaries PHL ADM2 (CC BY 3.0 IGO). The owner downloads the simplified GeoJSON once (the file the API at
// https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM2/ names as simplifiedGeometryGeoJSON); this script never touches the network.
//   node scripts/local-data/units.mjs --from <PHL_ADM2.geojson> [--from3 <PHL_ADM3.geojson>] [--out public/geo/units.json] [--tol 0.004] [--strict]
// The output records the sha256 of the file it was built from. Shapes are matched to the PSGC pack units by name (see `plain`); every shape
// or unit that did not match is listed, and --strict makes any such line fail the run. Review the list before shipping the file.
// ADM2 holds the provinces but NOT most highly urbanized cities (Cebu City, Davao City, General Santos ... sit inside their province shape or have none), so
// those units had no outline. Pass the PHL ADM3 simplified GeoJSON as --from3: a unit still without a shape then gets (a) the ADM3 feature named "<name> City"
// (a bare folded name is ambiguous: "Bacolod" is also a Lanao del Norte town) or (b) for a province split out of an ADM2 shape (Maguindanao del Norte/Sur) the
// union of its municipalities (psgc_lgus.csv) found by name inside that ADM2 shape's box. Still unmatched units are listed (PSGC cities without an outline).
// The 15 NCR cities and Pateros are covered by the City of Manila union (ALIAS) on purpose: the one Metro Manila hazard pack belongs to it (docs/local-data/HAZARDS.md).
// A city outline sits inside its province outline, so `nest` records `parent` (the province code) on the city and unitAt.claims() counts the city instead of the
// province: a point in a city is claimed once. (No polygon library is installed to cut the city out of the province.)
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCsv } from './lib.mjs'

export const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/^city of /, '').replace(/ city$/, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Douglas-Peucker on one ring of [lon, lat]; keeps first and last, never fewer than 4 points. */
export function simplify(ring, tol) {
  const keep = new Uint8Array(ring.length)
  keep[0] = keep[ring.length - 1] = 1
  const stack = [[0, ring.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let far = -1, dmax = tol
    const [ax, ay] = ring[a], [bx, by] = ring[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i]
      const d = len === 0 ? Math.hypot(x - ax, y - ay) : Math.abs(dy * x - dx * y + bx * ay - by * ax) / len
      if (d > dmax) { dmax = d; far = i }
    }
    if (far > -1) { keep[far] = 1; stack.push([a, far], [far, b]) }
  }
  const out = ring.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4])
  return out.length >= 4 ? out : ring.slice(0, 4)
}

/** geoBoundaries names that PSGC writes differently. The 4 NCR district shapes are one unit: the NCR hazards pack is owned by the City of Manila (the
 *  coverage table has no region-level unit, and region_packs.province_code must be a coverage code), so the union of the districts is filed under it. */
export const ALIAS = {
  'ncr, city of manila, first district': 'City of Manila', 'ncr, second district': 'City of Manila', 'ncr, third district': 'City of Manila', 'ncr, fourth district': 'City of Manila',
  'compostela valley': 'Davao de Oro'
}

/** geojson: FeatureCollection with shapeName; units: [{code, name}] pack units. Returns the units file and the names that did not match. */
export function buildUnits(geojson, units, sha256, tol = 0.004, adm3 = null, lgus = []) {
  // exact name first; the folded name only when it is unique ("City of Cebu" and "Cebu" fold together, so they are matched exactly or not at all)
  const exact = new Map(units.map((u) => [u.name.trim().toLowerCase(), u]))
  const folds = new Map()
  for (const u of units) folds.set(plain(u.name), [...(folds.get(plain(u.name)) ?? []), u])
  const byName = { get: (n) => exact.get(String(n).trim().toLowerCase()) ?? (folds.get(plain(n))?.length === 1 ? folds.get(plain(n))[0] : undefined) }
  const out = new Map(), noUnit = []
  const add = (u, f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    const cur = out.get(u.code) ?? { code: u.code, name: u.name, bbox: [180, 90, -180, -90], polys: [] }
    for (const poly of polys) {
      const rings = poly.map((r) => simplify(r, tol))
      for (const [x, y] of rings[0]) { cur.bbox[0] = Math.min(cur.bbox[0], x); cur.bbox[1] = Math.min(cur.bbox[1], y); cur.bbox[2] = Math.max(cur.bbox[2], x); cur.bbox[3] = Math.max(cur.bbox[3], y) }
      cur.polys.push(rings)
    }
    out.set(u.code, cur)
  }
  for (const f of geojson.features) {
    const u = byName.get(ALIAS[String(f.properties.shapeName ?? '').trim().toLowerCase()] ?? f.properties.shapeName ?? '')
    if (!u) { noUnit.push(f.properties.shapeName ?? '(no name)'); continue }
    add(u, f)
  }
  if (adm3) fromAdm3(adm3, geojson, units, lgus, add, out)
  const noShape = units.filter((u) => !out.has(u.code)).map((u) => u.name)
  return { file: { format: 1, source: adm3 ? 'geoBoundaries PHL ADM2 + ADM3 (CC BY 3.0 IGO)' : 'geoBoundaries PHL ADM2 (CC BY 3.0 IGO)', sha256, units: nest([...out.values()]) }, noUnit, noShape, cityGaps: adm3 ? cityGaps(adm3, [...out.values()], lgus) : { outside: [], unmatched: [] } }
}

const boxOf = (f) => {
  let b = [180, 90, -180, -90]
  for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) for (const [x, y] of poly[0]) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
  return b
}
const inBox = (f, b) => { const c = boxOf(f), cx = (c[0] + c[2]) / 2, cy = (c[1] + c[3]) / 2; return cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3] }

const inRing = (x, y, ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
// same even-odd rule as holds() in src/features/safety/unitAt.ts
const holds = (u, [x, y]) => x >= u.bbox[0] && x <= u.bbox[2] && y >= u.bbox[1] && y <= u.bbox[3] && u.polys.some((poly) => poly.reduce((c, r) => c + (inRing(x, y, r) ? 1 : 0), 0) % 2 === 1)
const areaOf = (u) => (u.bbox[2] - u.bbox[0]) * (u.bbox[3] - u.bbox[1])

/** Set `parent` on every CITY unit ("City of ...", "... City") that lies inside a bigger unit (a city inside its province). Provinces are never nested: two provinces that
 *  overlap in a border strip must both stay counted. Sample points: the box centre and the vertex mean of each polygon, kept when the city itself holds them. The parent is
 *  the bigger unit holding ALL of them (the smaller box on a tie). Edits and returns `units`. */
export function nest(units) {
  for (const u of units) {
    delete u.parent
    if (!/^city of |city$/i.test(u.name.trim())) continue
    const mine = u.polys.flatMap((poly) => {
      const r = poly[0].slice(0, -1), xs = r.map((q) => q[0]), ys = r.map((q) => q[1])
      return [[xs.reduce((a, b) => a + b) / r.length, ys.reduce((a, b) => a + b) / r.length], [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]]
    }).filter((pt) => holds(u, pt))
    let best = null, bestK = 0
    for (const v of units) {
      if (areaOf(v) <= areaOf(u)) continue
      const k = mine.filter((pt) => holds(v, pt)).length
      if (k === mine.length && (k > bestK || (k === bestK && k > 0 && areaOf(v) < areaOf(best)))) { best = v; bestK = k }
    }
    if (best) u.parent = best.code
  }
  return units
}

/** ADM3 features named like a city ("<name> City" or "City of <name>"), by folded name: a bare town name is never a city. */
const cityMap = (adm3) => {
  const city = new Map()
  for (const f of adm3.features) {
    const n = String(f.properties.shapeName ?? '').trim()
    if (!/ city$/i.test(n) && !/^city of /i.test(n)) continue
    city.set(plain(n), [...(city.get(plain(n)) ?? []), f])
  }
  return city
}

/** PSGC cities (psgc_lgus.csv) that are not a unit of their own, outside the NCR and the barangay clusters: each must sit inside the outline of its PSGC province, or a point
 *  in it is read against the wrong pack. `outside`: an ADM3 feature of that name exists but fewer than half of its outline points are in the province outline (City of
 *  Cotabato: PSGC files it under Maguindanao del Norte, the shape lies in the Cotabato outline). `unmatched`: no ADM3 feature carries the name (spelling differs) or its shape touches no outline (a coast), so it could
 *  not be checked; a person looks at those. */
export function cityGaps(adm3, units, lgus) {
  const city = cityMap(adm3), byCode = new Map(units.map((u) => [u.code, u])), outside = [], unmatched = []
  for (const l of lgus) {
    if (l.kind !== 'city' || /^138/.test(l.province_code) || byCode.has(l.psgc_code) || /cluster/i.test(l.name)) continue
    const home = byCode.get(l.province_code), label = `${l.psgc_code} ${l.name}`
    // per ADM3 feature: 'in' (centre, vertex mean or half of its points in the province outline), 'out' (not, and another unit holds its centre or mean), '?' (a coast: no unit holds it)
    const seen = (city.get(plain(l.name)) ?? []).map((f) => {
      const g = f.geometry, r = (g.type === 'Polygon' ? g.coordinates : g.coordinates[0])[0].slice(0, -1), b = boxOf(f)
      const pts = [[(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], [r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length]]
      if (home && (pts.some((pt) => holds(home, pt)) || r.filter((pt) => holds(home, pt)).length * 2 >= r.length)) return 'in'
      return units.some((u) => u !== home && pts.some((pt) => holds(u, pt))) ? 'out' : '?'
    })
    if (!seen.length || (!seen.includes('in') && !seen.includes('out'))) unmatched.push(label)
    else if (!seen.includes('in')) outside.push(label) // a shared name (two San Fernando) is fine when one of them lies in this province
  }
  return { outside, unmatched }
}

/** Fill units that ADM2 gave no shape: HUC/ICC by the unique ADM3 feature "<name> City"; a province split out of an ADM2 shape by its municipalities. */
function fromAdm3(adm3, adm2, units, lgus, add, out) {
  const city = cityMap(adm3)
  for (const u of units) {
    if (out.has(u.code) || !/^city of /i.test(u.name) || /^138/.test(u.code)) continue // NCR cities stay inside the Manila union (unitAt would otherwise skip the NCR hazard pack)
    const hit = city.get(plain(u.name))
    if (hit?.length === 1) add(u, hit[0])
  }
  // province split: the old ADM2 shape's box holds the municipalities; match by folded name, only when unique inside the box
  for (const u of units) {
    if (out.has(u.code)) continue
    const mine = lgus.filter((l) => l.province_code === u.code && l.kind === 'municipality')
    if (!mine.length) continue
    const parent = adm2.features.find((f) => plain(u.name).startsWith(plain(f.properties.shapeName ?? '') + ' '))
    if (!parent) continue
    const box = boxOf(parent)
    for (const l of mine) {
      const hit = adm3.features.filter((f) => plain(f.properties.shapeName ?? '') === plain(l.name) && inBox(f, box))
      if (hit.length === 1) add(u, hit[0])
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d)
  const from = arg('--from'), from3 = arg('--from3'), out = arg('--out', 'public/geo/units.json'), tol = Number(arg('--tol', '0.004'))
  if (!from) { console.error('usage: node scripts/local-data/units.mjs --from <PHL_ADM2.geojson> [--from3 <PHL_ADM3.geojson>] [--out file] [--tol 0.004] [--strict]'); process.exit(2) }
  const raw = readFileSync(from)
  const rows = parseCsv(readFileSync('supabase/seed/local-data/psgc_provinces.csv', 'utf8'))
  const units = rows.map((r) => ({ code: r.psgc_code, name: r.name }))
  const lgus = parseCsv(readFileSync('supabase/seed/local-data/psgc_lgus.csv', 'utf8'))
  const raw3 = from3 ? readFileSync(from3) : null
  const hash = createHash('sha256').update(raw)
  if (raw3) hash.update(raw3)
  const r = buildUnits(JSON.parse(raw.toString('utf8')), units, hash.digest('hex'), tol, raw3 ? JSON.parse(raw3.toString('utf8')) : null, lgus)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(r.file))
  console.log(`${r.file.units.length} units, ${(JSON.stringify(r.file).length / 1024).toFixed(0)} KB, sha256 ${r.file.sha256.slice(0, 12)}`)
  r.noUnit = r.noUnit.filter((n) => !units.some((u) => plain(u.name).startsWith(plain(n) + ' '))) // an ADM2 shape split into pack units (Maguindanao) is expected
  if (r.noUnit.length) console.warn(`shapes with no pack unit (${r.noUnit.length}): ${r.noUnit.join(', ')}`)
  const ncr = new Set(units.filter((u) => /^138/.test(u.code)).map((u) => u.code))
  // BARMM SGA clusters are groups of barangays: no boundary dataset outlines them, so they stay listed but do not fail --strict (a point there falls in the Cotabato province outline)
  const gaps = units.filter((u) => r.noShape.includes(u.name) && !ncr.has(u.code) && !/cluster/i.test(u.name))
  if (gaps.length) console.warn(`PSGC units with no outline outside the NCR union (${gaps.length}): ${gaps.map((u) => `${u.code} ${u.name}`).join(', ')}`)
  // City of Cotabato: PSGC files it under Maguindanao del Norte but its shape lies in the Cotabato outline; no pack exists for either yet (docs/local-data/HAZARDS.md)
  const ACCEPTED_OUTSIDE = new Set(['1908703000'])
  const outside = r.cityGaps.outside.filter((c) => !ACCEPTED_OUTSIDE.has(c.split(' ')[0]))
  if (r.cityGaps.outside.length) console.warn(`PSGC cities whose outline lies outside their PSGC province outline (${r.cityGaps.outside.length}, accepted: ${[...ACCEPTED_OUTSIDE].join(' ')}): ${r.cityGaps.outside.join(', ')}`)
  if (r.cityGaps.unmatched.length) console.warn(`PSGC cities with no ADM3 feature of that name, not checked (${r.cityGaps.unmatched.length}): ${r.cityGaps.unmatched.join(', ')}`)
  if (r.noShape.length) console.warn(`pack units with no shape (${r.noShape.length}): ${r.noShape.join(', ')}`)
  if (a.includes('--strict') && (r.noUnit.length || gaps.length || outside.length)) process.exit(1)
}
