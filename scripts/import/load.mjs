// manifest + drafts + people-map -> import/load.sql (+ load-summary.json). Idempotent, no output of values.
// Usage: node scripts/import/load.mjs [--dry-run] [--drafts-only] [--threshold 0.9]
//   default      auto-confirm (D-68): a row whose document confidence >= threshold AND whose person is matched by folder and
//                printed name (see family.mjs gate) loads as confirmed with confirmed_source 'auto'; everything else is a draft.
//   --drafts-only  the old behaviour: every row is a draft (health papers then load on a database without 0013; identity papers need 0013 tables).
//   --dry-run    writes .scratch/records-load-dryrun.sql and prints counts per person index / lane / status. No import/ state is touched.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { AUTO_THRESHOLD, buildMatcher, buildProfiles, gate, matchPerson, resolveThreshold, stripNumber } from './family.mjs'
import { loadCatalog, nameKey, normalizeTest } from './normalize.mjs'

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
const textArray = (xs) => `array[${xs.map(lit).join(', ')}]::text[]`

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

const CARD_TYPES = ['philsys', 'senior', 'pwd', 'drivers', 'passport', 'umid', 'voters', 'postal', 'philhealth', 'hmo', 'other'] // documents.card_type (0008)
const ID_TYPES = [...CARD_TYPES, 'tin', 'sss'] // person_identifiers.id_type (0013)
const pick = (v, list) => (list.includes(String(v ?? '').toLowerCase()) ? String(v).toLowerCase() : null)
/** documents.kind for an identity-lane paper. Insurance folders always give insurance cards. */
const identKind = (lane, k) => (lane === 'insurance' || k === 'insurance_card' ? 'insurance_card' : k === 'id_card' ? 'id_card' : k === 'certificate' ? 'certificate' : 'other')

const insert = (table, row, conflict = 'on conflict (id) do nothing') => {
  const cols = Object.keys(row)
  return `insert into public.${table} (${cols.join(', ')}) values (${cols.map((c) => row[c]).join(', ')}) ${conflict};`
}
const AUTO = { confirmed_source: "'auto'" }

/**
 * @param {{manifest:{files:object[]}, drafts:Record<string,object>, peopleMap:Record<string,string>, catalog?:object[],
 *          autoConfirm?: {threshold?:number}|null}} o  autoConfirm null/absent = every row a draft (old behaviour)
 * @returns {{sql:string, summary:object, persons:Record<string,string>}}
 */
