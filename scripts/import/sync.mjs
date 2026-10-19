// Drive -> import/manifest.json + import/files/<drive_file_id>. Read-only Drive scope; prints counts only.
// Usage: node scripts/import/sync.mjs [--dry-run]   (env: DRIVE_ACCESS_TOKEN, DRIVE_ROOT_ID)
// --dry-run lists and classifies only (counts per lane / skip reason / person index); nothing is downloaded or written.
//    or: LOCAL_ROOT='G:/My Drive/Bantay Medical' node scripts/import/sync.mjs  (Google Drive for desktop copy; Drive ids come
//        from import/copy-jobs.json + copy-log.jsonl, the log of the approved copy job; no token needed)
//    or: LOCAL_ROOT='G:/My Drive/2.2 Family Files' LOCAL_PATH_IDS=1 node scripts/import/sync.mjs  (a file with no Drive id gets local:<hash of its path>)
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { classifyPath } from './folders.mjs'
import { buildMatcher, matchPerson } from './family.mjs'
import { classifyType, dateFrom, walk } from './lib.mjs'

const GOOGLE_DOC = 'application/vnd.google-apps.document'

/** Why a walked file is not downloaded, or null. Picasa folders (SKIP_RE) never reach here; they are only counted. */
export function skipReason(row) {
  if (/\.ini$/i.test(row.name)) return 'ini'
  if (/\.picasaoriginals/i.test(row.path)) return 'picasa'
  if (row.mime.startsWith('application/vnd.google-apps.') && row.mime !== GOOGLE_DOC) return 'google_apps_type'
  if (row.size != null && Number(row.size) === 0) return 'zero_byte'
  return null
}

/** walk() row -> manifest entry. */
export function toEntry(row) {
  return {
    drive_file_id: row.file_id,
    name: row.name,
    mime: row.mime,
    size: row.size == null ? null : Number(row.size),
    modified: row.modified,
    md5: row.md5 ?? null,
    path: row.path,
    person_folder: row.path.includes('/') ? row.path.split('/')[0] : '',
    kind_guess: row.type || classifyType(row.path),
    date_guess: row.date || dateFrom(row.path),
    lane: row.lane ?? classifyPath(row.path.split('/')).lane,
    skipped: skipReason(row)
  }
}

/** Incremental: a file is downloaded again only when it is new, changed, or its local copy is gone. */
export function needsDownload(entry, prev, fileExists) {
  if (entry.skipped || entry.lane === 'document_only') return false // document_only files are registered, never read
  return !(prev && prev.modified === entry.modified && prev.sha256 && fileExists)
}

/** An unchanged file keeps what the last run learned (hash, and the PDF type of an exported Google Doc). */
export function carryOver(entry, prev) {
  entry.sha256 = prev.sha256
  if (prev.stored_mime) entry.stored_mime = prev.stored_mime
  return entry
}

/** Deep-scan any JSON for {drive_file_id, sha256} rows (the CLI's JSON shape is not fixed). */
export function knownRows(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => knownRows(x, out))
  else if (v && typeof v === 'object') {
    if (typeof v.drive_file_id === 'string' && typeof v.sha256 === 'string') out.push({ drive_file_id: v.drive_file_id, sha256: v.sha256 })
    else Object.values(v).forEach((x) => knownRows(x, out))
  }
  return out
}

/** A file already in the database (same sha256) keeps its existing id, so a re-import upserts instead of duplicating. */
export function knownId(entry, known) {
  const id = entry.sha256 ? known.get(entry.sha256) : undefined
  return id && id !== entry.drive_file_id ? id : null
}

