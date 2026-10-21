// Pure parts of the records-extract Edge Function, free of Deno APIs so Vitest can test them (no network, fake port).
// A TypeScript port of the laptop import: scripts/import/lib.mjs (PROMPT, buildRequest, sendToOpenRouter), extract.mjs
// (withRetry, normalizeDraft), normalize.mjs (lab value normalisers) and load.mjs (draft -> rows). records-extract.test.ts
// checks this file against those scripts, so a change there that is not made here fails the tests.
// Differences, all deliberate:
// * Every row is a draft. A phone scan is never auto-confirmed (no confidence gate, no confirmed_source).
// * The person is the one the app chose (documents.person_id); there is no folder or printed-name matching.
// * Pages go to the model in one request, in page order. A PDF is sent as a file (no local text layer: the native scanner's
//   PDFs are pictures), so every scan is read by vision, like a handwritten paper on the laptop.
// * The test catalog comes from public.test_catalog at run time (the laptop uses the JSON mirror of the same seed).
// B-7: nothing here logs. The caller logs ids and counts only, never document text, names or values.

export const DEFAULT_MODEL = 'google/gemini-3.5-flash-lite' // scripts/records-import.ps1
export const DEFAULT_FALLBACK_MODEL = 'anthropic/claude-haiku-5.5'
export const MAX_PAGES = 10
export const MAX_PAGE_BYTES = 10 * 1024 * 1024 // one page or one PDF
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024 // all pages of one document (base64 makes the request about 4/3 of this)
export const SWEEP_LIMIT = 3
const CARD_KINDS = ['id_card', 'insurance_card']
const KINDS = ['lab', 'prescription', 'lab_request', 'imaging', 'vaccination', 'insurance', 'certificate', 'other']

// ---------- request (lib.mjs) ----------
export const PROMPT =
  'Read this medical document. Return only JSON: {"doc_kind":"lab|prescription|lab_request|imaging|vaccination|insurance|certificate|other","doc_date","collected_at","released_at","facility","patient_name_as_printed",' +
  '"tests":[{"panel","name","value","unit","flag","ref_low","ref_high","ref_text"}],' +
  '"rx":{"date","prescriber","follow_up","lines":[{"line_no","drug","strength","form","dose","frequency","duration","quantity","instructions","unclear","bbox"}]},' +
  '"imaging":{"modality","body_region","findings","impression","measurements"},' +
  '"vaccinations":[{"vaccine","dose_no","given_on","facility","lot"}],"allergies":["substance"],"conditions":["diagnosis"],"confidence":0..1}. ' +
  'allergies and conditions only when the document states them outright (a printed diagnosis or allergy line); otherwise empty lists. ' +
  'Dates as YYYY-MM-DD, timestamps ISO 8601. Use null for anything not printed. Copy exactly as printed; never interpret, convert or correct. Set unclear true for handwriting you cannot read with confidence.'

export interface PagePart { mime: string; base64: string }

