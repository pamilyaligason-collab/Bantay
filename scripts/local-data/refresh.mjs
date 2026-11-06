// Local safety data job. Design: docs/local-data/APP-INTEGRATION.md ("Refresh job"). Run weekly by .github/workflows/local-data-refresh.yml or by hand:
//   node scripts/local-data/refresh.mjs validate                 offline: check every seed CSV (exit 1 on problems)
//   node scripts/local-data/refresh.mjs import [--apply]          upsert coverage + seed rows into Supabase (dry run without --apply)
//   node scripts/local-data/refresh.mjs packs [--out dir] [--upload]   build one pack per unit from published rows; --upload writes changed packs + index.json
//   node scripts/local-data/refresh.mjs basemap-index [--index file]   dry run: print index.json with the basemap entries added (reads the live index.json or --index, writes nothing)
//   node scripts/local-data/refresh.mjs stale [--days 180]        list rows not checked in N days (exit 0; the workflow posts the list)
//   node scripts/local-data/refresh.mjs check-sources             GET every distinct source_url once, report the ones that fail (no writes)
// Network commands need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role: never ship it to the app). Province codes come from
// supabase/seed/local-data/psgc_provinces.csv (PSA PSGC masterlist; see RESEARCH.md). Without it, import and packs stop with a clear message.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { basemapEntry, buildPack, dialable, hazardsEntry, nextVersion, parseCsv, reachableManifest, splitPhones, staleRows, toPlace, validateRow, withBasemaps, worldEntry } from './lib.mjs'

const SEED = 'supabase/seed/local-data'
const NON_PLACE = new Set(['psgc_provinces.csv', 'psgc_lgus.csv', 'coverage.csv'])
const BUCKET = 'region-packs'
const args = process.argv.slice(2)
const cmd = args[0]
const flag = (f) => args.includes(f)
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d)
const today = new Date().toISOString().slice(0, 10)

const splitPhonesOf = (r) => splitPhones(r.phones)
const readCsv = (f) => parseCsv(readFileSync(join(SEED, f), 'utf8'))
const seedRows = () => readdirSync(SEED).filter((f) => f.endsWith('.csv') && !NON_PLACE.has(f)).flatMap((f) => readCsv(f).map((r) => ({ ...r, _file: f })))

function psgc() {
  if (!existsSync(join(SEED, 'psgc_provinces.csv'))) throw new Error(`${SEED}/psgc_provinces.csv is missing: load the PSA PSGC masterlist first (RESEARCH.md, PSGC)`)
  const units = readCsv('psgc_provinces.csv')
  const lgus = existsSync(join(SEED, 'psgc_lgus.csv')) ? readCsv('psgc_lgus.csv') : []
  return { units, codes: Object.fromEntries(units.map((u) => [u.name, u.psgc_code])), lgus: Object.fromEntries(lgus.map((l) => [`${l.province_code}|${l.name}`, l.psgc_code])) }
}

async function db() {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
  if (!url || !key) throw new Error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, key, { auth: { persistSession: false } })
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data }
/** Every row of a select: PostgREST caps one response at 1000 rows, so page through with range(). make(): a fresh query per page. */
async function all(make) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const page = must(await make().range(from, from + 999))
    out.push(...page)
    if (page.length < 1000) return out
  }
}

async function validate() {
  const rows = seedRows()
  const ids = new Set()
  const bad = rows.flatMap((r) => {
    const b = validateRow(r).map((m) => `${r._file}: ${m}`)
    if (ids.has(r.id)) b.push(`${r._file}: ${r.id}: duplicate id`)
    ids.add(r.id)
    return b
  })
  const by = (k) => rows.reduce((a, r) => ({ ...a, [r[k]]: (a[r[k]] ?? 0) + 1 }), {})
  console.log(`${rows.length} rows`, by('province'), by('status'))
  for (const b of bad) console.error(b)
  // shortcut: a warning, not an error, until a reviewer adds a dialable form per row (APP-INTEGRATION.md 3.5); then make it an error
  const undialable = rows.filter((r) => splitPhonesOf(r).some((p) => !dialable(p)))
  console.log(`${undialable.length} rows have a number that cannot be tapped to dial as printed: ${undialable.map((r) => r.id).join(', ')}`)
  if (bad.length) process.exit(1)
}