/** Identical sha256: the oldest (modified, then id) is kept; the rest point at it. */
export function markDuplicates(entries) {
  const groups = new Map()
  for (const e of entries) {
    e.duplicate_of = null
    if (e.skipped || !e.sha256) continue
    groups.set(e.sha256, [...(groups.get(e.sha256) ?? []), e])
  }
  for (const g of groups.values()) {
    g.sort((a, b) => String(a.modified).localeCompare(String(b.modified)) || a.drive_file_id.localeCompare(b.drive_file_id))
    for (const dup of g.slice(1)) dup.duplicate_of = g[0].drive_file_id
  }
  return entries
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** Drive v3 list with paging. */
export function driveLister(token, fetchImpl = fetch) {
  const auth = { Authorization: `Bearer ${token}` }
  return async (folderId) => {
    const out = []
    let pageToken = ''
    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
      const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum)')
      const r = await fetchImpl(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: auth })
      if (!r.ok) throw Object.assign(new Error('Drive list failed'), { status: r.status })
      const j = await r.json()
      for (const f of j.files ?? []) out.push({ id: f.id, name: f.name, mime: f.mimeType, size: f.size ?? null, modified: f.modifiedTime ?? null, md5: f.md5Checksum ?? null })
      pageToken = j.nextPageToken ?? ''
    } while (pageToken)
    return out
  }
}

const EXT_MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

/** Stable id for a local file with no Drive id (the family folder): a hash of its relative path, so no name reaches the database. */
export const localPathId = (rel) => `local:${createHash('sha256').update(rel).digest('hex').slice(0, 32)}`

/** Counts by lane and skip reason, plus per person index when a people-map is given. No names. */
export function dryRunCounts(entries, peopleMap = {}) {
  const m = buildMatcher(peopleMap)
  const ids = new Map()
  const out = { files: entries.length, by_lane: {}, skipped: {}, by_person_lane: {}, unassigned: 0 }
  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
  for (const e of entries) {
    if (e.skipped) bump(out.skipped, e.skipped)
    bump(out.by_lane, e.lane ?? 'none')
    const { id } = matchPerson(m, { segments: e.path.split('/').slice(0, -1), printed: null })
    if (!id) { out.unassigned++; continue }
    if (!ids.has(id)) ids.set(id, `p${ids.size + 1}`)
    bump((out.by_person_lane[ids.get(id)] ??= {}), e.lane ?? 'none')
  }
  return out
}

/** Lister over a local Drive-for-desktop folder. A file's id is its Drive id from the copy log, or null (then skipped). */
export function localLister(idByRel, root, pathIds = false) {
  const rel = (p) => p.slice(root.length + 1).split(/[\\/]/).join('/')
  return async (dir) => readdirSync(dir, { withFileTypes: true }).map((d) => {
    const full = join(dir, d.name)
    if (d.isDirectory()) return { id: full, name: d.name, mime: 'application/vnd.google-apps.folder' }
    const st = statSync(full)
    return { id: idByRel.get(rel(full)) ?? (pathIds ? localPathId(rel(full)) : `local-unmatched:${rel(full)}`), name: d.name, mime: EXT_MIME[extname(d.name).toLowerCase()] ?? 'application/octet-stream',
      size: st.size, modified: st.mtime.toISOString(), md5: null, _full: full }
  })
}

/** person/year/title -> new Drive id, from the approved copy job and its log. */
export function idsFromCopyLog(jobs, log) {
  const newBySrc = new Map(log.filter((l) => l.status === 'copied').map((l) => [l.src, l.new_id]))
  return new Map(jobs.filter((j) => newBySrc.has(j.src)).map((j) => [[...j.folder, j.title].join('/'), newBySrc.get(j.src)]))
}

async function download(entry, token) {
  const auth = { Authorization: `Bearer ${token}` }
  const base = `https://www.googleapis.com/drive/v3/files/${entry.drive_file_id}`
  const url = entry.mime === GOOGLE_DOC ? `${base}/export?mimeType=application%2Fpdf` : `${base}?alt=media`
  const r = await fetch(url, { headers: auth })
  if (!r.ok) throw Object.assign(new Error('Drive download failed'), { status: r.status })
  return Buffer.from(await r.arrayBuffer())
}

