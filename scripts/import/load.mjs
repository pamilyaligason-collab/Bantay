// manifest + drafts + people-map -> import/load.sql (+ load-summary.json). Drafts only, idempotent, no output of values.
// Usage: node scripts/import/load.mjs
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { buildPeopleIndex, loadCatalog, normalizeTest, resolvePerson } from './normalize.mjs'

// Fixed namespace for this importer's ids. Never change it: re-runs depend on stable ids.
const NS = '7d1b6f0e-4c2a-5b8e-9a3d-1f0c5e7a2b64'

/** RFC 4122 v5 (sha1). */
export function uuid5(name, ns = NS) {
  const h = createHash('sha1').update(Buffer.from(ns.replaceAll('-', ''), 'hex')).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

/** SQL literal. Strings are '' escaped (standard_conforming_strings is on), NUL stripped, so $$ and quotes are inert. */
export function lit(v) {
  if (v == null) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replaceAll('\0', '').replaceAll("'", "''")}'`
}
const json = (v) => (v == null ? 'null' : `${lit(JSON.stringify(v).replaceAll('\\u0000', ''))}::jsonb`)

const str = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const date = (v) => {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s) ? s : null
}
/** Timestamps without a zone are Manila time (+08:00), never the database session zone. */
const ts = (v) => {
  let s = str(v)
  if (!s || !/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return null
  if (s.length === 10) s += 'T00:00:00'
  s = s.replace(' ', 'T')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += '+08:00'
  return Number.isNaN(Date.parse(s)) ? null : s
}
const int = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null)
const conf = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null)

function modality(m) {
  const s = String(m ?? '').toLowerCase()
  if (/ultra|sono|usg/.test(s)) return 'ultrasound'
  if (/x-?ray|radiograph|cxr/.test(s)) return 'xray'
  if (/\bct\b|computed/.test(s)) return 'ct'
  if (/mri|magnetic/.test(s)) return 'mri'
  if (/ecg|ekg|electrocardio/.test(s)) return 'ecg'
  if (/echo/.test(s)) return 'echo'
  return s ? 'other' : null
}

const insert = (table, row, conflict = 'on conflict (id) do nothing') => {
  const cols = Object.keys(row)
  return `insert into public.${table} (${cols.join(', ')}) values (${cols.map((c) => row[c]).join(', ')}) ${conflict};`
}

/**
 * @param {{manifest:{files:object[]}, drafts:Record<string,object>, peopleMap:Record<string,string>, catalog?:object[]}} o
 * @returns {{sql:string, summary:object}}
 */