async function importSeed() {
  const { units, codes, lgus } = psgc()
  const places = seedRows().map((r) => toPlace(r, codes, lgus))
  const coverage = existsSync(join(SEED, 'coverage.csv')) ? readCsv('coverage.csv') : units.map((u, i) => ({ psgc_code: u.psgc_code, name: u.name, kind: u.kind, priority: i + 1 }))
  console.log(`${coverage.length} coverage rows, ${places.length} places${flag('--apply') ? '' : ' (dry run, add --apply to write)'}`)
  if (!flag('--apply')) return
  const sb = await db()
  const cov = coverage.map((c) => ({
    psgc_code: c.psgc_code, name: c.name, kind: c.kind, region_code: c.region_code || null, priority: Number(c.priority),
    status: c.status || 'not_started', verified_at: c.verified_at || null, neighbours: c.neighbours ? c.neighbours.split(/\s;\s/) : [], notes: c.notes || null
  }))
  must(await sb.from('coverage').upsert(cov))
  must(await sb.from('safety_places').upsert(places))
  // the CSVs are the source of truth (migration 0045 header): rows that left the CSVs leave the table
  const keep = new Set(places.map((p) => p.id))
  const gone = (await all(() => sb.from('safety_places').select('id').order('id'))).map((r) => r.id).filter((id) => !keep.has(id))
  for (let i = 0; i < gone.length; i += 100) must(await sb.from('safety_places').delete().in('id', gone.slice(i, i + 100)))
  console.log(`removed ${gone.length} rows no longer in the CSVs${gone.length ? ': ' + gone.join(', ') : ''}`)
}

async function packs() {
  const sb = flag('--upload') || !flag('--from-csv') ? await db() : null
  let units, places
  if (flag('--from-csv')) {
    const p = psgc()
    const nb = existsSync(join(SEED, 'coverage.csv')) ? Object.fromEntries(readCsv('coverage.csv').map((c) => [c.psgc_code, c.neighbours ? c.neighbours.split(/\s;\s/) : []])) : {}
    units = p.units.map((u) => ({ ...u, neighbours: nb[u.psgc_code] ?? [] })) // same as the database path, so bundled and server packs match
    places = seedRows().map((r) => toPlace(r, p.codes, p.lgus))
  } else {
    units = await all(() => sb.from('coverage').select('psgc_code,name,neighbours').order('psgc_code'))
    places = await all(() => sb.from('safety_places').select('*').not('last_verified_at', 'is', null).order('id'))
  }
  const latest = sb ? await all(() => sb.from('region_packs').select('province_code,version,checksum').eq('layer', 'places').order('version', { ascending: false }).order('province_code')) : []
  // hazard files are built by hazards.sh and listed in region_packs; the index keeps pointing at them whenever places change
  const hazardRows = sb ? await all(() => sb.from('region_packs').select('province_code,version,checksum,size_bytes,storage_path').eq('layer', 'hazards').order('province_code').order('version')) : []
  const hazardManifest = JSON.parse(readFileSync(join(SEED, 'hazards.json'), 'utf8'))
  const publicBase = `${process.env.SUPABASE_URL ?? 'https://wuakimpssycbtnmoexuc.supabase.co'}/storage/v1/object/public/${BUCKET}/`
  const basemaps = await reachableManifest(basemapManifest(), publicBase)
  const index = []
  for (const unit of units) {
    const pack = buildPack(unit, places)
    if (!pack.rowCount) continue
    const prev = latest.find((l) => l.province_code === unit.psgc_code)
    const { version, changed } = nextVersion(prev, pack.checksum)
    const path = `${unit.psgc_code}/${pack.checksum}.json`
    if (opt('--out')) { mkdirSync(join(opt('--out'), unit.psgc_code), { recursive: true }); writeFileSync(join(opt('--out'), path), pack.body) }
    if (changed && flag('--upload')) {
      must(await sb.storage.from(BUCKET).upload(path, pack.body, { contentType: 'application/json', cacheControl: '31536000', upsert: true }))
      must(await sb.from('region_packs').insert({ province_code: unit.psgc_code, layer: 'places', version, checksum: pack.checksum, size_bytes: pack.size, row_count: pack.rowCount, storage_path: path }))
    }
    console.log(`${unit.psgc_code} ${unit.name}: v${version} ${changed ? 'NEW' : 'same'} ${pack.rowCount} rows ${pack.size} B`)
    index.push({ code: unit.psgc_code, name: unit.name, version, checksum: pack.checksum, size: pack.size, rows: pack.rowCount, path, neighbours: unit.neighbours ?? [], hazards: hazardsEntry(unit.psgc_code, hazardManifest, hazardRows), basemap: basemapEntry(unit.psgc_code, basemaps) })
  }
  const body = JSON.stringify({ format: 1, built: today, packs: index, world: worldEntry(basemaps) })
  if (opt('--out')) writeFileSync(join(opt('--out'), 'index.json'), body)
  if (flag('--upload')) must(await sb.storage.from(BUCKET).upload('index.json', body, { contentType: 'application/json', cacheControl: '300', upsert: true }))
}

