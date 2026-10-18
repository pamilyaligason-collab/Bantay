// Drive metadata -> import/ids-link.sql: links ID and insurance card files (D-63) to people. Metadata only:
// no file is downloaded or opened, no OCR, nothing is sent anywhere. Prints counts only (never names or ids).
// Usage: node scripts/import/link-ids.mjs        (reads import/drive-raw.jsonl and import/people-map.json)
// Rows land as draft documents: the owner confirms which card each one is in the app.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { lit, uuid5 } from './load.mjs'
import { buildPeopleIndex, resolvePerson } from './normalize.mjs'

const FOLDER = 'application/vnd.google-apps.folder'
const ZONE = /ids and documents|insurance/i // folder names that hold cards
const INSURANCE_DIR = /insurance/i
const NOT_A_CARD = /birth|baptismal|certificate|\bland\b|home lot|\blot\b|\bfunds?\b|authori[sz]ation|\bvisa\b/i
// First match wins, so "Senior ID" is senior before it can be "other".
const TYPES = [
  ['senior', /senior|osca/i],
  ['philhealth', /phil ?health/i],
  ['hmo', /\bhmo\b|maxicare|intellicare|medicard|health maintenance/i],
  ['passport', /passport/i],
  ['drivers', /driver|licen[sc]e|\blto\b/i],
  ['umid', /umid/i],
  ['philsys', /philsys|national id|phil ?id|psa/i],
  ['pwd', /\bpwd\b|persons? with disab/i],
  ['voters', /voter/i],
  ['postal', /postal/i]
]
export const guessType = (text) => TYPES.find(([, re]) => re.test(text))?.[0] ?? 'other'
const redact = (s) => String(s ?? '').replace(/\d{4,}/g, '#') // a number printed in a file name is never copied

/** rows: Drive metadata lines. peopleMap: {"<folder name>": "<people.id>"}. Returns the SQL and counts. */
export function buildIdLinkSql({ rows, peopleMap }) {
  const idx = buildPeopleIndex(peopleMap)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const summary = { files: 0, linked: 0, id_card: 0, insurance_card: 0, not_a_card: 0, not_in_card_folder: 0, wrong_type: 0, unknown_person: 0 }
  const out = []

  for (const f of rows) {
    if (f.mimeType === FOLDER) continue
    summary.files++
    // titles from the file up to the root (cycle-safe)
    const chain = []
    for (let p = f.parentId, n = 0; p && byId.has(p) && n < 50; n++) { const d = byId.get(p); chain.push(d.title ?? ''); p = d.parentId }
    const zoneAt = chain.findIndex((t) => ZONE.test(t))
    if (zoneAt < 0) { summary.not_in_card_folder++; continue }
    if (!/^image\//.test(f.mimeType ?? '') && f.mimeType !== 'application/pdf') { summary.wrong_type++; continue }
    const below = [f.title ?? '', ...chain.slice(0, zoneAt + 1)] // file, its folders, up to and including the zone folder
    if (below.some((t) => NOT_A_CARD.test(t))) { summary.not_a_card++; continue }
    let personId = null
    for (const t of chain) { personId = resolvePerson(idx, { folder: t }); if (personId) break }
    if (!personId) { summary.unknown_person++; continue }

    const cardType = guessType(below.join(' / '))
    const kind = chain.slice(0, zoneAt + 1).some((t) => INSURANCE_DIR.test(t)) || cardType === 'philhealth' || cardType === 'hmo' ? 'insurance_card' : 'id_card'
    const docId = uuid5(`idcard-doc:${f.id}`)
    const sfId = uuid5(`idcard-file:${f.id}`)
    const size = Number.isFinite(Number(f.fileSize)) && f.fileSize != null ? Number(f.fileSize) : null
    // skipped: these pictures must never enter the extraction queue (cards are not read, D-63).
    out.push(
      `insert into public.documents (id, client_id, person_id, kind, card_type, status) values (${[docId, docId, personId, kind, cardType].map(lit).join(', ')}, 'draft') on conflict do nothing;`,
      `insert into public.source_files (id, client_id, person_id, drive_file_id, name, mime, size_bytes, document_id, ingest_status, skip_reason) values (${[sfId, sfId, personId, f.id, redact(f.title) || 'card', f.mimeType, size, docId].map(lit).join(', ')}, 'skipped', 'id_card') on conflict do nothing;`
    )
    summary.linked++
    summary[kind]++
  }
  return { sql: `begin;\n${out.join('\n')}\ncommit;\n`, summary }
}

export function readJsonl(path) {
  const rows = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* a bad line is dropped, never echoed */ }
  }
  return rows
}

function main() {
  if (!existsSync('import/drive-raw.jsonl')) throw new Error('missing drive-raw.jsonl')
  const peopleMap = existsSync('import/people-map.json') ? JSON.parse(readFileSync('import/people-map.json', 'utf8')) : {}
  const { sql, summary } = buildIdLinkSql({ rows: readJsonl('import/drive-raw.jsonl'), peopleMap })
  writeFileSync('import/ids-link.sql', sql)
  console.log(JSON.stringify(summary))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main() } catch (e) { console.error(`link-ids failed: ${e?.name ?? 'Error'}`); process.exit(1) }
}
