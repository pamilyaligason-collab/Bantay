// D-146: write confirmed health papers back to each person's Drive folder (PC side). Counts only on the console; a dry run is the default.
// CLI (driven by scripts/records-writeback.ps1):
//   map  --from <people json> --root <dir>   build import/writeback-map.json ({"<people.id>": "<person folder>"}) by matching folder names to display names
//   plan --rows <json> --labs <json> --root <dir> [--person <id>] [--limit N]   -> .scratch/writeback-plan.json (no file is touched)
//   apply [--write]                           verify sha256 of the downloaded copies, copy, record in the manifest (without --write: counts only)
//   undo  [--write]                           remove manifest files that are unchanged (sha256) and inside From Bantay; changed ones are kept
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { csvLine } from './lib.mjs'

export const EXCLUDED_KINDS = new Set(['id_card', 'insurance_card'])
export const MAP_FILE = 'import/writeback-map.json'
export const MANIFEST_FILE = 'import/writeback-manifest.json'
export const PLAN_FILE = '.scratch/writeback-plan.json'
export const LABS_COLS = ['name_raw', 'value_num', 'value_text', 'unit_raw', 'ref_text', 'flag', 'ref_low', 'ref_high', 'collected_at']
const TEXT_COLS = new Set(['name_raw', 'value_text', 'unit_raw', 'ref_text'])
const hasWb = (p) => String(p).split(/[\\/]/).includes('From Bantay')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const MANILA_MS = 8 * 3600 * 1000

/** doc_date, else the created day in Manila time (the app's local day, ML-38). '' when neither parses. */
export function docDay(row) {
  if (/^\d{4}-\d{2}-\d{2}/.test(row.doc_date ?? '')) return row.doc_date.slice(0, 10)
  const t = Date.parse(row.created_at ?? '')
  return Number.isNaN(t) ? '' : new Date(t + MANILA_MS).toISOString().slice(0, 10)
}

/** Relative destination `From Bantay/<year>/<date>_<kind>_<docid8>_p01.<ext>` (or `_labs.csv`). Never holds a person name. Throws on a value that could leave the folder. */
export function destName(row) {
  const day = docDay(row)
  const id8 = String(row.doc_id ?? '').replace(/-/g, '').slice(0, 8)
  if (!day || !/^[a-z_]+$/.test(row.kind ?? '') || !/^[0-9a-f]{8}$/.test(id8)) throw new Error('bad name parts')
  const labs = row.type === 'labs'
  if (!labs && !/^[a-z0-9]{1,5}$/.test(row.ext ?? '')) throw new Error('bad extension')
  const tail = labs ? 'labs.csv' : `p${String(row.page ?? 1).padStart(2, '0')}.${row.ext}`
  return join('From Bantay', day.slice(0, 4), `${day}_${row.kind}_${id8}_${tail}`)
}

/** Health papers only: id and insurance cards never leave the app. */
export const eligible = (row) => !EXCLUDED_KINDS.has(row.kind)