const basemapManifest = () => JSON.parse(readFileSync(join(import.meta.dirname, 'basemaps.json'), 'utf8'))

// Read-only: no storage upload and no region_packs row. Basemaps are uploaded by hand and listed only in index.json (region_packs.layer allows places and hazards only, 0045).
async function basemapIndex() {
  const base = process.env.SUPABASE_URL ?? 'https://wuakimpssycbtnmoexuc.supabase.co'
  const live = opt('--index') ? readFileSync(opt('--index'), 'utf8') : await fetch(`${base}/storage/v1/object/public/${BUCKET}/index.json`).then((res) => { if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`); return res.text() })
  console.log(JSON.stringify(withBasemaps(JSON.parse(live), basemapManifest())))
}

async function stale() {
  const days = Number(opt('--days', 180))
  const places = flag('--from-csv') ? seedRows() : await (async (sb) => all(() => sb.from('safety_places').select('id,province_code,name,last_verified_at').order('id')))(await db())
  const old = staleRows(places, days, today)
  console.log(`${old.length} of ${places.length} rows not checked in ${days} days`)
  for (const p of old) console.log(`- ${p.id} (${p.province_code ?? p.province}) ${p.name}: last checked ${p.last_verified_at || 'never'}`)
}

async function checkSources() {
  const places = flag('--from-csv') ? seedRows() : await (async (sb) => all(() => sb.from('safety_places').select('id,source_url').order('id')))(await db())
  const urls = [...new Set(places.map((p) => p.source_url).filter(Boolean))]
  let failed = 0
  for (const u of urls) {
    // shortcut: reports reachability only, not whether the number on the page changed; add per-source parsers when a source has a stable format
    const res = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'FamilyBantay-refresh/1 (+https://github.com/pamilyaligason-collab)' }, signal: AbortSignal.timeout(20000) }).catch((e) => ({ status: String(e.name) }))
    if (!(res.status >= 200 && res.status < 400)) { failed++; console.log(`FAIL ${res.status} ${u} (rows: ${places.filter((p) => p.source_url === u).map((p) => p.id).join(', ')})`) }
    await new Promise((r) => setTimeout(r, 1500)) // polite: one request every 1.5 s
  }
  console.log(`${urls.length - failed} of ${urls.length} sources reachable`)
}

const run = { validate, import: importSeed, packs, 'basemap-index': basemapIndex, stale, 'check-sources': checkSources }[cmd]
if (!run) { console.error('usage: refresh.mjs validate | import [--apply] | packs [--out dir] [--upload] [--from-csv] | basemap-index [--index file] | stale [--days N] | check-sources'); process.exit(2) }
run().catch((e) => { console.error(e.message); process.exit(1) })
