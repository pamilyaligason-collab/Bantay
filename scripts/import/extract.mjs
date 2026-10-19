// Batch extraction via paid OpenRouter (zdr, no data collection). Run only with Lloyd present.
// Usage: node scripts/import/extract.mjs --i-am-lloyd [--limit N] [--delay MS]
// Reads import/manifest.json + import/files/<id>; writes import/drafts/<id>.json. Prints counts only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { buildMatcher, matchPerson } from './family.mjs'
import { promptFor } from './folders.mjs'
import { assertAllowed, buildRequest, fileKey, PROMPT_IDENTITY, sendToOpenRouter } from './lib.mjs'

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

const strings = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80)))].slice(0, 10)
const CARD_KINDS = ['id_card', 'insurance_card', 'certificate', 'other']
const clip = (v, n = 300) => (typeof v === 'string' && v.trim() && !/^null$/i.test(v.trim()) ? v.trim().slice(0, n) : null)

/** Identity / insurance papers (D-68). Same rule: only the contract shape survives. id_number is kept here and nowhere else in logs. */
export function normalizeIdentity(p) {
  const conf = p?.confidence == null ? NaN : Number(p.confidence) // null/undefined = unknown, never 0
  return {
    lane: 'identity',
    doc_kind: CARD_KINDS.includes(p?.doc_kind) ? p.doc_kind : 'other',
    card_type: clip(p?.card_type, 20),
    patient_name_as_printed: clip(p?.holder_name_as_printed ?? p?.patient_name_as_printed, 120),
    birthdate: clip(p?.birthdate, 10),
    sex: clip(p?.sex, 10),
    blood_type: clip(p?.blood_type, 4),
    address: clip(p?.address),
    id_type: clip(p?.id_type, 20),
    id_number: clip(p?.id_number, 60),
    issued_on: clip(p?.issued_on, 10),
    expires_on: clip(p?.expires_on, 10),
    carrier: clip(p?.carrier, 80),
    plan: clip(p?.plan, 80),
    confidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : null
  }
}

/** Keep only the contract shape; anything else the model added is dropped. */
export function normalizeDraft(p) {
  const arr = (v) => (Array.isArray(v) ? v : [])
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
  const conf = p?.confidence == null ? NaN : Number(p.confidence) // null/undefined = unknown, never 0
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
    allergies: strings(p?.allergies),
    conditions: strings(p?.conditions),
    confidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : null
  }
}

/** Files still needing a draft. Skipped, duplicate, never-downloaded and document_only (never read) files are left out. */
export const pending = (manifest, hasDraft, hasFile, isAssigned = () => true) =>
  manifest.files.filter((e) => !e.skipped && e.lane !== 'document_only' && !e.duplicate_of && !e.download_failed && !hasDraft(e.drive_file_id) && hasFile(e.drive_file_id) && isAssigned(e))

/** True when the folder path names a known person (load.mjs can never load a file without one). */
export const assignedTo = (matcher) => (e) =>
  matchPerson(matcher, { segments: [...new Set([...(e.path ? e.path.split('/').slice(0, -1) : []), e.person_folder].filter(Boolean))], printed: null }).id != null

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
  const identity = promptFor(e.lane) === 'identity'
  const body = buildRequest({
    prompt: identity ? PROMPT_IDENTITY : undefined,
    model: env.OPENROUTER_MODEL,
    fallbackModel: env.OPENROUTER_FALLBACK_MODEL,
    mime,
    base64: text == null ? buf.toString('base64') : undefined,
    filename: 'document',
    text
  })
  const parsed = await withRetry(() => sendToOpenRouter(fetchImpl, body, env.OPENROUTER_API_KEY, () => {}), retry)
  return { source_file_id: e.drive_file_id, via: text == null ? 'vision' : 'text', ...(identity ? normalizeIdentity(parsed) : normalizeDraft(parsed)) }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  assertAllowed(argv, env)
  const opt = (name, d) => Number(argv[argv.indexOf(name) + 1]) || d
  const limit = opt('--limit', Infinity)
  const delay = opt('--delay', 600)
  const manifest = JSON.parse(readFileSync('import/manifest.json', 'utf8'))
  mkdirSync('import/drafts', { recursive: true })
  const peopleMap = existsSync('import/people-map.json') ? JSON.parse(readFileSync('import/people-map.json', 'utf8')) : {}
  const hasDraft = (id) => existsSync(`import/drafts/${fileKey(id)}.json`)
  const hasFile = (id) => existsSync(`import/files/${fileKey(id)}`)
  const all = pending(manifest, hasDraft, hasFile)
  const ready = pending(manifest, hasDraft, hasFile, assignedTo(buildMatcher(peopleMap)))
  const todo = ready.slice(0, limit)
  const n = { todo: todo.length, unassigned: all.length - ready.length, done_text: 0, done_vision: 0, unsupported: 0, failed: 0 }
  const stats = { text_layer_errors: 0 }
  for (const e of todo) {
    try {
      const d = await extractOne(e, readFileSync(`import/files/${fileKey(e.drive_file_id)}`), { env, stats })
      writeFileSync(`import/drafts/${fileKey(e.drive_file_id)}.json`, JSON.stringify(d, null, 2))
      if (d.failed) n.unsupported++
      else n[d.via === 'text' ? 'done_text' : 'done_vision']++
    } catch (err) {
      // a refused key fails every file the same way: stop now so the load step never runs on nothing
      if (err?.status === 401 || err?.status === 403) { console.error(`OpenRouter refused the key (${err.status}). Check OPENROUTER_API_KEY on openrouter.ai > Keys (enabled, credit left), then run again.`); process.exit(2) }
      n.failed++ // status only, never the document or model output
      console.error(`file ${n.done_text + n.done_vision + n.unsupported + n.failed}/${n.todo} failed${err.status ? ` (${err.status})` : ''}`)
    }
    await sleep(delay)
  }
  console.log(JSON.stringify({ ...n, ...stats }))
  if (n.failed && !n.done_text && !n.done_vision) process.exit(1) // nothing read: do not let the load step run
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(`extract failed: ${e?.name ?? 'Error'}`); process.exit(1) })