const within = (folder, dest) => {
  const rel = relative(resolve(folder), resolve(dest))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** `a.pdf` -> `a-2.pdf`, `a-3.pdf` ... first name neither existsFn nor this run has used. */
function freeName(dest, existsFn, taken) {
  const dot = dest.lastIndexOf('.')
  for (let n = 2; ; n++) {
    const d = `${dest.slice(0, dot)}-${n}${dest.slice(dot)}`
    if (!existsFn(d) && !taken.has(d)) return d
  }
}

/**
 * rows: {key, type:'file'|'labs', person_id, kind, doc_id, doc_date, created_at, page, ext, sha256}. key = source_files.id (labs: `labs:<doc_id>`).
 * manifest: {[key]: {dest, sha256}}. mapping: {[person_id]: folder}. Returns [{key, action, dest?}] with action
 * write | skip | conflict (written under a -2 name, never over a file) | unmapped | bad_dest. Rows of excluded kinds give no action.
 */
export function planWrites(rows, manifest, mapping, existsFn, root) {
  const taken = new Set()
  const out = []
  for (const row of rows) {
    if (!eligible(row)) continue
    const folder = mapping[row.person_id]
    if (!folder) { out.push({ key: row.key, action: 'unmapped' }); continue }
    let dest
    try { dest = join(folder, destName(row)) } catch { out.push({ key: row.key, action: 'bad_dest' }); continue }
    if (!within(folder, dest) || (root && !within(root, folder))) { out.push({ key: row.key, action: 'bad_dest' }); continue }
    const prev = manifest[row.key]
    if (prev && prev.sha256 === row.sha256) { out.push({ key: row.key, action: 'skip', dest: prev.dest }); continue } // also when the owner moved or deleted it: never resurrect
    let action = 'write'
    if (existsFn(dest) || taken.has(dest)) { dest = freeName(dest, existsFn, taken); action = 'conflict' }
    taken.add(dest)
    out.push({ key: row.key, action, dest })
  }
  return out
}

/** Confirmed lab results of one document as CSV: header, then one quoted row per result in the given order. Text cells starting with = + - @ tab or CR get a leading '. */
export function labsCsv(rows) {
  const cell = (r, c) => (TEXT_COLS.has(c) && /^[=+\-@\t\r]/.test(String(r[c] ?? '')) ? `'${r[c]}` : r[c])
  return [LABS_COLS.join(','), ...rows.map((r) => csvLine(LABS_COLS.map((c) => cell(r, c))))].join('\r\n') + '\r\n'
}

/** The CLI returns {rows:[...]} or a bare array; find the array of objects. */
export function rowsOf(v) {
  if (Array.isArray(v)) return v
  for (const x of Object.values(v ?? {})) {
    const r = rowsOf(x)
    if (r.length) return r
  }
  return []
}

/** Map person folders to people ids by display name (case-insensitive, whole name). A name used by two people, or two folders differing only in case, stays unmapped (counted missing). */
export function buildMap(people, folders, root) {
  const key = (s) => String(s).trim().toLowerCase()
  const folderCount = new Map()
  for (const f of folders) folderCount.set(key(f), (folderCount.get(key(f)) ?? 0) + 1)
  const nameCount = new Map()
  for (const p of people) nameCount.set(key(p.display_name), (nameCount.get(key(p.display_name)) ?? 0) + 1)
  const byName = new Map(folders.map((f) => [key(f), f]))
  const map = {}
  let missing = 0
  for (const p of people) {
    const k = key(p.display_name)
    const f = byName.get(k)
    if (f && nameCount.get(k) === 1 && folderCount.get(k) === 1) map[p.id] = join(root, f)
    else missing++
  }
  return { map, missing }
}

/** Plan rows from the two query outputs: file rows (one per confirmed source file) and confirmed lab results. */
export function buildRows(fileRows, labRows) {
  const pages = new Map()
  const rows = fileRows.map((r) => {
    const page = (pages.get(r.doc_id) ?? 0) + 1
    pages.set(r.doc_id, page)
    const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(r.storage_path ?? '')?.[1] ?? '').toLowerCase()
    return { key: r.sf_id, type: 'file', person_id: r.person_id, kind: r.kind, doc_id: r.doc_id, doc_date: r.doc_date, created_at: r.created_at, page, ext, sha256: r.sha256, storage_path: r.storage_path }
  })
  const byDoc = new Map()
  for (const r of labRows) byDoc.set(r.doc_id, [...(byDoc.get(r.doc_id) ?? []), r])
  for (const [doc_id, rs] of byDoc) {
    const csv = labsCsv(rs)
    const h = rs[0]
    rows.push({ key: `labs:${doc_id}`, type: 'labs', person_id: h.person_id, kind: h.kind, doc_id, doc_date: h.doc_date, created_at: h.created_at, sha256: sha256(Buffer.from(csv)), csv })
  }
  return rows
}

const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')) : d)
const writeJson = (f, v) => {
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify(v, null, 2))
}
const arg = (a, n) => {
  const i = a.indexOf(n)
  return i >= 0 ? a[i + 1] : undefined
}
const count = (list) => list.reduce((o, x) => ((o[x.action] = (o[x.action] ?? 0) + 1), o), {})