export function buildLoadSql({ manifest, drafts, peopleMap, prevPersons = {}, catalog = loadCatalog() }) {
  const idx = buildPeopleIndex(peopleMap)
  const files = [...manifest.files].sort((a, b) => a.drive_file_id.localeCompare(b.drive_file_id))
  const folders = [...new Set(files.map((f) => f.person_folder))].sort()
  const pIndex = (f) => `p${folders.indexOf(f.person_folder) + 1}`
  const docs = []
  const sources = []
  const rows = []
  const summary = { files: files.length, by_status: {}, by_person_index: {}, by_kind: {}, by_person_kind: {}, unassigned_files: 0, remap_needed: 0, rows: {} }
  const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n }
  const byId = new Map(files.map((f) => [f.drive_file_id, f]))
  const usable = (f) => drafts[f.drive_file_id] && !drafts[f.drive_file_id].failed && !f.skipped && !f.duplicate_of
  const mapped = (f) => {
    const d = drafts[f.drive_file_id]
    return resolvePerson(idx, { folder: f.person_folder, printed: usable(f) ? d.patient_name_as_printed : null })
  }
  // The person written on source_files. A file already loaded under another person keeps that person (remap_needed);
  // a duplicate never differs from its keeper (0008 person_mismatch).
  const remap = (f) => {
    const p = mapped(f), prev = prevPersons[f.drive_file_id]
    return prev && p && prev !== p
  }
  const personOf = (f) => {
    const p = remap(f) ? prevPersons[f.drive_file_id] : mapped(f)
    const keeper = f.duplicate_of && byId.get(f.duplicate_of)
    if (keeper && p) {
      const kp = remap(keeper) ? prevPersons[keeper.drive_file_id] : mapped(keeper)
      if (kp && kp !== p) return null
    }
    return p
  }
  const persons = {}

  for (const f of files) {
    const sfId = uuid5(`sf:${f.drive_file_id}`)
    const d = drafts[f.drive_file_id]
    const reason = f.skipped ? f.skipped : f.duplicate_of ? 'duplicate' : null
    const status = reason ? 'skipped' : d?.failed ? 'failed' : d ? 'queued' : 'new'
    const personId = personOf(f)
    if (personId) persons[f.drive_file_id] = personId
    let documentId = null
    bump(summary.by_status, status)
    bump(summary.by_person_index, pIndex(f))
    if (d && !d.failed && !reason) {
      bump(summary.by_kind, d.doc_kind ?? 'other')
      bump((summary.by_person_kind[pIndex(f)] ??= {}), d.doc_kind ?? 'other')
      if (remap(f)) summary.remap_needed++
      else if (!personId) summary.unassigned_files++
      else {
        documentId = uuid5(`doc:${f.drive_file_id}`)
        const base = { person_id: lit(personId), status: "'draft'", confidence: lit(conf(d.confidence)) }
        const put = (table, row) => { rows.push(insert(table, row)); bump(summary.rows, table) }
        docs.push(
          insert('documents', {
            id: lit(documentId), person_id: lit(personId), kind: lit(d.doc_kind ?? 'other'), doc_date: lit(date(d.doc_date)),
            collected_at: lit(ts(d.collected_at)), released_at: lit(ts(d.released_at)), facility: lit(str(d.facility)),
            status: "'draft'", confidence: lit(conf(d.confidence))
          })
        )
        bump(summary.rows, 'documents')
        const panels = new Map()
        ;(d.tests ?? []).forEach((raw, i) => {
          const t = normalizeTest(raw, catalog)
          if (t.value_num == null && t.value_text == null) return
          let panelId = null
          if (t.panel) {
            if (!panels.has(t.panel)) {
              panels.set(t.panel, uuid5(`panel:${f.drive_file_id}:${panels.size}`))
              put('lab_panels', { id: lit(panels.get(t.panel)), person_id: base.person_id, document_id: lit(documentId), name: lit(str(t.panel)), status: base.status, confidence: base.confidence })
            }
            panelId = panels.get(t.panel)
          }
          put('lab_results', {
            id: lit(uuid5(`lab:${f.drive_file_id}:${i}`)), person_id: base.person_id, document_id: lit(documentId), panel_id: lit(panelId),
            test_code: lit(t.test_code), name_raw: lit(t.name_raw), value_num: lit(t.value_num), value_text: lit(t.value_text),
            unit_raw: lit(str(t.unit_raw)), value_canonical: lit(t.value_canonical), flag: lit(t.flag), ref_low: lit(t.ref_low),
            ref_high: lit(t.ref_high), ref_text: lit(str(t.ref_text)), collected_at: lit(ts(d.collected_at)), // null: the 0008 trigger falls back to the document date (Manila)
            status: base.status, confidence: base.confidence
          })
        })
        const rx = d.rx
        if (rx && ((rx.lines ?? []).length || rx.date)) {
          const rxId = uuid5(`rx:${f.drive_file_id}`)
          put('prescriptions', { id: lit(rxId), person_id: base.person_id, document_id: lit(documentId), rx_date: lit(date(rx.date ?? d.doc_date)), prescriber: lit(str(rx.prescriber)), follow_up_on: lit(date(rx.follow_up)), status: base.status, confidence: base.confidence })
          const used = new Set()
          ;(rx.lines ?? []).forEach((l, i) => {
            let no = int(l.line_no)
            if (!no || used.has(no)) no = i + 1
            while (used.has(no)) no++
            used.add(no)
            put('prescription_items', {
              id: lit(uuid5(`rxi:${f.drive_file_id}:${i}`)), person_id: base.person_id, prescription_id: lit(rxId), line_no: lit(no),
              drug_raw: lit(str(l.drug)), strength: lit(str(l.strength)), form: lit(str(l.form)), dose: lit(str(l.dose)),
              frequency: lit(str(l.frequency)), duration: lit(str(l.duration)), quantity: lit(str(l.quantity)), instructions: lit(str(l.instructions)),
              crop: json(l.bbox && typeof l.bbox === 'object' ? l.bbox : null), unclear: lit(l.unclear === true), status: base.status, confidence: base.confidence
            })
          })
        }
        const im = d.imaging
        if (im && (str(im.findings) || str(im.impression) || str(im.modality))) {
          put('imaging_reports', {
            id: lit(uuid5(`img:${f.drive_file_id}`)), person_id: base.person_id, document_id: lit(documentId), modality: lit(modality(im.modality)),
            body_region: lit(str(im.body_region)), findings: lit(str(im.findings)), impression: lit(str(im.impression)),
            measurements: json(im.measurements ?? null), reported_at: lit(ts(d.released_at) ?? date(d.doc_date)), status: base.status, confidence: base.confidence
          })
        }
        ;(d.vaccinations ?? []).forEach((v, i) => {
          if (!str(v.vaccine)) return
          put('vaccinations', {
            id: lit(uuid5(`vax:${f.drive_file_id}:${i}`)), person_id: base.person_id, document_id: lit(documentId), vaccine: lit(str(v.vaccine)),
            dose_no: lit(int(v.dose_no)), given_on: lit(date(v.given_on)), facility: lit(str(v.facility)), lot: lit(str(v.lot)), status: base.status, confidence: base.confidence
          })
        })
      }
    }
    sources.push({
      dup: f.duplicate_of ? 1 : 0,
      sql: insert(
        'source_files',
        {
          id: lit(sfId), person_id: lit(personId), drive_file_id: lit(f.drive_file_id), drive_modified_at: lit(ts(f.modified)), name: lit(f.name), mime: lit(f.mime),
          size_bytes: lit(f.size), md5: lit(f.md5), sha256: lit(f.sha256 ?? null), duplicate_of: lit(f.duplicate_of ? uuid5(`sf:${f.duplicate_of}`) : null),
          document_id: lit(documentId), ingest_status: lit(status), skip_reason: lit(reason)
        },
        // Never move a row backwards (done stays done); fill person/document once they become known.
        `on conflict (drive_file_id) do update set drive_modified_at = excluded.drive_modified_at, ` +
          `ingest_status = case when public.source_files.ingest_status = 'done' then 'done' else excluded.ingest_status end, ` +
          `person_id = coalesce(public.source_files.person_id, excluded.person_id), document_id = coalesce(public.source_files.document_id, excluded.document_id), updated_at = now()`
      )
    })
  }
  // documents first (source_files.document_id), keepers before duplicates (duplicate_of FK).
  sources.sort((a, b) => a.dup - b.dup)
  const sql = ['begin;', ...docs, ...rows, ...sources.map((s) => s.sql), 'commit;'].join('\n') + '\n'
  return { sql, summary, persons }
}

