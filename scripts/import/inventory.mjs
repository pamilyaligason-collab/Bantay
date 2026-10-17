// Metadata-only Drive walk -> import/inventory.csv. Never opens file contents.
// Usage: DRIVE_ACCESS_TOKEN=... DRIVE_ROOT_ID=... node scripts/import/inventory.mjs
// Person folder names come from import/people.json (git-ignored): ["Name One", ...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { CSV_HEADER, csvRow, walk } from './lib.mjs'

const token = process.env.DRIVE_ACCESS_TOKEN
if (!token) throw new Error('DRIVE_ACCESS_TOKEN is not set')
const root = process.env.DRIVE_ROOT_ID
if (!root) throw new Error('DRIVE_ROOT_ID is not set')
const people = JSON.parse(readFileSync('import/people.json', 'utf8'))

async function list(id) {
  const out = []
  let pageToken = ''
  do {
    const u = new URL('https://www.googleapis.com/drive/v3/files')
    u.searchParams.set('q', `'${id}' in parents and trashed = false`)
    u.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType)')
    u.searchParams.set('pageSize', '1000')
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error(`Drive list failed: ${r.status}`)
    const j = await r.json()
    out.push(...j.files.map((f) => ({ id: f.id, name: f.name, mime: f.mimeType })))
    pageToken = j.nextPageToken ?? ''
  } while (pageToken)
  return out
}

const rows = await walk(list, root, people)
mkdirSync('import', { recursive: true })
writeFileSync('import/inventory.csv', [CSV_HEADER, ...rows.map(csvRow)].join('\n') + '\n')
console.log(`inventory.csv: ${rows.length} rows`)
