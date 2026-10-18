// Batch extraction via paid OpenRouter (zdr, no data collection). Run only with Lloyd present.
// Usage: node scripts/import/extract.mjs --i-am-lloyd [--limit N] [--delay MS]
// Reads import/manifest.json + import/files/<id>; writes import/drafts/<id>.json. Prints counts only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { assertAllowed, buildRequest, sendToOpenRouter } from './lib.mjs'

const KINDS = ['lab', 'prescription', 'lab_request', 'imaging', 'vaccination', 'insurance', 'certificate', 'other']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A scanned PDF has a text layer with little or nothing in it. */
export const hasRealText = (t) => (String(t ?? '').match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 120

/** Local text layer via pdf.js (legacy build, Node). Returns '' when unreadable. */
export async function extractPdfText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 })
  try {
    const doc = await task.promise
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent()
      pages.push(c.items.map((x) => x.str ?? '').join(' '))
    }
    return pages.join('\n\n')
  } finally {
    await task.destroy() // pdfjs 6: destroy lives on the loading task
  }
}

/** Retry 429 / 5xx with exponential backoff. Other errors are thrown at once. */
export async function withRetry(fn, { tries = 5, baseMs = 2000, sleepFn = sleep } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const retryable = e.status === 429 || (e.status >= 500 && e.status < 600)
      if (!retryable || i >= tries - 1) throw e
      await sleepFn(baseMs * 2 ** i)
    }
  }
}

/** Keep only the contract shape; anything else the model added is dropped. */
export function normalizeDraft(p) {
  const arr = (v) => (Array.isArray(v) ? v : [])
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
  const conf = Number(p?.confidence)
  return {
    doc_kind: KINDS.includes(p?.doc_kind) ? p.doc_kind : 'other',
    doc_date: p?.doc_date ?? null,
    collected_at: p?.collected_at ?? null,
    released_at: p?.released_at ?? null,
    facility: p?.facility ?? null,
    patient_name_as_printed: p?.patient_name_as_printed ?? null,
    tests: arr(p?.tests).filter(obj),
    rx: obj(p?.rx) ? { ...p.rx, lines: arr(p.rx.lines).filter(obj) } : null,
    imaging: obj(p?.imaging),
    vaccinations: arr(p?.vaccinations).filter(obj),
    confidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : null
  }
}

/** Files still needing a draft. Skipped, duplicate and never-downloaded files are left out. */
export const pending = (manifest, hasDraft, hasFile) =>
  manifest.files.filter((e) => !e.skipped && !e.duplicate_of && !e.download_failed && !hasDraft(e.drive_file_id) && hasFile(e.drive_file_id))

/** One file -> draft object, or {failed:true,...} for types we cannot read. Throws on API failure. */
export async function extractOne(e, buf, { env, fetchImpl = fetch, retry = {}, stats = { text_layer_errors: 0 } }) {
  const mime = e.stored_mime ?? e.mime
  const isPdf = mime === 'application/pdf'
  if (!isPdf && !mime.startsWith('image/')) return { failed: true, reason: 'unsupported_mime' }
  let text
  if (isPdf) {
    try {
      const t = await extractPdfText(buf)
      if (hasRealText(t)) text = t
    } catch {
      stats.text_layer_errors++ // count only; the file still goes as vision
    }
  }
  const body = buildRequest({
    model: env.OPENROUTER_MODEL,
    fallbackModel: env.OPENROUTER_FALLBACK_MODEL,
    mime,
    base64: text == null ? buf.toString('base64') : undefined,
    filename: 'document',
    text
  })
  const parsed = await withRetry(() => sendToOpenRouter(fetchImpl, body, env.OPENROUTER_API_KEY, () => {}), retry)
  return { source_file_id: e.drive_file_id, via: text == null ? 'vision' : 'text', ...normalizeDraft(parsed) }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  assertAllowed(argv, env)
  const opt = (name, d) => Number(argv[argv.indexOf(name) + 1]) || d
  const limit = opt('--limit', Infinity)
  const delay = opt('--delay', 600)
  const manifest = JSON.parse(readFileSync('import/manifest.json', 'utf8'))
  mkdirSync('import/drafts', { recursive: true })
  const todo = pending(manifest, (id) => existsSync(`import/drafts/${id}.json`), (id) => existsSync(`import/files/${id}`)).slice(0, limit)
  const n = { todo: todo.length, done_text: 0, done_vision: 0, unsupported: 0, failed: 0 }
  const stats = { text_layer_errors: 0 }
  for (const e of todo) {
    try {
      const d = await extractOne(e, readFileSync(`import/files/${e.drive_file_id}`), { env, stats })
      writeFileSync(`import/drafts/${e.drive_file_id}.json`, JSON.stringify(d, null, 2))
      if (d.failed) n.unsupported++
      else n[d.via === 'text' ? 'done_text' : 'done_vision']++
    } catch (err) {
      n.failed++ // status only, never the document or model output
      console.error(`file ${n.done_text + n.done_vision + n.unsupported + n.failed}/${n.todo} failed${err.status ? ` (${err.status})` : ''}`)
    }
    await sleep(delay)
  }
  console.log(JSON.stringify({ ...n, ...stats }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(`extract failed: ${e?.name ?? 'Error'}`); process.exit(1) })
