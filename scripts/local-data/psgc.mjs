// Build the PSGC tables the refresh job needs from the pinned snapshot in supabase/seed/local-data/psgc-snapshot/ (psgc.cloud, a community
// mirror of PSA PSGC releases; provenance and checks in docs/local-data/RESEARCH.md row 8). Offline, no network:
//   node scripts/local-data/psgc.mjs     writes psgc_provinces.csv (pack units), psgc_lgus.csv (cities/municipalities + home barangays), coverage.csv
// Pack units: the 82 provinces, plus every city/municipality whose code sits under no province (HUCs, Isabela City, Pateros, BARMM SGA clusters).
// Manila's 14 sub-municipal districts are left out (they are part of the City of Manila). Coverage order follows the table in COVERAGE.md.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCsv } from './lib.mjs'

const SEED = 'supabase/seed/local-data'
const SNAP = join(SEED, 'psgc-snapshot')
const HUCS = ['Angeles', 'Olongapo', 'Lucena', 'Puerto Princesa', 'Iloilo', 'Bacolod', 'Cebu', 'Lapu-Lapu', 'Mandaue', 'Tacloban', 'Zamboanga', 'Iligan', 'Cagayan De Oro',
  'Davao', 'General Santos', 'Manila', 'Mandaluyong', 'Marikina', 'Pasig', 'Quezon City', 'San Juan', 'Caloocan', 'Malabon', 'Navotas', 'Valenzuela', 'Las Piñas', 'Makati',
  'Muntinlupa', 'Parañaque', 'Pasay City', 'Taguig', 'Baguio', 'Butuan']
const NEIGHBOURS = { // home units only for now: pack codes the app prefetches next (APP-INTEGRATION.md 3.3)
  Bohol: ['Cebu', 'City of Cebu', 'Siquijor', 'Negros Oriental', 'Southern Leyte', 'Leyte', 'Camiguin'],
  'South Cotabato': ['City of General Santos', 'Sarangani', 'Sultan Kudarat', 'Cotabato', 'Davao del Sur'],
  'City of General Santos': ['South Cotabato', 'Sarangani']
}

// The mirror double-encodes some names (UTF-8 read as Latin-1: "PiÃ±as"); undo that, leave clean names alone.
export const fixName = (s) => (/Ã./.test(s) ? Buffer.from(s, 'latin1').toString('utf8') : s).trim()
const read = (f) => JSON.parse(readFileSync(join(SNAP, f), 'utf8'))
const csv = (rows) => rows.map((r) => r.map((v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : (v ?? ''))).join(',')).join('\n') + '\n'
const plain = (s) => s.trim().toLowerCase().replace(/^city of /, '').replace(/ city$/, '')

function checkSnapshot() {
  for (const line of readFileSync(join(SNAP, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [sum, file] = line.split(/\s+\*?/)
    const got = createHash('sha256').update(readFileSync(join(SNAP, file))).digest('hex')
    if (got !== sum) throw new Error(`${file}: checksum ${got} does not match SHA256SUMS (snapshot changed; re-pin it on purpose)`)
  }
}

export function build() {
  checkSnapshot()
  const regions = Object.fromEntries(read('regions.json').map((r) => [r.code.slice(0, 2), r]))
  const provinces = read('provinces.json').map((p) => ({ ...p, name: fixName(p.name) }))
  const cms = read('cities-municipalities.json').map((c) => ({ ...c, name: fixName(c.name) }))
  const prefix = new Map(provinces.map((p) => [p.code.slice(0, 5), p]))
  const manila = cms.find((c) => c.name === 'City of Manila')
  const units = provinces.map((p) => ({ code: p.code, name: p.name, kind: 'province' }))
  for (const c of cms) {
    if (prefix.has(c.code.slice(0, 5))) continue
    if (manila && c !== manila && c.code.slice(0, 5) === manila.code.slice(0, 5)) continue // Manila districts
    const huc = HUCS.some((h) => plain(c.name) === plain(h))
    units.push({ code: c.code, name: c.name, kind: huc ? 'huc' : c.name === 'City of Isabela' ? 'icc' : 'municipality', note: /Cluster/.test(c.name) ? 'BARMM Special Geographic Area cluster' : '' })
  }
  const unitOf = (code) => prefix.get(code.slice(0, 5))?.code ?? code
  const lgus = cms.filter((c) => !(manila && c !== manila && c.code.slice(0, 5) === manila.code.slice(0, 5)))
    .map((c) => [c.code, c.name, c.type === 'Mun' ? 'municipality' : 'city', unitOf(c.code), ''])
  for (const f of ['barangays-0701242000.json', 'barangays-1230800000.json'])
    for (const b of read(f).filter((x) => /^(Dampas|Conel)$/.test(x.name.trim()))) lgus.push([b.code, fixName(b.name), 'barangay', unitOf(b.code), 'home zone'])

  // coverage priority: the order of the table in COVERAGE.md, matched by plain name; units the plan does not list go last
  // "Quezon City" is a unit name as is, "Cebu City" is "City of Cebu"; never strip "City" alone (Quezon City vs Quezon province)
  const md = readFileSync('docs/local-data/COVERAGE.md', 'utf8').split('\n').filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|')[2].trim().toLowerCase())
  const rank = (u) => { const n = u.name.toLowerCase(); const i = md.findIndex((m) => m === n || `${m} city` === n || `city of ${m.replace(/ city$/, '')}` === n); return i < 0 ? 1000 : i }
  units.sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code))
  const byName = Object.fromEntries(units.map((u) => [u.name, u.code]))
  // a unit is in progress once any seed CSV has rows for it ("done" is set by hand after a full review)
  const seeded = new Set(readdirSync(SEED).filter((f) => f.endsWith('.csv') && !/^(psgc_|coverage)/.test(f))
    .flatMap((f) => parseCsv(readFileSync(join(SEED, f), 'utf8')).map((r) => r.province)))
  const region = (code) => regions[code.slice(0, 2)]
  return {
    units, lgus,
    provincesCsv: csv([['psgc_code', 'name', 'kind', 'region_code', 'region_name', 'population_2020', 'notes'],
      ...units.map((u) => [u.code, u.name, u.kind, region(u.code)?.code ?? '', region(u.code)?.name ?? '', '', u.note ?? ''])]),
    lgusCsv: csv([['psgc_code', 'name', 'kind', 'province_code', 'notes'], ...lgus]),
    coverageCsv: csv([['psgc_code', 'name', 'kind', 'region_code', 'priority', 'status', 'verified_at', 'neighbours', 'notes'],
      ...units.map((u, i) => [u.code, u.name, u.kind, region(u.code)?.code ?? '', i + 1, seeded.has(u.name) ? 'in_progress' : 'not_started', '',
        (NEIGHBOURS[u.name] ?? []).map((n) => byName[n] ?? (() => { throw new Error(`neighbour ${n} of ${u.name} is not a unit`) })()).join(' ; '), u.note ?? ''])])
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const b = build()
  writeFileSync(join(SEED, 'psgc_provinces.csv'), b.provincesCsv)
  writeFileSync(join(SEED, 'psgc_lgus.csv'), b.lgusCsv)
  writeFileSync(join(SEED, 'coverage.csv'), b.coverageCsv)
  const k = (x) => b.units.filter((u) => u.kind === x).length
  console.log(`${b.units.length} units (province ${k('province')}, huc ${k('huc')}, icc ${k('icc')}, municipality ${k('municipality')}), ${b.lgus.length} LGU rows`)
}
