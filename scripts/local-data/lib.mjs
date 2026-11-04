// Pure helpers for the local safety data job (scripts/local-data/refresh.mjs). No network, no file system: tested in src/features/safety/localData.test.ts.
// Seed CSVs live in supabase/seed/local-data/, one source per row; the table is public.safety_places (supabase/migrations/0045_local_safety.sql).
import { createHash } from 'node:crypto'

export const KINDS = ['evac', 'hospital', 'rhu', 'bhs', 'clinic', 'police', 'fire', 'coastguard', 'redcross', 'drrmo', 'hotline', 'other']
export const COLUMNS = ['id', 'province', 'lgu', 'kind', 'name', 'address', 'phones', 'lat', 'lon', 'capacity', 'status', 'source', 'source_url', 'licence', 'source_date', 'last_verified_at', 'confidence', 'notes']
export const PACK_FORMAT = 1

/** RFC 4180 CSV to an array of objects keyed by the header row. Quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  const [head = [], ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const num = (v) => (v === '' || v == null ? null : Number(v))
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Problems with one seed row, as plain sentences (empty = valid). Mirrors the checks on public.safety_places. */
export function validateRow(r) {
  const bad = []
  const id = r.id || '(no id)'
  if (!/^[a-z0-9-]{3,80}$/.test(r.id ?? '')) bad.push(`${id}: id must be 3-80 of a-z 0-9 -`)
  if (!KINDS.includes(r.kind)) bad.push(`${id}: kind "${r.kind}" is not one of ${KINDS.join(', ')}`)
  if (!r.name || r.name.length < 2 || r.name.length > 200) bad.push(`${id}: name must be 2-200 characters`)
  if (!r.province) bad.push(`${id}: province is empty`)
  if (!['confirmed', 'not_confirmed'].includes(r.status)) bad.push(`${id}: status must be confirmed or not_confirmed`)
  if (!['high', 'medium', 'low'].includes(r.confidence)) bad.push(`${id}: confidence must be high, medium or low`)
  if (!r.source || r.source.length < 2) bad.push(`${id}: source is empty (one source per row)`)
  if (r.source_url && !/^https?:\/\//.test(r.source_url)) bad.push(`${id}: source_url must start with http(s)://`)
  if (!r.licence) bad.push(`${id}: licence is empty`)
  for (const f of ['source_date', 'last_verified_at']) if (r[f] && !DATE.test(r[f])) bad.push(`${id}: ${f} must be YYYY-MM-DD`)
  const lat = num(r.lat), lon = num(r.lon)
  if ((lat === null) !== (lon === null)) bad.push(`${id}: lat and lon go together`)
  if (lat !== null && !(lat >= 4 && lat <= 22)) bad.push(`${id}: lat ${r.lat} is outside the Philippines`)
  if (lon !== null && !(lon >= 116 && lon <= 127.5)) bad.push(`${id}: lon ${r.lon} is outside the Philippines`)
  const cap = num(r.capacity)
  if (cap !== null && !(Number.isInteger(cap) && cap > 0)) bad.push(`${id}: capacity must be a whole number above 0`)
  if (r.status === 'confirmed' && !r.source_url) bad.push(`${id}: a confirmed row needs the source_url it was read on`)
  if (r.kind !== 'evac' && !['hospital', 'rhu', 'bhs', 'clinic'].includes(r.kind) && !splitPhones(r.phones).length && !r.address) bad.push(`${id}: a ${r.kind} row with no phone and no address is not useful`)
  return bad
}

/** True when a printed number can be dialled from a PH mobile as is: +63/0 plus 9-10 digits, or a 3-5 digit short code (911, 117, 143).
 *  Ranges ("to 51"), "/ 4869" tails and 7-digit landlines without the area code are not. They stay as printed text (shown, copyable). */
export const dialable = (p) => /^(\+63|0)\d{9,10}$|^\d{3,5}$/.test(p.replace(/[\s().-]/g, ''))

export const splitPhones = (p) => (p ? p.split(/\s;\s/).map((x) => x.trim()).filter(Boolean) : [])

/** Seed row to a public.safety_places row. codes maps a province name (as in the CSV) to its 10-digit PSGC code; lgus maps
 *  "<province code>|<LGU name>" to the LGU code (names repeat across provinces: Carmen, San Isidro, Pilar). */
export function toPlace(r, codes, lgus = {}, verifiedBy = 'seed-review') {
  const province_code = codes[r.province]
  if (!province_code) throw new Error(`${r.id}: no PSGC code for province "${r.province}"`)
  const lguCode = r.lgu ? lgus[`${province_code}|${r.lgu}`] : null
  if (r.lgu && Object.keys(lgus).length && !lguCode) throw new Error(`${r.id}: no PSGC code for "${r.lgu}" in ${r.province}`)
  return {
    id: r.id, province_code, psgc_code: lguCode ?? null, kind: r.kind, name: r.name, address: r.address || null,
    phones: splitPhones(r.phones), lat: num(r.lat), lon: num(r.lon), capacity: num(r.capacity), status: r.status,
    source: r.source, source_url: r.source_url || null, licence: r.licence, source_date: r.source_date || null,
    last_verified_at: r.last_verified_at || null, verified_by: r.last_verified_at ? verifiedBy : null,
    confidence: r.confidence, notes: r.notes || null
  }
}

/** The pack file for one unit: canonical JSON (rows sorted by id, fixed key order), so the same data always gives the same checksum.
 *  Version and build time are NOT in the file (they live in region_packs), so an unchanged province never gets a new version. */
export function buildPack(unit, places) {
  const rows = places
    .filter((p) => p.province_code === unit.psgc_code && p.last_verified_at)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => ({
      id: p.id, psgc: p.psgc_code, kind: p.kind, name: p.name, address: p.address, phones: p.phones, lat: p.lat, lon: p.lon,
      capacity: p.capacity, status: p.status, source: p.source, url: p.source_url, licence: p.licence, dated: p.source_date, verified: p.last_verified_at, confidence: p.confidence
    }))
  const body = JSON.stringify({ format: PACK_FORMAT, province: unit.psgc_code, name: unit.name, neighbours: [...(unit.neighbours ?? [])].sort(), places: rows })
  const bytes = Buffer.from(body, 'utf8')
  return { body, checksum: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, rowCount: rows.length }
}

/** Rows whose last check is older than days before today (YYYY-MM-DD), plus rows never checked. */
export function staleRows(places, days, today) {
  const cut = new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10)
  return places.filter((p) => !p.last_verified_at || p.last_verified_at < cut)
}

/** The next version for a unit: 1 for a new unit, the same version (no build) when the checksum matches the latest, else latest + 1. */
export function nextVersion(latest, checksum) {
  if (!latest) return { version: 1, changed: true }
  return latest.checksum === checksum ? { version: latest.version, changed: false } : { version: latest.version + 1, changed: true }
}

/** index.json hazards entry for one unit. manifest (seed hazards.json): per unit its layer bounds, or { pack } when another unit's file covers it (GenSan is
 *  inside NOAH's South Cotabato file). rows: region_packs rows of layer hazards. Undefined when the unit has no hazard pack yet. */
export function hazardsEntry(code, manifest, rows) {
  const m = manifest[code]
  if (!m) return undefined
  const pack = m.pack ?? code
  const latest = rows.filter((r) => r.province_code === pack).sort((a, b) => b.version - a.version)[0]
  if (!latest) return undefined
  return { pack, version: latest.version, checksum: latest.checksum, size: latest.size_bytes, path: latest.storage_path, bounds: manifest[pack].bounds }
}