async function main(env = process.env) {
  const local = env.LOCAL_ROOT
  if (!local && (!env.DRIVE_ACCESS_TOKEN || !env.DRIVE_ROOT_ID)) throw Object.assign(new Error('DRIVE_ACCESS_TOKEN and DRIVE_ROOT_ID must be set'), { code: 'missing_env' })
  const pathById = new Map()
  let lister = local ? null : driveLister(env.DRIVE_ACCESS_TOKEN)
  if (local) {
    const haveLog = existsSync('import/copy-jobs.json') && existsSync('import/copy-log.jsonl')
    const jobs = haveLog ? JSON.parse(readFileSync('import/copy-jobs.json', 'utf8')) : []
    const log = !haveLog ? [] : readFileSync('import/copy-log.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
    const base = localLister(idsFromCopyLog(jobs, log), local, env.LOCAL_PATH_IDS === '1')
    lister = async (dir) => { const items = await base(dir); for (const i of items) if (i._full) pathById.set(i.id, i._full); return items }
  }
  const dryRun = process.argv.includes('--dry-run')
  if (!dryRun) mkdirSync('import/files', { recursive: true })
  const prevByid = new Map()
  if (existsSync('import/manifest.json')) for (const e of JSON.parse(readFileSync('import/manifest.json', 'utf8')).files) prevByid.set(e.drive_file_id, e)

  let folderSkips = 0
  const rows = await walk(lister, local ?? env.DRIVE_ROOT_ID, [], () => folderSkips++)
  const entries = rows.map(toEntry)
  if (dryRun) { // list and classify only: nothing is downloaded or written
    const peopleMap = existsSync('import/people-map.json') ? JSON.parse(readFileSync('import/people-map.json', 'utf8')) : {}
    console.log(JSON.stringify({ dry_run: true, skipped_folder_or_file_rules: folderSkips, ...dryRunCounts(entries, peopleMap) }))
    return
  }
  const n = { downloaded: 0, unchanged: 0, failed: 0 }
  // .scratch/known.json: [{drive_file_id, sha256}] already in public.source_files (records-import.ps1 writes it)
  const known = new Map(existsSync('.scratch/known.json') ? knownRows(JSON.parse(readFileSync('.scratch/known.json', 'utf8'))).map((r) => [r.sha256, r.drive_file_id]) : [])
  for (const e of entries) {
    const prev = prevByid.get(e.drive_file_id)
    const dest = `import/files/${e.drive_file_id}`
    if (!e.skipped && e.drive_file_id.startsWith('local-unmatched:')) e.skipped = 'no_drive_id'
    if (e.skipped) continue
    if (!needsDownload(e, prev, existsSync(dest))) {
      carryOver(e, prev)
      n.unchanged++
      continue
    }
    try {
      const buf = local ? readFileSync(pathById.get(e.drive_file_id)) : await download(e, env.DRIVE_ACCESS_TOKEN)
      if (buf.length === 0) { e.skipped = 'zero_byte'; continue }
      writeFileSync(dest, buf)
      e.sha256 = sha256(buf)
      e.size = buf.length
      const kid = knownId(e, known)
      if (kid) { renameSync(dest, `import/files/${kid}`); e.drive_file_id = kid }
      if (e.mime === GOOGLE_DOC) e.stored_mime = 'application/pdf'
      n.downloaded++
    } catch (err) {
      e.skipped = null
      e.download_failed = true
      n.failed++
      console.error(`download failed${err?.status ? ` (${err.status})` : ''}`) // never the message
    }
  }
  markDuplicates(entries)
  writeFileSync('import/manifest.json', JSON.stringify({ synced_at: new Date().toISOString(), folder_skips: folderSkips, files: entries }, null, 2))
  const by = (f) => entries.filter(f).length
  console.log(JSON.stringify({ files: entries.length, ...n, skipped_folder_or_file_rules: folderSkips, skipped_files: by((e) => e.skipped), duplicates: by((e) => e.duplicate_of) }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => {
  // name, HTTP status and our own codes only: never the message (it could hold a file name)
  console.error(`sync failed: ${e?.name ?? 'Error'}${e?.status ? ` (HTTP ${e.status})` : ''}${e?.code ? ` (${e.code})` : ''}`)
  process.exit(1)
})
