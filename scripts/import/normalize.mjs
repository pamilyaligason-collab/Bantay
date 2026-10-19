// Pure normalisers for extracted lab values. No I/O except the one-time catalog read.
import { readFileSync } from 'node:fs'

/** @typedef {{code:string,name:string,loinc:string|null,unit:string,aliases:string[],conversions:Record<string,number>}} CatalogRow */

/** @returns {CatalogRow[]} mirror of the 0008 test_catalog seed (a test asserts they match) */
export const loadCatalog = () => JSON.parse(readFileSync(new URL('./test-catalog.json', import.meta.url), 'utf8'))

/** Parse the INSERT into test_catalog in 0008_records.sql. Used by the drift test and to regenerate the JSON. */
export function parseCatalogSql(sql) {
  const body = /insert into public\.test_catalog[^;]*?values([\s\S]*?);/i.exec(sql)?.[1] ?? ''
  const re = /\(\s*'([^']*)',\s*'([^']*)',\s*(null|'[^']*'),\s*'([^']*)',\s*'(\{[^']*\})',\s*'(\{[^']*\})'\s*\)/g
  const rows = []
  for (const m of body.matchAll(re)) {
    const aliases = [...m[5].slice(1, -1).matchAll(/"([^"]*)"|([^,]+)/g)].map((a) => a[1] ?? a[2])
    rows.push({ code: m[1], name: m[2], loinc: m[3] === 'null' ? null : m[3].slice(1, -1), unit: m[4], aliases, conversions: JSON.parse(m[6]) })
  }
  return rows
}

const clean = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Differential counts exist as fraction (0.55) and percent (55 %); they stay raw, never coded. */
const DIFFERENTIAL = /neutrophil|lymphocyte|monocyte|eosinophil|basophil|segmenter|band/i

/** @param {string|null|undefined} name @returns {string|null} test_code */
export function matchTest(name, catalog = loadCatalog()) {
  const n = clean(name).replace(/[.:]+$/g, '')
  if (!n || DIFFERENTIAL.test(n)) return null
  for (const c of catalog) if (c.code === n || clean(c.name) === n || c.aliases.includes(n)) return c.code
  return null
}

const UNITS = new Map(
  [
    'mg/dL', 'g/dL', 'g/L', 'mmol/L', 'umol/L', 'U/L', 'IU/L', 'mIU/L', 'uIU/mL', '%', 'L/L',
    'x10^9/L', 'x10^12/L', 'mL/min/1.73 m2', 'mmol/mol', 'ng/mL', 'mEq/L', 'fL', 'pg'
  ].map((u) => [u.toLowerCase().replace(/\s+/g, ''), u])
)

/** Spelling variants -> the catalog spelling, or null when unknown. */
export function normalizeUnit(u) {
  let k = String(u ?? '').toLowerCase().replace(/[\s_]+/g, '').replace(/[µμ]/g, 'u').replace(/\*/g, '^').replace(/e(9|12)\//, '^$1/')
  if (!k) return null
  k = k.replace(/^x?10\^(\d+)/, 'x10^$1').replace(/^(?:k|x10\^3)\/ul$/, 'x10^9/l').replace(/^10\^3\/ul$/, 'x10^9/l')
  k = k.replace(/^ml\/min\/1\.73m\^?2$/, 'ml/min/1.73m2')
  return UNITS.get(k) ?? null
}

/** value in the catalog unit, or null when there is no safe conversion. */
export function toCanonical(value, unitRaw, code, catalog = loadCatalog()) {
  const c = catalog.find((r) => r.code === code)
  const u = normalizeUnit(unitRaw)
  if (!c || !u || typeof value !== 'number' || !Number.isFinite(value)) return null
  if (u === c.unit) return value
  const f = c.conversions[u]
  return typeof f === 'number' ? Number((value * f).toPrecision(10)) : null
}

/** "1,234.5" -> 1234.5; "<5", ">90", "negative" -> num null, text kept. Ambiguous commas stay text. */
export function parseNumber(v) {
  if (v == null || v === '') return { value_num: null, value_text: null }
  if (typeof v === 'number') return Number.isFinite(v) ? { value_num: v, value_text: null } : { value_num: null, value_text: String(v) }
  const s = String(v).trim()
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return { value_num: Number(s), value_text: null }
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return { value_num: Number(s.replaceAll(',', '')), value_text: null }
  return { value_num: null, value_text: s || null }
}

export function normalizeFlag(f) {
  const s = clean(f).replace(/[.()]/g, '')
  if (/^(h|hh|high|↑|↑↑|\^|critical high|hi)$/.test(s)) return 'H'
  if (/^(l|ll|low|↓|↓↓|critical low|lo)$/.test(s)) return 'L'
  if (/^(n|normal|wnl|within normal limits)$/.test(s)) return 'N'
  if (/^(a|abnormal|\*|positive|reactive)$/.test(s)) return 'A'
  return null
}

/** One extracted test row -> one lab_results payload. Unknown test / unit stays null, never guessed. */
export function normalizeTest(t, catalog = loadCatalog()) {
  const { value_num, value_text } = parseNumber(t.value)
  const test_code = matchTest(t.name, catalog)
  return {
    panel: t.panel ?? null,
    name_raw: String(t.name ?? '').trim(),
    test_code,
    value_num,
    value_text,
    unit_raw: t.unit ?? null,
    value_canonical: test_code && value_num != null ? toCanonical(value_num, t.unit, test_code, catalog) : null,
    flag: normalizeFlag(t.flag),
    ref_low: parseNumber(t.ref_low).value_num,
    ref_high: parseNumber(t.ref_high).value_num,
    ref_text: t.ref_text ?? null
  }
}

// ---- people ----
export const nameKey = (s) => clean(s).replace(/[.,]/g, '').replace(/\s+/g, ' ')
export const sortedKey = (s) => nameKey(s).split(' ').sort().join(' ')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** map: {"<person folder or printed name>": "<people.id>"}. Throws (without echoing) on a bad id. */
export function buildPeopleIndex(map) {
  const idx = new Map()
  for (const [k, id] of Object.entries(map ?? {})) {
    if (!UUID.test(String(id))) throw new Error('people-map has an invalid id')
    idx.set(nameKey(k), id.toLowerCase())
    idx.set(sortedKey(k), id.toLowerCase())
  }
  return idx
}

/**
 * Folder and printed name each look the person up in the map. A conflict, or no match, gives null:
 * the file stays in the unassigned admin queue (B-5). The folder alone is never trusted without a map entry.
 */
export function resolvePerson(idx, { folder, printed }) {
  const hit = (s) => (s ? idx.get(nameKey(s)) ?? idx.get(sortedKey(s)) ?? null : null)
  const a = hit(folder)
  const b = hit(printed)
  if (a && b && a !== b) return null
  return a ?? b ?? null
}
