// Build offline barangay point packs from OpenStreetMap (Overpass). Node 24 built-ins only.
// Usage: node scripts/places/build-barangays.mjs [--only <region-name-substring>] [--cache <dir>]
// One Overpass request at a time, polite UA, backoff on 429/5xx. Raw responses are cached (default: OS temp dir) so a rerun is cheap.
// Data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)
const CACHE = arg('--cache') ?? join(tmpdir(), 'bantay-barangay-cache')
const ONLY = arg('--only')?.toLowerCase()
// a --only trial writes under the cache dir, never over the shipped packs
const OUT = ONLY ? join(CACHE, 'out') : join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'geo', 'barangays')
const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const UA = 'FamilyBantay-build/1.0 (+https://github.com/pamilyaligason-collab/Bantay)'
const SOURCE = 'Data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(CACHE, { recursive: true })

async function overpass(key, ql) {
  const file = join(CACHE, key.replace(/[^\w.-]/g, '_') + '.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  for (let attempt = 0; attempt < 8; attempt++) {
    await sleep(3000) // gap before every request
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(ql) })
      if (res.ok) {
        const text = await res.text()
        if (text.startsWith('{')) {
          const j = JSON.parse(text)
          if (!j.remark || !/timed out|out of memory/i.test(j.remark)) { writeFileSync(file, text); return j }
          console.error(`  ${key}: remark ${j.remark}`)
        }
      } else console.error(`  ${key}: HTTP ${res.status}, retry ${attempt + 1}`)
    } catch (e) { console.error(`  ${key}: ${e.message}, retry ${attempt + 1}`) }
    await sleep(Math.min(120_000, 8000 * 2 ** attempt))
  }
  throw new Error('overpass failed: ' + key)
}

const AREA = (id) => `rel(${id});map_to_area->.r;`
const nm = (t) => (t?.name || t?.['name:en'] || '').trim()
const q = (id, filter, out) => `[out:json][timeout:240];${AREA(id)}${filter};out ${out};`

/** Barangays (admin_level=10) and municipalities/cities (6|7) inside one relation. */
async function scan(id, label) {
  const brgy = await overpass(`brgy-${id}`, q(id, 'rel(area.r)["boundary"="administrative"]["admin_level"="10"]', 'center tags'))
  const towns = await overpass(`town-${id}`, q(id, 'rel(area.r)["boundary"="administrative"]["admin_level"~"^(6|7)$"]', 'body bb'))
  return { id, label, brgy: brgy.elements, towns: towns.elements }
}
// OSM has admin_level=10 relations for only ~12% of barangays; most are nodes tagged admin_type:PH=barangay (puroks and sitios carry admin_level=10 too, so that tag is the filter).
// Untagged place=village nodes are kept as a gap filler; neighbourhood nodes are puroks/subdivisions and are left out.
const isBrgy = (t) => !t['admin_type:PH'] || /^(special_)?barangay$/.test(t['admin_type:PH'])
const placeNodes = (id) => overpass('nodes2-' + id, q(id, '(node(area.r)["admin_type:PH"~"^(special_)?barangay$"]["name"];node(area.r)["place"="village"][!"admin_type:PH"]["name"];)', '')).then((j) => j.elements)
const hint = (t) => { const h = (t?.['is_in:city'] || t?.['is_in:municipality'] || t?.['addr:city'] || t?.['addr:municipality'] || '').trim(); return /\bdistrict\b/i.test(h) ? '' : h }

