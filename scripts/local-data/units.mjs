// Build public/geo/units.json: province and city outlines the phone uses to work out which pack unit it is in (APP-INTEGRATION.md section 3.2).
// Source: geoBoundaries PHL ADM2 (CC BY 3.0 IGO). The owner downloads the simplified GeoJSON once (the file the API at
// https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM2/ names as simplifiedGeometryGeoJSON); this script never touches the network.
//   node scripts/local-data/units.mjs --from <PHL_ADM2.geojson> [--out public/geo/units.json] [--tol 0.004] [--strict]
// The output records the sha256 of the file it was built from. Shapes are matched to the PSGC pack units by name (see `plain`); every shape
// or unit that did not match is listed, and --strict makes any such line fail the run. Review the list before shipping the file.
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

/** geojson: FeatureCollection with shapeName; units: [{code, name}] pack units. Returns the units file and the names that did not match. */
export function buildUnits(geojson, units, sha256, tol = 0.004) {
  // exact name first; the folded name only when it is unique ("City of Cebu" and "Cebu" fold together, so they are matched exactly or not at all)
  const exact = new Map(units.map((u) => [u.name.trim().toLowerCase(), u]))
  const folds = new Map()
  for (const u of units) folds.set(plain(u.name), [...(folds.get(plain(u.name)) ?? []), u])
  const byName = { get: (n) => exact.get(String(n).trim().toLowerCase()) ?? (folds.get(plain(n))?.length === 1 ? folds.get(plain(n))[0] : undefined) }
  const out = new Map(), noUnit = []
  for (const f of geojson.features) {
    const u = byName.get(f.properties.shapeName ?? '')
    if (!u) { noUnit.push(f.properties.shapeName ?? '(no name)'); continue }
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    const cur = out.get(u.code) ?? { code: u.code, name: u.name, bbox: [180, 90, -180, -90], polys: [] }
    for (const poly of polys) {
      const rings = poly.map((r) => simplify(r, tol))
      for (const [x, y] of rings[0]) { cur.bbox[0] = Math.min(cur.bbox[0], x); cur.bbox[1] = Math.min(cur.bbox[1], y); cur.bbox[2] = Math.max(cur.bbox[2], x); cur.bbox[3] = Math.max(cur.bbox[3], y) }
      cur.polys.push(rings)
    }
    out.set(u.code, cur)
  }
  const noShape = units.filter((u) => !out.has(u.code)).map((u) => u.name)
  return { file: { format: 1, source: 'geoBoundaries PHL ADM2 (CC BY 3.0 IGO)', sha256, units: [...out.values()] }, noUnit, noShape }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d)
  const from = arg('--from'), out = arg('--out', 'public/geo/units.json'), tol = Number(arg('--tol', '0.004'))
  if (!from) { console.error('usage: node scripts/local-data/units.mjs --from <PHL_ADM2.geojson> [--out file] [--tol 0.004] [--strict]'); process.exit(2) }
  const raw = readFileSync(from)
  const rows = parseCsv(readFileSync('supabase/seed/local-data/psgc_provinces.csv', 'utf8'))
  const units = rows.map((r) => ({ code: r.psgc_code, name: r.name }))
  const r = buildUnits(JSON.parse(raw.toString('utf8')), units, createHash('sha256').update(raw).digest('hex'), tol)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(r.file))
  console.log(`${r.file.units.length} units, ${(JSON.stringify(r.file).length / 1024).toFixed(0)} KB, sha256 ${r.file.sha256.slice(0, 12)}`)
  if (r.noUnit.length) console.warn(`shapes with no pack unit (${r.noUnit.length}): ${r.noUnit.join(', ')}`)
  if (r.noShape.length) console.warn(`pack units with no shape (${r.noShape.length}): ${r.noShape.join(', ')}`)
  if (a.includes('--strict') && (r.noUnit.length || r.noShape.length)) process.exit(1)
}
