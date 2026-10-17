// Extract one file via paid OpenRouter (zdr, no data collection). Run only with Lloyd present.
// Usage: node scripts/import/extract.mjs <fileId> <person> <date> <type> --i-am-lloyd
import { mkdirSync, writeFileSync } from 'node:fs'
import { assertAllowed, buildRequest, sendToOpenRouter } from './lib.mjs'

const args = process.argv.slice(2)
assertAllowed(args, process.env)
const [fileId, person, date, type] = args.filter((a) => !a.startsWith('--'))
if (!fileId || !person || !type) throw new Error('Usage: extract.mjs <fileId> <person> <date> <type> --i-am-lloyd')
if (!process.env.DRIVE_ACCESS_TOKEN) throw new Error('DRIVE_ACCESS_TOKEN is not set')

const auth = { Authorization: `Bearer ${process.env.DRIVE_ACCESS_TOKEN}` }
const ok = (r) => { if (!r.ok) throw new Error(`Drive failed: ${r.status}`); return r }
const meta = await ok(await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, { headers: auth })).json()
const buf = Buffer.from(await ok(await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: auth })).arrayBuffer())

const body = buildRequest({
  model: process.env.OPENROUTER_MODEL,
  fallbackModel: process.env.OPENROUTER_FALLBACK_MODEL,
  mime: meta.mimeType,
  base64: buf.toString('base64'),
  filename: meta.name
})
const parsed = await sendToOpenRouter(fetch, body, process.env.OPENROUTER_API_KEY)
const dir = `import/${person}`
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/${date || 'undated'}-${type}.json`, JSON.stringify({ source_file_id: fileId, date, type, ...parsed }, null, 2))
console.log('written')