async function main() {
  const ph = await overpass('regions', '[out:json][timeout:120];area["ISO3166-1"="PH"]->.ph;rel(area.ph)["boundary"="administrative"]["admin_level"="3"];out tags;')
  let regions = ph.elements.filter((r) => nm(r.tags))
  if (ONLY) regions = regions.filter((r) => nm(r.tags).toLowerCase().includes(ONLY))
  console.log(`regions: ${regions.length}`)
  const rows = new Map() // `${lat}|${lon}|${name}` -> row (dedupe)
  const coverage = []
  for (const reg of regions) {
    const label = nm(reg.tags)
    let scans
    try { scans = [await scan(reg.id, label)] } catch {
      console.error(`${label}: too big for one request, splitting by province`)
      const prov = await overpass(`prov-${reg.id}`, q(reg.id, 'rel(area.r)["boundary"="administrative"]["admin_level"="4"]', 'tags'))
      scans = []
      for (const p of prov.elements) scans.push(await scan(p.id, nm(p.tags)))
    }
    let nB = 0, nN = 0
    for (const d of scans) {
      // town = admin_level 6 city/municipality only. admin_level 7 relations in PH OSM are city districts ("Sixth District"): each is mapped to the level-6 city that lists it as a member, else to the smallest level-6 box that holds its box.
      const l6 = d.towns.filter((t) => t.tags?.admin_level === '6' && t.bounds && nm(t.tags))
      const inside = (b, o) => b.minlat >= o.minlat - 0.001 && b.maxlat <= o.maxlat + 0.001 && b.minlon >= o.minlon - 0.001 && b.maxlon <= o.maxlon + 0.001
      const area = (b) => (b.maxlat - b.minlat) * (b.maxlon - b.minlon)
      const parentOf = (t) => {
        const listed = d.towns.find((p) => p.tags?.admin_level === '6' && nm(p.tags) && (p.members ?? []).some((m) => m.type === 'relation' && m.ref === t.id))
        if (listed) return nm(listed.tags)
        const box = t.bounds ? l6.filter((p) => inside(t.bounds, p.bounds)).sort((x, y) => area(x.bounds) - area(y.bounds))[0] : undefined
        return box ? nm(box.tags) : ''
      }
      const townOfRel = new Map(d.towns.filter((t) => nm(t.tags)).map((t) => [t.id, t.tags.admin_level === '6' ? nm(t.tags) : parentOf(t) || '']))
      const byMember = new Map()
      for (const t of d.towns) { const tn = townOfRel.get(t.id); if (tn) for (const m of t.members ?? []) if (m.type === 'relation') byMember.set(m.ref, tn) }
      const bbs = d.towns.filter((t) => t.bounds && townOfRel.get(t.id)).map((t) => ({ n: townOfRel.get(t.id), b: t.bounds, a: area(t.bounds) })).sort((x, y) => x.a - y.a)
      const townAt = (lat, lon) => bbs.find((t) => lat >= t.b.minlat && lat <= t.b.maxlat && lon >= t.b.minlon && lon <= t.b.maxlon)?.n ?? ''
      const add = (lat, lon, name, town) => {
        if (!name || /^(purok|sitio)\b/i.test(name) || typeof lat !== 'number' || typeof lon !== 'number') return false
        const la = lat.toFixed(4), lo = lon.toFixed(4)
        rows.set(`${la}|${lo}|${name}`, [Number(la), Number(lo), name, town])
        return true
      }
      const mine = []
      for (const e of d.brgy) if (e.center && isBrgy(e.tags)) { const r = [e.center.lat, e.center.lon, nm(e.tags)]; mine.push(r); if (add(r[0], r[1], r[2], hint(e.tags) || byMember.get(e.id) || townAt(r[0], r[1]))) nB++ }
      // a node is skipped when a relation of the same name lies within 2 km (same barangay)
      for (const e of await placeNodes(d.id)) {
        const name = nm(e.tags)
        if (mine.some((r) => r[2] === name && Math.abs(r[0] - e.lat) < 0.02 && Math.abs(r[1] - e.lon) < 0.02)) continue
        if (add(e.lat, e.lon, name, hint(e.tags) || townAt(e.lat, e.lon))) nN++
      }
    }
    coverage.push({ region: label, barangays: nB, placeNodes: nN, splitByProvince: scans.length > 1 })
    console.log(`${label}: ${nB} barangays, ${nN} place nodes`)
  }
  const districts = [...rows.values()].filter((r) => /\bdistrict\b/i.test(r[3])).length
  console.log(`towns matching /district/: ${districts}`)
  if (districts > 0) { console.error(`FAIL: ${districts} rows have a district as town`); process.exit(1) }
  const tiles = new Map()
  for (const r of rows.values()) {
    const k = `${Math.floor(r[0])}_${Math.floor(r[1])}`
    if (!tiles.has(k)) tiles.set(k, [])
    tiles.get(k).push(r)
  }
  mkdirSync(OUT, { recursive: true })
  if (!ONLY) for (const f of readdirSync(OUT)) rmSync(join(OUT, f)) // a full build replaces everything
  const index = { format: 1, built: new Date().toISOString().slice(0, 10), source: SOURCE, licence: 'ODbL 1.0', total: rows.size, tiles: {} }
  for (const [k, list] of [...tiles].sort()) {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    writeFileSync(join(OUT, k + '.json'), JSON.stringify(list))
    index.tiles[k] = list.length
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index))
  writeFileSync(join(OUT, 'coverage.json'), JSON.stringify(coverage, null, 1))
  const sizes = readdirSync(OUT).filter((f) => /^\d+_\d+\.json$/.test(f)).map((f) => statSync(join(OUT, f)).size)
  console.log(JSON.stringify({ total: rows.size, tiles: sizes.length, bytes: sizes.reduce((a, b) => a + b, 0), largest: Math.max(0, ...sizes) }))
}
main().catch((e) => { console.error(e); process.exit(1) })