/** Reads every <id>.json. A corrupt file is counted, never reported: the parser message quotes the input. */
export function readDrafts(dir) {
  const drafts = {}
  let corrupt = 0
  if (existsSync(dir)) {
    for (const n of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      try { drafts[n.slice(0, -5)] = JSON.parse(readFileSync(`${dir}/${n}`, 'utf8')) } catch { corrupt++ }
    }
  }
  return { drafts, corrupt }
}

function main() {
  const manifest = JSON.parse(readFileSync('import/manifest.json', 'utf8'))
  const { drafts, corrupt } = readDrafts('import/drafts')
  const peopleMap = existsSync('import/people-map.json') ? JSON.parse(readFileSync('import/people-map.json', 'utf8')) : {}
  const prevPersons = existsSync('import/load-state.json') ? JSON.parse(readFileSync('import/load-state.json', 'utf8')) : {}
  const { sql, summary, persons } = buildLoadSql({ manifest, drafts, peopleMap, prevPersons })
  summary.corrupt_drafts = corrupt
  writeFileSync('import/load.sql', sql)
  writeFileSync('import/load-state.json', JSON.stringify({ ...prevPersons, ...persons }))
  writeFileSync('import/load-summary.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main() } catch (e) { console.error(`load failed: ${e?.name ?? 'Error'}`); process.exit(1) }
}