/** Same part shapes as lib.mjs buildRequest: a PDF as a file, an image as image_url. */
export function pagePart(p: PagePart, filename = 'document') {
  return p.mime === 'application/pdf'
    ? { type: 'file', file: { filename, file_data: `data:${p.mime};base64,${p.base64}` } }
    : { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.base64}` } }
}

/** Health data: zero data retention, no providers that collect data, never a free tier. Pages in order after the prompt. */
export function buildRequest({ model, fallbackModel, pages, prompt = PROMPT }: { model: string; fallbackModel: string; pages: PagePart[]; prompt?: string }) {
  for (const m of [model, fallbackModel]) if (!m || /:free$/i.test(m)) throw new Error('A paid model is required (no :free tier)')
  if (pages.length === 0) throw new Error('no pages')
  return {
    model,
    models: [model, fallbackModel],
    provider: { zdr: true, data_collection: 'deny' },
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...pages.map((p, i) => pagePart(p, pages.length > 1 ? `page-${i + 1}` : 'document'))] }]
  }
}

export class HttpError extends Error {
  constructor(public status: number) { super(`OpenRouter failed: ${status}`) }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Never echo the request body (it holds the document) or the model output (health values). */
export async function sendToOpenRouter(fetchImpl: FetchLike, body: unknown, key: string): Promise<unknown> {
  const r = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(key ?? '').trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new HttpError(r.status)
  const c = (await r.json() as { choices: { message: { content: string } }[] }).choices[0].message.content
  try { return JSON.parse(c) } catch { throw new Error('not_json') }
}

/** Retry 429 / 5xx with exponential backoff (extract.mjs). Other errors are thrown at once. */
export async function withRetry<T>(fn: () => Promise<T>, { tries = 3, baseMs = 2000, sleepFn = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {}): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const s = (e as { status?: number }).status ?? 0
      const retryable = s === 429 || (s >= 500 && s < 600)
      if (!retryable || i >= tries - 1) throw e
      await sleepFn(baseMs * 2 ** i)
    }
  }
}

// ---------- draft shape (extract.mjs normalizeDraft) ----------
export interface Draft {
  doc_kind: string
  doc_date: unknown
  collected_at: unknown
  released_at: unknown
  facility: unknown
  patient_name_as_printed: unknown
  tests: Record<string, unknown>[]
  rx: (Record<string, unknown> & { lines: Record<string, unknown>[] }) | null
  imaging: Record<string, unknown> | null
  vaccinations: Record<string, unknown>[]
  allergies: string[]
  conditions: string[]
  confidence: number | null
}
const strings = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 80)))].slice(0, 10)

/** Keep only the contract shape; anything else the model added is dropped. */
export function normalizeDraft(p: unknown): Draft {
  const q = (p ?? {}) as Record<string, unknown>
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const conf = q.confidence == null ? NaN : Number(q.confidence) // null/undefined = unknown, never 0
  const rx = q.rx
  return {
    doc_kind: KINDS.includes(q.doc_kind as string) ? (q.doc_kind as string) : 'other',
    doc_date: q.doc_date ?? null,
    collected_at: q.collected_at ?? null,
    released_at: q.released_at ?? null,
    facility: q.facility ?? null,
    patient_name_as_printed: q.patient_name_as_printed ?? null,
    tests: arr(q.tests).filter(obj),
    rx: obj(rx) ? { ...rx, lines: arr(rx.lines).filter(obj) } : null,
    imaging: obj(q.imaging) ? q.imaging : null,
    vaccinations: arr(q.vaccinations).filter(obj),
    allergies: strings(q.allergies),
    conditions: strings(q.conditions),
    confidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : null
  }
}

// ---------- lab value normalisers (normalize.mjs) ----------
export interface CatalogRow { code: string; name: string; loinc?: string | null; unit: string; aliases: string[]; conversions: Record<string, number> }
const clean = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const DIFFERENTIAL = /neutrophil|lymphocyte|monocyte|eosinophil|basophil|segmenter|band/i

export function matchTest(name: unknown, catalog: CatalogRow[]): string | null {
  const n = clean(name).replace(/[.:]+$/g, '')
  if (!n || DIFFERENTIAL.test(n)) return null
  for (const c of catalog) if (c.code === n || clean(c.name) === n || c.aliases.includes(n)) return c.code
  return null
}

const UNITS = new Map(
  ['mg/dL', 'g/dL', 'g/L', 'mmol/L', 'umol/L', 'U/L', 'IU/L', 'mIU/L', 'uIU/mL', '%', 'L/L', 'x10^9/L', 'x10^12/L', 'mL/min/1.73 m2', 'mmol/mol', 'ng/mL', 'mEq/L', 'fL', 'pg']
    .map((u) => [u.toLowerCase().replace(/\s+/g, ''), u])
)

export function normalizeUnit(u: unknown): string | null {
  let k = String(u ?? '').toLowerCase().replace(/[\s_]+/g, '').replace(/[µμ]/g, 'u').replace(/\*/g, '^').replace(/e(9|12)\//, '^$1/')
  if (!k) return null
  k = k.replace(/^x?10\^(\d+)/, 'x10^$1').replace(/^(?:k|x10\^3)\/ul$/, 'x10^9/l').replace(/^10\^3\/ul$/, 'x10^9/l')
  k = k.replace(/^ml\/min\/1\.73m\^?2$/, 'ml/min/1.73m2')
  return UNITS.get(k) ?? null
}

export function toCanonical(value: unknown, unitRaw: unknown, code: string, catalog: CatalogRow[]): number | null {
  const c = catalog.find((r) => r.code === code)
  const u = normalizeUnit(unitRaw)
  if (!c || !u || typeof value !== 'number' || !Number.isFinite(value)) return null
  if (u === c.unit) return value
  const f = c.conversions?.[u]
  return typeof f === 'number' ? Number((value * f).toPrecision(10)) : null
}

export function parseNumber(v: unknown): { value_num: number | null; value_text: string | null } {
  if (v == null || v === '') return { value_num: null, value_text: null }
  if (typeof v === 'number') return Number.isFinite(v) ? { value_num: v, value_text: null } : { value_num: null, value_text: String(v) }
  const s = String(v).trim()
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return { value_num: Number(s), value_text: null }
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return { value_num: Number(s.replaceAll(',', '')), value_text: null }
  return { value_num: null, value_text: s || null }
}

export function normalizeFlag(f: unknown): 'H' | 'L' | 'N' | 'A' | null {
  const s = clean(f).replace(/[.()]/g, '')
  if (/^(h|hh|high|↑|↑↑|\^|critical high|hi)$/.test(s)) return 'H'
  if (/^(l|ll|low|↓|↓↓|critical low|lo)$/.test(s)) return 'L'
  if (/^(n|normal|wnl|within normal limits)$/.test(s)) return 'N'
  if (/^(a|abnormal|\*|positive|reactive)$/.test(s)) return 'A'
  return null
}

export function normalizeTest(t: Record<string, unknown>, catalog: CatalogRow[]) {
  const { value_num, value_text } = parseNumber(t.value)
  const test_code = matchTest(t.name, catalog)
  return {
    panel: (t.panel ?? null) as unknown,
    name_raw: String(t.name ?? '').trim(),
    test_code,
    value_num,
    value_text,
    unit_raw: (t.unit ?? null) as unknown,
    value_canonical: test_code && value_num != null ? toCanonical(value_num, t.unit, test_code, catalog) : null,
    flag: normalizeFlag(t.flag),
    ref_low: parseNumber(t.ref_low).value_num,
    ref_high: parseNumber(t.ref_high).value_num,
    ref_text: (t.ref_text ?? null) as unknown
  }
}
export const nameKey = (s: unknown) => clean(s).replace(/[.,]/g, '').replace(/\s+/g, ' ')

// ---------- ids (load.mjs uuid5, same namespace) ----------
const NS = '7d1b6f0e-4c2a-5b8e-9a3d-1f0c5e7a2b64'
/** RFC 4122 v5 (sha1). Stable ids make a re-run a no-op (insert .. on conflict (id) do nothing). */
export async function uuid5(name: string, ns = NS): Promise<string> {
  const nsBytes = new Uint8Array(ns.replaceAll('-', '').match(/../g)!.map((h) => parseInt(h, 16)))
  const nameBytes = new TextEncoder().encode(name)
  const buf = new Uint8Array(nsBytes.length + nameBytes.length)
  buf.set(nsBytes)
  buf.set(nameBytes, nsBytes.length)
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', buf))
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = [...h.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

// ---------- draft -> rows (load.mjs buildLoadSql, health lane, drafts only) ----------
const str = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const date = (v: unknown) => {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s) ? s : null
}
/** Timestamps without a zone are Manila time (+08:00), never the database session zone. */
const ts = (v: unknown) => {
  let s = str(v)
  if (!s || !/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return null
  if (s.length === 10) s += 'T00:00:00'
  s = s.replace(' ', 'T')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += '+08:00'
  return Number.isNaN(Date.parse(s)) ? null : s
}
const int = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null)
const conf = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null)
function modality(m: unknown) {
  const s = String(m ?? '').toLowerCase()
  if (/ultra|sono|usg/.test(s)) return 'ultrasound'
  if (/x-?ray|radiograph|cxr/.test(s)) return 'xray'
  if (/\bct\b|computed/.test(s)) return 'ct'
  if (/mri|magnetic/.test(s)) return 'mri'
  if (/ecg|ekg|electrocardio/.test(s)) return 'ecg'
  if (/echo/.test(s)) return 'echo'
  return s ? 'other' : null
}

/** Insert order matters (foreign keys): panels before results, prescriptions before their lines. */
export const TABLES = ['lab_panels', 'lab_results', 'prescriptions', 'prescription_items', 'imaging_reports', 'vaccinations', 'allergies', 'conditions'] as const
export type Table = (typeof TABLES)[number]
export type Row = Record<string, unknown>

export interface Mapped {
  document: Row // patch for the existing draft documents row
  rows: Record<Table, Row[]>
}

/**
 * One normalised draft -> the rows load.mjs would write for a health-lane paper, every one a draft.
 * kind: the app's choice wins (lab, prescription); 'other' takes what the model read. created_by: the uploader, so the
 * rows show who they came from (the service role has no auth.uid()).
 */
export async function mapDraft({ documentId, personId, createdBy, kind, draft: d, catalog }: { documentId: string; personId: string; createdBy: string | null; kind: string; draft: Draft; catalog: CatalogRow[] }): Promise<Mapped> {
  const rows = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as Record<Table, Row[]>
  const k = `scan:${documentId}` // the laptop keys rows by drive_file_id; a scan by its document
  const base = { person_id: personId, confidence: conf(d.confidence), status: 'draft', created_by: createdBy }
  const put = (t: Table, row: Row) => rows[t].push({ ...row, ...base })
  const document: Row = {
    kind: kind === 'other' || !KINDS.includes(kind) ? d.doc_kind ?? 'other' : kind,
    doc_date: date(d.doc_date), collected_at: ts(d.collected_at), released_at: ts(d.released_at), facility: str(d.facility),
    confidence: conf(d.confidence)
  }

  const panels = new Map<unknown, string>()
  for (const [i, raw] of (d.tests ?? []).entries()) {
    const t = normalizeTest(raw, catalog)
    if (t.value_num == null && t.value_text == null) continue
    let panelId: string | null = null
    if (t.panel) {
      if (!panels.has(t.panel)) {
        panels.set(t.panel, await uuid5(`panel:${k}:${panels.size}`))
        put('lab_panels', { id: panels.get(t.panel), document_id: documentId, name: str(t.panel) })
      }
      panelId = panels.get(t.panel)!
    }
    put('lab_results', {
      id: await uuid5(`lab:${k}:${i}`), document_id: documentId, panel_id: panelId, test_code: t.test_code, name_raw: t.name_raw,
      value_num: t.value_num, value_text: t.value_text, unit_raw: str(t.unit_raw), value_canonical: t.value_canonical, flag: t.flag,
      ref_low: t.ref_low, ref_high: t.ref_high, ref_text: str(t.ref_text), collected_at: ts(d.collected_at) // null: the 0008 trigger falls back to the document date
    })
  }

  const rx = d.rx
  if (rx && ((rx.lines ?? []).length || rx.date)) {
    const rxId = await uuid5(`rx:${k}`)
    put('prescriptions', { id: rxId, document_id: documentId, rx_date: date(rx.date ?? d.doc_date), prescriber: str(rx.prescriber), follow_up_on: date(rx.follow_up) })
    const used = new Set<number>()
    for (const [i, l] of (rx.lines ?? []).entries()) {
      let no = int(l.line_no)
      if (!no || used.has(no)) no = i + 1
      while (used.has(no)) no++
      used.add(no)
      put('prescription_items', {
        id: await uuid5(`rxi:${k}:${i}`), prescription_id: rxId, line_no: no, drug_raw: str(l.drug), strength: str(l.strength), form: str(l.form),
        dose: str(l.dose), frequency: str(l.frequency), duration: str(l.duration), quantity: str(l.quantity), instructions: str(l.instructions),
        crop: l.bbox && typeof l.bbox === 'object' ? l.bbox : null, unclear: l.unclear === true
      })
    }
  }

  const im = d.imaging
  if (im && (str(im.findings) || str(im.impression) || str(im.modality))) {
    put('imaging_reports', {
      id: await uuid5(`img:${k}`), document_id: documentId, modality: modality(im.modality), body_region: str(im.body_region), findings: str(im.findings),
      impression: str(im.impression), measurements: im.measurements ?? null, reported_at: ts(d.released_at) ?? date(d.doc_date)
    })
  }

  for (const [i, v] of (d.vaccinations ?? []).entries()) {
    if (!str(v.vaccine)) continue
    put('vaccinations', {
      id: await uuid5(`vax:${k}:${i}`), document_id: documentId, vaccine: str(v.vaccine), dose_no: int(v.dose_no), given_on: date(v.given_on),
      facility: str(v.facility), lot: str(v.lot)
    })
  }

  // one row per person + text, same id as the laptop import, so the same allergy from both routes is one row
  for (const [table, col, list] of [['allergies', 'substance', d.allergies], ['conditions', 'name', d.conditions]] as const) {
    const seen = new Set<string>()
    for (const text of (Array.isArray(list) ? list : []).map(str).filter((x): x is string => !!x).slice(0, 10)) {
      const key = `${table}:${personId}:${nameKey(text)}`
      if (seen.has(key)) continue
      seen.add(key)
      put(table, { id: await uuid5(`${table.slice(0, 3)}:${key}`), [col]: text.slice(0, 80) })
    }
  }
  return { document, rows }
}

// ---------- pages ----------
export interface PageRow { id: string; page_no: number | null; name: string | null; mime: string; size_bytes: number | null; storage_path: string | null }

/** Pages in order (page_no, then name), with the limits applied. Returns a short error code instead of throwing. */
export function orderPages(pages: PageRow[]): { pages: PageRow[] } | { error: string } {
  const list = pages.filter((p) => p.storage_path)
  if (list.length === 0) return { error: 'no_pages' }
  if (list.length > MAX_PAGES) return { error: 'too_many_pages' }
  if (list.some((p) => p.mime !== 'application/pdf' && !String(p.mime).startsWith('image/'))) return { error: 'unsupported_mime' }
  if (list.some((p) => (p.size_bytes ?? 0) > MAX_PAGE_BYTES)) return { error: 'too_large' }
  if (list.reduce((n, p) => n + (p.size_bytes ?? 0), 0) > MAX_TOTAL_BYTES) return { error: 'too_large' }
  const sorted = [...list].sort((a, b) => (a.page_no ?? 1) - (b.page_no ?? 1) || String(a.name ?? '').localeCompare(String(b.name ?? '')))
  return { pages: sorted }
}

/** Base64 without Buffer (Deno and Node both have btoa). Chunked so a 10 MB page does not overflow the call stack. */
export function toBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Error -> short code for source_files.ingest_error (^[a-z0-9_]{1,40}$). Never a message from the model or the document. */
export function errorCode(e: unknown): string {
  if (e instanceof HttpError) return `openrouter_${e.status}`
  const m = (e as { message?: string })?.message ?? ''
  return /^[a-z0-9_]{1,40}$/.test(m) ? m : 'failed'
}

// ---------- the run ----------
export interface DocRow { id: string; person_id: string; kind: string; status: string; created_by: string | null }
export interface Port {
  claim(documentId: string): Promise<number>
  due(limit: number): Promise<string[]>
  document(documentId: string): Promise<DocRow | null>
  pages(documentId: string): Promise<PageRow[]>
  download(path: string): Promise<Uint8Array | null>
  catalog(): Promise<CatalogRow[]>
  /** insert, on conflict (id) do nothing. Throws on any other error. */
  insert(table: Table, rows: Row[]): Promise<void>
  updateDocument(documentId: string, patch: Row): Promise<void>
  finish(documentId: string, status: 'queued' | 'failed', error: string | null): Promise<void>
  read(body: unknown): Promise<unknown> // OpenRouter, with retries
}
export interface Env { model: string; fallbackModel: string }
export interface Result { document_id: string; status: 'queued' | 'failed' | 'skipped'; error?: string; pages?: number; rows?: Partial<Record<Table, number>> }

/** Read one claimed document and write its drafts. Always leaves the pages 'queued' or 'failed'. Returns ids and counts only. */
export async function extractDocument(port: Port, documentId: string, env: Env): Promise<Result> {
  const fail = async (error: string, pages?: number): Promise<Result> => {
    await port.finish(documentId, 'failed', error)
    return { document_id: documentId, status: 'failed', error, pages }
  }
  try {
    const doc = await port.document(documentId)
    if (!doc || doc.status !== 'draft' || CARD_KINDS.includes(doc.kind)) return await fail('not_a_scan')
    const ordered = orderPages(await port.pages(documentId))
    if ('error' in ordered) return await fail(ordered.error)
    // the service role reads storage: only pages under this person's own folder (a row could point at another person's file)
    if (ordered.pages.some((p) => !p.storage_path!.startsWith(`${doc.person_id}/`))) return await fail('bad_path')
    const parts: PagePart[] = []
    let total = 0
    for (const p of ordered.pages) {
      const bytes = await port.download(p.storage_path!)
      if (!bytes) return await fail('download', ordered.pages.length)
      total += bytes.length
      if (bytes.length > MAX_PAGE_BYTES || total > MAX_TOTAL_BYTES) return await fail('too_large', ordered.pages.length)
      parts.push({ mime: p.mime, base64: toBase64(bytes) })
    }
    const body = buildRequest({ model: env.model, fallbackModel: env.fallbackModel, pages: parts })
    parts.length = 0 // let the page copies go before the model call returns
    const draft = normalizeDraft(await port.read(body))
    const mapped = await mapDraft({ documentId, personId: doc.person_id, createdBy: doc.created_by, kind: doc.kind, draft, catalog: await port.catalog() })
    await port.updateDocument(documentId, mapped.document)
    const rows: Partial<Record<Table, number>> = {}
    for (const t of TABLES) {
      if (!mapped.rows[t].length) continue
      await port.insert(t, mapped.rows[t])
      rows[t] = mapped.rows[t].length
    }
    await port.finish(documentId, 'queued', null)
    return { document_id: documentId, status: 'queued', pages: ordered.pages.length, rows }
  } catch (e) {
    return await fail(errorCode(e)).catch(() => ({ document_id: documentId, status: 'failed' as const, error: errorCode(e) }))
  }
}

/** Claim then read. 'skipped' when there was nothing to claim (pages missing, already read, or being read by another run). */
export async function runOne(port: Port, documentId: string, env: Env): Promise<Result> {
  const n = await port.claim(documentId)
  if (n === 0) return { document_id: documentId, status: 'skipped' }
  return extractDocument(port, documentId, env)
}

/** Cron sweep: up to `limit` draft scans that waited 2 minutes, one after another. */
export async function runSweep(port: Port, env: Env, limit = SWEEP_LIMIT): Promise<Result[]> {
  const out: Result[] = []
  for (const id of await port.due(limit)) out.push(await runOne(port, id, env))
  return out
}

/** Counts only, for the log line (B-7). */
export const summary = (rs: Result[]) => ({
  documents: rs.length,
  queued: rs.filter((r) => r.status === 'queued').length,
  failed: rs.filter((r) => r.status === 'failed').length,
  skipped: rs.filter((r) => r.status === 'skipped').length,
  errors: rs.flatMap((r) => (r.error ? [r.error] : []))
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Request body -> the single document to read, 'sweep' for an empty body, or null for anything else. */
export function parseBody(raw: string): { documentId: string } | 'sweep' | null {
  if (raw.length > 2048) return null
  if (!raw.trim()) return 'sweep'
  let b: unknown
  try { b = JSON.parse(raw) } catch { return null }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const id = (b as Record<string, unknown>).document_id
  if (id == null) return Object.keys(b).length === 0 ? 'sweep' : null
  return typeof id === 'string' && UUID.test(id) ? { documentId: id.toLowerCase() } : null
}