export function buildLoadSql({ manifest, drafts, peopleMap, prevPersons = {}, catalog = loadCatalog(), autoConfirm = null, displayNames = null }) {
  const threshold = autoConfirm ? resolveThreshold(autoConfirm.threshold ?? AUTO_THRESHOLD) : null
  const matcher = buildMatcher(peopleMap)
  const files = [...manifest.files].sort((a, b) => a.drive_file_id.localeCompare(b.drive_file_id))
  const folders = [...new Set(files.map((f) => f.person_folder))].sort()
  const pIndex = (f) => `p${folders.indexOf(f.person_folder) + 1}`
  const docs = []
  const sources = []
  const rows = []
  const late = [] // rows that point at source_files (insurance, identifiers) and profile updates: after the source_files inserts
  const fileRecs = []
  const summary = {
    files: files.length, by_status: {}, by_person_index: {}, by_kind: {}, by_person_kind: {}, unassigned_files: 0, remap_needed: 0, rows: {},
    mode: autoConfirm ? 'auto_confirm' : 'drafts_only', threshold, row_status: {}, by_lane: {}, by_person: {}, profile_updates: 0, identifiers: 0
  }
  const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n }
  const byId = new Map(files.map((f) => [f.drive_file_id, f]))
  const usable = (f) => drafts[f.drive_file_id] && !drafts[f.drive_file_id].failed && !f.skipped && !f.duplicate_of
  const segmentsOf = (f) => [...new Set([...(f.path ? f.path.split('/').slice(0, -1) : []), f.person_folder].filter(Boolean))]
  const matchOf = (f) => matchPerson(matcher, { segments: segmentsOf(f), printed: usable(f) ? drafts[f.drive_file_id].patient_name_as_printed : null })
  const mapped = (f) => matchOf(f).id
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
  // profile material gathered while walking the files (only auto-confirmed grade material ever lands here)
  const profileItems = []
  const extras = new Map() // allergies / conditions rows, one per person + text; confirmed wins over draft
  const rxDrugs = new Map() // person -> drug key -> {name, docs}: a medicine seen on 2+ papers is a maintenance medicine
  const touched = new Set()

  for (const f of files) {
    const sfId = uuid5(`sf:${f.drive_file_id}`)
    const d = drafts[f.drive_file_id]
    const lane = f.lane ?? 'health'
    const ident = lane === 'identity' || lane === 'insurance'
    const reason = f.skipped ? f.skipped : f.duplicate_of ? 'duplicate' : lane === 'document_only' ? 'document_only' : null
    const personId = personOf(f)
    if (personId) persons[f.drive_file_id] = personId
    const match = matchOf(f)
    const decide = (confidence, ok = true) => (autoConfirm && ok ? gate({ strength: match.strength, confidence, lane: ident ? 'identity' : 'health', threshold }) : 'draft')
    const loads = Boolean(d && !d.failed && !reason && !remap(f) && personId)
    const docStatus = loads ? decide(conf(d.confidence)) : 'draft'
    const status = reason ? 'skipped' : d?.failed ? 'failed' : d ? (docStatus === 'confirmed' ? 'done' : 'queued') : 'new'
    let documentId = null
    bump(summary.by_status, status)
    bump(summary.by_person_index, pIndex(f))
    bump(summary.by_lane, lane)
    fileRecs.push({ personId, lane, status })
    const put = (table, { _conflict, ...row }, st = 'draft', target = rows) => {
      target.push(insert(table, { ...row, status: lit(st), ...(st === 'confirmed' ? AUTO : {}) }, _conflict))
      bump(summary.rows, table)
      bump((summary.row_status[table] ??= {}), st)
    }
    if (d && !d.failed && !reason) {
      bump(summary.by_kind, d.doc_kind ?? 'other')
      bump((summary.by_person_kind[pIndex(f)] ??= {}), d.doc_kind ?? 'other')
      if (remap(f)) summary.remap_needed++
      else if (!personId) summary.unassigned_files++
      else {
        touched.add(personId)
        documentId = uuid5(`doc:${f.drive_file_id}`)
        const base = { person_id: lit(personId), confidence: lit(conf(d.confidence)) }
        const docRow = ident
          ? {
              id: lit(documentId), person_id: lit(personId), kind: lit(identKind(lane, d.doc_kind)),
              card_type: lit(pick(d.card_type, CARD_TYPES) ?? (identKind(lane, d.doc_kind).endsWith('_card') ? 'other' : null)),
              doc_date: lit(date(d.issued_on)), facility: lit(str(d.carrier)), confidence: lit(conf(d.confidence))
            }
          : {
              id: lit(documentId), person_id: lit(personId), kind: lit(d.doc_kind ?? 'other'), doc_date: lit(date(d.doc_date)),
              collected_at: lit(ts(d.collected_at)), released_at: lit(ts(d.released_at)), facility: lit(str(d.facility)), confidence: lit(conf(d.confidence))
            }
        put('documents', docRow, docStatus, docs)
        if (ident) {
          const idNo = str(d.id_number)
          if (idNo && idNo.length >= 3 && idNo.length <= 60) {
            summary.identifiers++
            put('person_identifiers', {
              id: lit(uuid5(`pid:${f.drive_file_id}`)), person_id: lit(personId), id_type: lit(pick(d.id_type, ID_TYPES) ?? pick(d.card_type, ID_TYPES) ?? 'other'),
              id_number: lit(idNo), issued_on: lit(date(d.issued_on)), expires_on: lit(date(d.expires_on)), source_file_id: lit(sfId), confidence: base.confidence,
              _conflict: 'on conflict do nothing' // the same number on a second scan (other file hash) must not abort the batch
            }, docStatus, late)
          }
          if (lane === 'insurance' && (str(d.carrier) || str(d.plan))) {
            put('insurance_policies', {
              id: lit(uuid5(`ins:${f.drive_file_id}`)), person_id: lit(personId), carrier: lit(str(d.carrier)), plan: lit(str(d.plan)),
              valid_from: lit(date(d.issued_on)), valid_to: lit(date(d.expires_on)), source_file_id: lit(sfId), confidence: base.confidence
            }, docStatus, late) // member_no stays null: the number lives in person_identifiers (admin/self/writer only)
          }
          if (docStatus === 'confirmed') profileItems.push({ personId, fields: { birthdate: d.birthdate, sex: d.sex, blood_type: d.blood_type, address: d.address }, conf: conf(d.confidence) })
        } else {
          const panels = new Map()
          ;(d.tests ?? []).forEach((raw, i) => {
            const t = normalizeTest(raw, catalog)
            if (t.value_num == null && t.value_text == null) return
            let panelId = null
            if (t.panel) {
              if (!panels.has(t.panel)) {
                panels.set(t.panel, uuid5(`panel:${f.drive_file_id}:${panels.size}`))
                put('lab_panels', { id: lit(panels.get(t.panel)), person_id: base.person_id, document_id: lit(documentId), name: lit(str(t.panel)), confidence: base.confidence }, docStatus)
              }
              panelId = panels.get(t.panel)
            }
            put('lab_results', {
              id: lit(uuid5(`lab:${f.drive_file_id}:${i}`)), person_id: base.person_id, document_id: lit(documentId), panel_id: lit(panelId),
              test_code: lit(t.test_code), name_raw: lit(t.name_raw), value_num: lit(t.value_num), value_text: lit(t.value_text),
              unit_raw: lit(str(t.unit_raw)), value_canonical: lit(t.value_canonical), flag: lit(t.flag), ref_low: lit(t.ref_low),
              ref_high: lit(t.ref_high), ref_text: lit(str(t.ref_text)), collected_at: lit(ts(d.collected_at)), // null: the 0008 trigger falls back to the document date (Manila)
              confidence: base.confidence
            }, docStatus)
          })
          // Handwriting (vision) is never auto-confirmed (D-47): only a printed text layer can be, and never a line marked unclear.
          const rxOk = docStatus === 'confirmed' && d.via === 'text'
          const rx = d.rx
          if (rx && ((rx.lines ?? []).length || rx.date)) {
            const rxId = uuid5(`rx:${f.drive_file_id}`)
            put('prescriptions', { id: lit(rxId), person_id: base.person_id, document_id: lit(documentId), rx_date: lit(date(rx.date ?? d.doc_date)), prescriber: lit(str(rx.prescriber)), follow_up_on: lit(date(rx.follow_up)), confidence: base.confidence }, rxOk ? 'confirmed' : 'draft')
            const used = new Set()
            ;(rx.lines ?? []).forEach((l, i) => {
              let no = int(l.line_no)
              if (!no || used.has(no)) no = i + 1
              while (used.has(no)) no++
              used.add(no)
              const lineOk = rxOk && l.unclear !== true
              put('prescription_items', {
                id: lit(uuid5(`rxi:${f.drive_file_id}:${i}`)), person_id: base.person_id, prescription_id: lit(rxId), line_no: lit(no),
                drug_raw: lit(str(l.drug)), strength: lit(str(l.strength)), form: lit(str(l.form)), dose: lit(str(l.dose)),
                frequency: lit(str(l.frequency)), duration: lit(str(l.duration)), quantity: lit(str(l.quantity)), instructions: lit(str(l.instructions)),
                crop: json(l.bbox && typeof l.bbox === 'object' ? l.bbox : null), unclear: lit(l.unclear === true), confidence: base.confidence
              }, lineOk ? 'confirmed' : 'draft')
              const drug = str(l.drug)
              if (lineOk && drug) {
                const per = rxDrugs.get(personId) ?? new Map()
                const key = nameKey(drug)
                const cur = per.get(key) ?? { name: drug.slice(0, 80), docs: new Set() }
                cur.docs.add(f.drive_file_id)
                per.set(key, cur)
                rxDrugs.set(personId, per)
              }
            })
          }
          const im = d.imaging
          if (im && (str(im.findings) || str(im.impression) || str(im.modality))) {
            put('imaging_reports', {
              id: lit(uuid5(`img:${f.drive_file_id}`)), person_id: base.person_id, document_id: lit(documentId), modality: lit(modality(im.modality)),
              body_region: lit(str(im.body_region)), findings: lit(str(im.findings)), impression: lit(str(im.impression)),
              measurements: json(im.measurements ?? null), reported_at: lit(ts(d.released_at) ?? date(d.doc_date)), confidence: base.confidence
            }, docStatus)
          }
          ;(d.vaccinations ?? []).forEach((v, i) => {
            if (!str(v.vaccine)) return
            put('vaccinations', {
              id: lit(uuid5(`vax:${f.drive_file_id}:${i}`)), person_id: base.person_id, document_id: lit(documentId), vaccine: lit(str(v.vaccine)),
              dose_no: lit(int(v.dose_no)), given_on: lit(date(v.given_on)), facility: lit(str(v.facility)), lot: lit(str(v.lot)), confidence: base.confidence
            }, docStatus)
          })
          for (const [table, col, list] of [['allergies', 'substance', d.allergies], ['conditions', 'name', d.conditions]]) {
            for (const text of (Array.isArray(list) ? list : []).map(str).filter(Boolean).slice(0, 10)) {
              const key = `${table}:${personId}:${nameKey(text)}`
              const prev = extras.get(key)
              if (!prev || (docStatus === 'confirmed' && prev.status !== 'confirmed')) extras.set(key, { table, col, personId, text: text.slice(0, 80), status: docStatus, confidence: conf(d.confidence) })
            }
          }
        }
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

  // allergies / conditions: one row per person + text
  const confirmedText = { allergies: new Map(), conditions: new Map() }
  for (const [key, e] of extras) {
    rows.push(insert(e.table, { id: lit(uuid5(`${e.table.slice(0, 3)}:${key}`)), person_id: lit(e.personId), [e.col]: lit(e.text), status: lit(e.status), ...(e.status === 'confirmed' ? AUTO : {}), confidence: lit(e.confidence) }))
    bump(summary.rows, e.table)
    bump((summary.row_status[e.table] ??= {}), e.status)
    if (e.status === 'confirmed') confirmedText[e.table].set(e.personId, [...(confirmedText[e.table].get(e.personId) ?? []), e.text])
  }

  // profile: fill empty people columns only (a person's own entry is never overwritten), union the lists
  if (autoConfirm) {
    const profiles = buildProfiles(profileItems)
    const keysByPerson = new Map()
    for (const [k, id] of Object.entries(peopleMap ?? {})) keysByPerson.set(id.toLowerCase(), [...(keysByPerson.get(id.toLowerCase()) ?? []), stripNumber(k)])
    const union = (col, xs) => `${col} = (select coalesce(array_agg(x), '{}') from (select distinct x from unnest(${col} || ${textArray(xs)}) x limit ${col === 'aliases' ? 20 : 30}) s)`
    for (const pid of [...touched].sort()) {
      const sets = []
      const prof = profiles.get(pid) ?? {}
      if (prof.birthdate) sets.push(`birthdate = coalesce(birthdate, ${lit(prof.birthdate)}::date)`)
      for (const c of ['sex', 'blood_type', 'address']) if (prof[c]) sets.push(`${c} = coalesce(${c}, ${lit(prof[c])})`)
      // the first key per person is the config's own name (= display name): it is not an alias of itself
      const own = new Set([nameKey(keysByPerson.get(pid)?.[0] ?? ''), nameKey(displayNames?.[pid] ?? '')])
      const aliases = [...new Map((keysByPerson.get(pid) ?? []).map((k) => [nameKey(k), k])).values()].filter((k) => !own.has(nameKey(k))).slice(0, 20)
      if (aliases.length) sets.push(union('aliases', aliases))
      const meds = [...(rxDrugs.get(pid)?.values() ?? [])].filter((x) => x.docs.size >= 2).map((x) => x.name)
      for (const [col, xs] of [['allergies', confirmedText.allergies.get(pid)], ['conditions', confirmedText.conditions.get(pid)], ['medicines', meds]]) if (xs?.length) sets.push(union(col, [...new Set(xs)]))
      if (sets.length) { late.push(`update public.people set ${sets.join(', ')} where id = ${lit(pid)};`); summary.profile_updates++ }
    }
  }

  // per person index (p1.. by sorted person id; unassigned has none): lane -> file status
  const ids = [...new Set(fileRecs.map((r) => r.personId).filter(Boolean))].sort()
  for (const r of fileRecs) {
    const who = r.personId ? `p${ids.indexOf(r.personId) + 1}` : 'unassigned'
    const lanes = (summary.by_person[who] ??= {})
    bump((lanes[r.lane] ??= {}), r.status)
  }

  // documents first (source_files.document_id), keepers before duplicates (duplicate_of FK).
  sources.sort((a, b) => a.dup - b.dup)
  const sql = ['begin;', ...docs, ...rows, ...sources.map((s) => s.sql), ...late, 'commit;'].join('\n') + '\n'
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

function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run')
  const t = argv.indexOf('--threshold')
  const autoConfirm = argv.includes('--drafts-only') ? null : { threshold: t >= 0 ? Number(argv[t + 1]) : AUTO_THRESHOLD }
  const manifest = JSON.parse(readFileSync('import/manifest.json', 'utf8'))
  const { drafts, corrupt } = readDrafts('import/drafts')
  const peopleMap = existsSync('import/people-map.json') ? JSON.parse(readFileSync('import/people-map.json', 'utf8')) : {}
  const prevPersons = existsSync('import/load-state.json') ? JSON.parse(readFileSync('import/load-state.json', 'utf8')) : {}
  const { sql, summary, persons } = buildLoadSql({ manifest, drafts, peopleMap, prevPersons, autoConfirm })
  summary.corrupt_drafts = corrupt
  if (dryRun) {
    mkdirSync('.scratch', { recursive: true })
    writeFileSync('.scratch/records-load-dryrun.sql', sql)
    console.log(JSON.stringify({ dry_run: true, file: '.scratch/records-load-dryrun.sql', ...summary }))
    return
  }
  writeFileSync('import/load.sql', sql)
  writeFileSync('import/load-state.json', JSON.stringify({ ...prevPersons, ...persons }))
  writeFileSync('import/load-summary.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main() } catch (e) { console.error(`load failed: ${e?.name ?? 'Error'}`); process.exit(1) }
}
