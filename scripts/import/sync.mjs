// Drive -> import/manifest.json + import/files/<drive_file_id>. Read-only Drive scope; prints counts only.
// Usage: node scripts/import/sync.mjs   (env: DRIVE_ACCESS_TOKEN, DRIVE_ROOT_ID)
//    or: LOCAL_ROOT='G:/My Drive/Bantay Medical' node scripts/import/sync.mjs  (Google Drive for desktop copy; Drive ids come
//        from import/copy-jobs.json + copy-log.jsonl, the log of the approved copy job; no token needed)
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { classifyType, dateFrom, walk } from './lib.mjs'

const GOOGLE_DOC = 'application/vnd.google-apps.document'

/** Why a walked file is not downloaded, or null. Folder-level skips (SKIP_RE) never reach here; they are only counted. */
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
    skipped: skipReason(row)
  }
}

/** Incremental: a file is downloaded again only when it is new, changed, or its local copy is gone. */
export function needsDownload(entry, prev, fileExists) {
  if (entry.skipped) return false
  return !(prev && prev.modified === entry.modified && prev.sha256 && fileExists)
}

/** An unchanged file keeps what the last run learned (hash, and the PDF type of an exported Google Doc). */
export function carryOver(entry, prev) {
  entry.sha256 = prev.sha256
  if (prev.stored_mime) entry.stored_mime = prev.stored_mime
  return entry
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

/** Lister over a local Drive-for-desktop folder. A file's id is its Drive id from the copy log, or null (then skipped). */
export function localLister(idByRel, root) {
  const rel = (p) => p.slice(root.length + 1).split(/[\\/]/).join('/')
  return async (dir) => readdirSync(dir, { withFileTypes: true }).map((d) => {
    const full = join(dir, d.name)
    if (d.isDirectory()) return { id: full, name: d.name, mime: 'application/vnd.google-apps.folder' }
    const st = statSync(full)
    return { id: idByRel.get(rel(full)) ?? `local-unmatched:${rel(full)}`, name: d.name, mime: EXT_MIME[extname(d.name).toLowerCase()] ?? 'application/octet-stream',
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
    const jobs = JSON.parse(readFileSync('import/copy-jobs.json', 'utf8'))
    const log = readFileSync('import/copy-log.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
    const base = localLister(idsFromCopyLog(jobs, log), local)
    lister = async (dir) => { const items = await base(dir); for (const i of items) if (i._full) pathById.set(i.id, i._full); return items }
  }
  mkdirSync('import/files', { recursive: true })
  const prevByid = new Map()
  if (existsSync('import/manifest.json')) for (const e of JSON.parse(readFileSync('import/manifest.json', 'utf8')).files) prevByid.set(e.drive_file_id, e)

  let folderSkips = 0
  const rows = await walk(lister, local ?? env.DRIVE_ROOT_ID, [], () => folderSkips++)
  const entries = rows.map(toEntry)
  const n = { downloaded: 0, unchanged: 0, failed: 0 }
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