/** Verify, then write each planned item; never overwrites ('wx'). An older entry whose sha changed is kept as manifest[key#oldSha]. Mutates manifest; save(manifest) runs after each write. */
export function applyPlan(plan, manifest, write, srcDir, save = () => {}) {
  const res = { written: 0, would_write: 0, sha_mismatch: 0, missing_download: 0, failed: 0 }
  for (const p of plan.filter((x) => x.action === 'write' || x.action === 'conflict')) {
    if (!write) { res.would_write++; continue }
    try {
      const src = join(srcDir, p.key.replace(/[:/*?"<>|]/g, '_'))
      const data = p.type === 'labs' ? Buffer.from(p.csv) : existsSync(src) ? readFileSync(src) : null
      if (!data) { res.missing_download++; continue }
      if (sha256(data) !== p.sha256) { res.sha_mismatch++; continue } // verified against source_files.sha256, and the verified bytes are what is written
      mkdirSync(dirname(p.dest), { recursive: true })
      writeFileSync(p.dest, data, { flag: 'wx' }) // wx: a file that appeared since the plan is never overwritten
      const old = manifest[p.key]
      if (old && old.sha256 !== p.sha256) manifest[`${p.key}#${old.sha256}`] = old
      manifest[p.key] = { dest: p.dest, sha256: p.sha256, written_at: new Date().toISOString() }
      save(manifest)
      res.written++
    } catch (e) {
      res.failed++
      console.error(`write failed: ${e.code ?? 'error'}`)
    }
  }
  return res
}

/** Remove a manifest file only when its bytes still match the recorded sha256 and the path is inside a From Bantay folder; an edited file is counted changed and kept (entry stays). Mutates manifest when write. */
export function undoManifest(manifest, write) {
  const res = { removed: 0, would_remove: 0, already_gone: 0, changed: 0, failed: 0 }
  for (const [k, e] of Object.entries(manifest)) {
    if (!existsSync(e.dest)) {
      res.already_gone++
      if (write) delete manifest[k]
      continue
    }
    let same = false
    try { same = hasWb(e.dest) && sha256(readFileSync(e.dest)) === e.sha256 } catch { res.failed++; continue }
    if (!same) res.changed++
    else if (!write) res.would_remove++
    else {
      try {
        rmSync(e.dest)
        delete manifest[k]
        res.removed++
      } catch (err) {
        res.failed++
        console.error(`remove failed: ${err.code ?? 'error'}`)
      }
    }
  }
  return res
}

function main(argv) {
  const [cmd, ...a] = argv
  if (cmd === 'map') {
    const root = arg(a, '--root')
    const people = rowsOf(readJson(arg(a, '--from'), [])).filter((p) => p.id && p.display_name)
    const folders = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    const { map, missing } = buildMap(people, folders, root)
    writeJson(MAP_FILE, map)
    console.log(`map: ${Object.keys(map).length} mapped, ${missing} without a folder`)
  } else if (cmd === 'plan') {
    const mapping = readJson(MAP_FILE, null)
    if (!mapping) throw new Error('import/writeback-map.json missing (run the map step)')
    const who = arg(a, '--person')
    const rows = buildRows(rowsOf(readJson(arg(a, '--rows'), [])), rowsOf(readJson(arg(a, '--labs'), []))).filter((r) => !who || r.person_id === who)
    const byKey = new Map(rows.map((r) => [r.key, r]))
    let limit = Number(arg(a, '--limit') ?? Infinity)
    const kept = planWrites(rows, readJson(MANIFEST_FILE, {}), mapping, existsSync, arg(a, '--root'))
      .filter((p) => (p.action === 'write' || p.action === 'conflict' ? limit-- > 0 : true))
      .map((p) => ({ ...p, ...Object.fromEntries(['type', 'sha256', 'storage_path', 'csv'].map((k) => [k, byKey.get(p.key)[k]])) }))
    writeJson(PLAN_FILE, kept)
    console.log('plan:', JSON.stringify(count(kept)))
  } else if (cmd === 'apply') {
    const manifest = readJson(MANIFEST_FILE, {})
    const res = applyPlan(readJson(PLAN_FILE, []), manifest, a.includes('--write'), join('.scratch', 'wb'), (m) => writeJson(MANIFEST_FILE, m))
    console.log('apply:', JSON.stringify(res), a.includes('--write') ? '' : '(dry run)')
  } else if (cmd === 'undo') {
    const write = a.includes('--write')
    const manifest = readJson(MANIFEST_FILE, {})
    const res = undoManifest(manifest, write)
    if (write) writeJson(MANIFEST_FILE, manifest)
    console.log('undo:', JSON.stringify(res), write ? '' : '(dry run)')
  } else throw new Error('usage: writeback.mjs map|plan|apply|undo')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)) } catch (e) { console.error(`writeback failed: ${e.code ?? 'error'}`); process.exit(1) }
}
