import { db } from '../../db'
import { supabase } from '../auth/client'
import type { Reading } from '../health/ranges'
import { fromRow } from '../sync/tables'
import { hdb } from './store'

// Online, RLS-limited calls on the records tables (migration 0008). Never throws; never logs values (B-7).
// The client only ever sets `status`: confirmed_by / confirmed_at are stamped by a trigger from auth.uid().
export type Res<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }
type Row = Record<string, unknown> & { id: string }

export type RowTable = 'lab_results' | 'prescription_items' | 'vaccinations' | 'imaging_reports'
export type Table = RowTable | 'documents' | 'prescriptions'
export const ROW_TABLES: RowTable[] = ['lab_results', 'prescription_items', 'vaccinations', 'imaging_reports']

/** Columns a person may fix by hand. status, confirmed_*, person_id, ids are never in here. */
export const EDITABLE: Record<Table, readonly string[]> = {
  lab_results: ['name_raw', 'value_num', 'value_text', 'unit_raw', 'value_canonical', 'test_code', 'collected_at', 'flag', 'ref_low', 'ref_high'],
  prescription_items: ['drug_raw', 'generic_name', 'brand', 'strength', 'form', 'dose', 'frequency', 'duration', 'quantity', 'instructions'],
  vaccinations: ['vaccine', 'dose_no', 'given_on', 'facility', 'lot'],
  imaging_reports: ['modality', 'body_region', 'findings', 'impression', 'reported_at'],
  documents: ['doc_date', 'facility', 'title'],
  prescriptions: ['rx_date', 'prescriber', 'follow_up_on']
}

export interface SourceFile { id: string; name: string; mime: string; drive_file_id: string | null; storage_path?: string | null; side?: string | null }
export interface Doc extends Row { person_id: string; kind: string; doc_date: string | null; facility: string | null; title: string | null; status: string; confirmed_by: string | null; confirmed_at: string | null }
export interface Lab extends Row { name_raw: string; value_num: number | null; value_text: string | null; unit_raw: string | null; test_code: string | null; flag: string | null; ref_low: number | null; ref_high: number | null; ref_text: string | null; collected_at: string | null; confidence: number | null; value_canonical: number | null }
export interface RxItem extends Row { prescription_id: string; line_no: number; drug_raw: string | null; strength: string | null; dose: string | null; frequency: string | null; duration: string | null; unclear: boolean; confidence: number | null }
export interface Vaccination extends Row { vaccine: string; dose_no: number | null; given_on: string | null; confidence: number | null }
export interface Imaging extends Row { modality: string | null; body_region: string | null; impression: string | null; findings: string | null; confidence: number | null }
export interface DocBundle { doc: Doc; labs: Lab[]; items: RxItem[]; vaccinations: Vaccination[]; imaging: Imaging[]; files: SourceFile[] }
export interface CatalogTest { code: string; name: string; unit: string; conversions: Record<string, number> }
export interface Queue { total: number; byPerson: Record<string, number> }

const NO: Res<never> = { ok: false, error: 'not_connected' }
const fail = (e: unknown): Res<never> => {
  const c = (e as { code?: string } | null)?.code // codes only: messages can carry row values
  const error = c === '42501' || c === 'PGRST301' ? 'forbidden' : c && /^(22|23)/.test(c) ? 'invalid' : typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'failed'
  return { ok: false, error, code: c }
}
type Sb = NonNullable<typeof supabase>
async function run<T>(f: (s: Sb) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Res<T>> {
  if (!supabase) return NO
  try {
    const { data, error } = await f(supabase)
    return error ? fail(error) : { ok: true, data: (data ?? []) as T }
  } catch (e) {
    return fail(e)
  }
}
const none = <T,>(): Res<T[]> => ({ ok: true, data: [] })

export const driveUrl = (id: string) => (/^[\w-]+$/.test(id) ? `https://drive.google.com/file/d/${id}/view` : null)

/** Scanned papers the server is still reading: ids of draft lab/prescription/other documents whose phone-uploaded files are ingest_status 'new'. */
export async function listReading(personId?: string): Promise<Res<string[]>> {
  const r = await run<{ document_id: string | null }[]>((s) => {
    const q = s.from('source_files').select('document_id, documents!inner(status, kind)').eq('ingest_status', 'new').not('storage_path', 'is', null)
      .eq('documents.status', 'draft').in('documents.kind', ['lab', 'prescription', 'other'])
    return (personId ? q.eq('person_id', personId) : q) as unknown as PromiseLike<{ data: unknown; error: unknown }>
  })
  return r.ok ? { ok: true, data: [...new Set(r.data.map((x) => x.document_id).filter((x): x is string => !!x))] } : r
}

/** N for "To check (N)": draft rows waiting, plus draft documents that have no rows (insurance, certificate, cards...). Matches the list. */
export async function listQueue(): Promise<Res<Queue>> {
  const r = await run<{ person_id: string; kind: string; drafts: number }[]>((s) => s.from('records_queue').select('*'))
  if (!r.ok) return queueFromTables(r)
  const byPerson: Record<string, number> = {}
  for (const x of r.data.filter((x) => x.kind !== 'documents')) byPerson[x.person_id] = (byPerson[x.person_id] ?? 0) + Number(x.drafts)
  const [d, reading] = await Promise.all([bundles('draft'), listReading()])
  const unread = new Set(reading.ok ? reading.data : []) // a scan still being read has no rows yet: it is "Reading", not "To check"
  if (d.ok) {
    for (const b of d.data) if (b.labs.length + b.items.length + b.vaccinations.length + b.imaging.length === 0 && !unread.has(b.doc.id)) byPerson[b.doc.person_id] = (byPerson[b.doc.person_id] ?? 0) + 1
  } else {
    for (const x of r.data.filter((x) => x.kind === 'documents')) byPerson[x.person_id] = (byPerson[x.person_id] ?? 0) + Number(x.drafts) // list unavailable: the view's own count
  }
  return { ok: true, data: { total: Object.values(byPerson).reduce((n, v) => n + v, 0), byPerson } }
}

/** The records_queue view failed (not deployed, no grant, schema cache): count draft rows straight from the tables so the admin still sees "To check". */
async function queueFromTables(viewError: Res<never>): Promise<Res<Queue>> {
  const res = await Promise.all(ROW_TABLES.map((t) => run<{ person_id: string }[]>((s) => s.from(t).select('person_id').eq('status', 'draft').limit(5000))))
  if (res.some((x) => !x.ok)) return viewError // the tables fail too: report the view's error
  const byPerson: Record<string, number> = {}
  for (const x of res) if (x.ok) for (const row of x.data) byPerson[row.person_id] = (byPerson[row.person_id] ?? 0) + 1
  const d = await bundles('draft')
  if (d.ok) for (const b of d.data) if (b.labs.length + b.items.length + b.vaccinations.length + b.imaging.length === 0) byPerson[b.doc.person_id] = (byPerson[b.doc.person_id] ?? 0) + 1
  return { ok: true, data: { total: Object.values(byPerson).reduce((n, v) => n + v, 0), byPerson } }
}

const group = <T,>(rows: T[], key: keyof T) => {
  const m = new Map<string, T[]>()
  for (const r of rows) m.set(r[key] as string, [...(m.get(r[key] as string) ?? []), r])
  return m
}

/** Documents with their child rows. 'draft' also pulls in documents that are themselves confirmed but still have draft rows. */
async function bundles(status: 'draft' | 'confirmed', personId?: string): Promise<Res<DocBundle[]>> {
  const scope = <Q extends { eq(c: string, v: string): Q }>(q: Q) => (personId ? q.eq('person_id', personId) : q)
  const sel = (t: Table) => (s: Sb) => scope(s.from(t).select('*').eq('status', status)) as unknown as PromiseLike<{ data: unknown; error: unknown }>
  const [docs, labs, vacc, img, items] = await Promise.all([
    run<Doc[]>((s) => scope(s.from('documents').select('*').eq('status', status).order('doc_date', { ascending: false }).limit(200))),
    run<(Lab & { document_id: string | null })[]>(sel('lab_results')),
    run<(Vaccination & { document_id: string | null })[]>(sel('vaccinations')),
    run<(Imaging & { document_id: string | null })[]>(sel('imaging_reports')),
    run<RxItem[]>(sel('prescription_items'))
  ])
  if (!docs.ok) return docs
  if (!labs.ok) return labs
  if (!vacc.ok) return vacc
  if (!img.ok) return img
  if (!items.ok) return items
  const rxIds = [...new Set(items.data.map((i) => i.prescription_id))]
  const rx = rxIds.length ? await run<{ id: string; document_id: string | null }[]>((s) => s.from('prescriptions').select('id,document_id').in('id', rxIds)) : none<{ id: string; document_id: string | null }>()
  if (!rx.ok) return rx
  const rxDoc = new Map(rx.data.map((p) => [p.id, p.document_id]))
  const itemDoc = items.data.map((i) => ({ ...i, document_id: rxDoc.get(i.prescription_id) ?? null }))
  const ids = new Set([...docs.data.map((d) => d.id), ...[...labs.data, ...vacc.data, ...img.data, ...itemDoc].map((r) => r.document_id).filter((x): x is string => !!x)])
  const known = new Map(docs.data.map((d) => [d.id, d]))
  const missing = [...ids].filter((i) => !known.has(i))
  if (missing.length) {
    const m = await run<Doc[]>((s) => s.from('documents').select('*').in('id', missing))
    if (m.ok) for (const d of m.data) known.set(d.id, d)
  }
  const files = ids.size ? await run<(SourceFile & { document_id: string })[]>((s) => s.from('source_files').select('id,name,mime,drive_file_id,storage_path,side,document_id').in('document_id', [...ids])) : none<SourceFile & { document_id: string }>()
  const g = {
    labs: group(labs.data.filter((r) => r.document_id), 'document_id'),
    vacc: group(vacc.data.filter((r) => r.document_id), 'document_id'),
    img: group(img.data.filter((r) => r.document_id), 'document_id'),
    items: group(itemDoc.filter((r) => r.document_id), 'document_id'),
    files: group(files.ok ? files.data : [], 'document_id')
  }
  // ponytail: rows with no document are not shown; the admin tools own those.
  const out = [...known.values()]
    .filter((d) => d.kind !== 'id_card' && d.kind !== 'insurance_card') // cards are handled on the IDs screen (D-63)
    .map((doc) => ({
      doc,
      labs: g.labs.get(doc.id) ?? [],
      items: [...(g.items.get(doc.id) ?? [])].sort((a, b) => a.line_no - b.line_no),
      vaccinations: g.vacc.get(doc.id) ?? [],
      imaging: g.img.get(doc.id) ?? [],
      files: g.files.get(doc.id) ?? []
    }))
    .sort((a, b) => (b.doc.doc_date ?? '').localeCompare(a.doc.doc_date ?? ''))
  return { ok: true, data: out }
}

/** Confirmed prescription lines for one person, newest first. Read-only; the medicines list of wave 4 reuses it. */
export const listConfirmedMedicines = (personId: string) =>
  run<RxItem[]>((s) => s.from('prescription_items').select('*').eq('person_id', personId).eq('status', 'confirmed').order('created_at', { ascending: false }))

export const listDrafts = (personId?: string) => bundles('draft', personId)
export const listConfirmedDocuments = (personId: string) => bundles('confirmed', personId)

/** Short-lived (60 s) signed link to a file in the private 'records' bucket. Never stored or logged. */
export async function signedUrl(path: string): Promise<Res<string>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.storage.from('records').createSignedUrl(path, 60)
    return error || !data?.signedUrl ? fail(error) : { ok: true, data: data.signedUrl }
  } catch (e) {
    return fail(e)
  }
}

export const listTestCatalog = () => run<CatalogTest[]>((s) => s.from('test_catalog').select('code,name,unit,conversions').order('name'))

// ---- local readings mirror: a confirm/reject/fix of a lab result changes the server readings row (trigger); copy that now.
async function readingsFor(ids: string[]): Promise<Row[] | null> {
  const r = await run<Row[]>((s) => s.from('readings').select('*').in('lab_result_id', ids))
  return r.ok ? r.data : null
}
async function mirror(after: Row[] | null) {
  if (!after) return // offline or blocked: the normal pull catches up
  for (const r of after) {
    const have = await hdb.readings.filter((x) => x.clientId === r.client_id).first()
    if (r.deleted_at) { // tombstone: rejected or unconfirmed
      if (have) await hdb.readings.delete(have.id!)
      continue
    }
    const local = fromRow('readings', r) as unknown as Reading
    if (have) await hdb.readings.update(have.id!, local)
    else await hdb.readings.add(local)
  }
}
async function withMirror<T>(ids: string[], change: () => Promise<Res<T>>): Promise<Res<T>> {
  const res = await change()
  if (!res.ok) return res
  try { await mirror(await readingsFor(ids)) } catch { /* local store blocked: pull catches up */ }
  return res
}

async function setStatus(table: Table, ids: string[], status: 'confirmed' | 'rejected'): Promise<Res<{ changed: number; ids: string[] }>> {
  if (!Object.hasOwn(EDITABLE, table) || ids.length === 0) return { ok: false, error: 'invalid' }
  const go = async (): Promise<Res<{ changed: number; ids: string[] }>> => {
    const r = await run<{ id: string }[]>((s) => {
      const q = s.from(table).update({ status }).in('id', ids)
      // an unclear prescription line is confirmed on its own, never swept in with others
      return (table === 'prescription_items' && status === 'confirmed' && ids.length > 1 ? q.eq('unclear', false) : q).select('id')
    })
    if (!r.ok) return r
    return r.data.length ? { ok: true, data: { changed: r.data.length, ids: r.data.map((x) => x.id) } } : { ok: false, error: 'forbidden' } // RLS hides rows it will not change
  }
  return table === 'lab_results' ? withMirror(ids, go) : go()
}
export const confirmRows = (table: Table, ids: string[]) => setStatus(table, ids, 'confirmed')
export const rejectRows = (table: Table, ids: string[]) => setStatus(table, ids, 'rejected')

/** Fix a value by hand. Only allowlisted columns; a changed value/unit/test drops a stale canonical value unless one is given. */
export async function updateRow(table: Table, id: string, patch: Record<string, unknown>): Promise<Res<null>> {
  const allowed = EDITABLE[table]
  const keys = Object.keys(patch)
  if (!allowed || keys.length === 0 || keys.some((k) => !allowed.includes(k))) return { ok: false, error: 'column_not_allowed' }
  const body: Record<string, unknown> = {}
  for (const k of keys) {
    const v = patch[k]
    body[k] = v === '' || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : v // unknown stays null, never 0 (B-5)
  }
  if (table === 'lab_results' && !('value_canonical' in body) && ['value_num', 'unit_raw', 'test_code'].some((k) => k in body)) body.value_canonical = null
  const go = async (): Promise<Res<null>> => {
    const r = await run<{ id: string }[]>((s) => s.from(table).update(body).eq('id', id).select('id'))
    if (!r.ok) return r
    return r.data.length ? { ok: true, data: null } : { ok: false, error: 'forbidden' }
  }
  return table === 'lab_results' ? withMirror([id], go) : go()
}

/** Value in the test's own unit, or null when there is no safe conversion. */
export function canonicalFor(cat: CatalogTest | undefined, value: number | null, unit: string | null): number | null {
  if (!cat || value == null) return null
  const u = (unit ?? '').trim()
  if (u.toLowerCase() === cat.unit.toLowerCase()) return value
  const key = Object.keys(cat.conversions ?? {}).find((k) => k.trim().toLowerCase() === u.toLowerCase())
  const f = key === undefined ? undefined : cat.conversions[key]
  return typeof f === 'number' ? Number((value * f).toPrecision(8)) : null
}

/** When no draft row is left, close the document itself: confirmed if anything in it was confirmed, else rejected. */
export async function settleDocument(docId: string): Promise<Res<'confirmed' | 'rejected' | 'open'>> {
  const [l, v, i, p] = await Promise.all([
    run<Row[]>((s) => s.from('lab_results').select('id,status').eq('document_id', docId)),
    run<Row[]>((s) => s.from('vaccinations').select('id,status').eq('document_id', docId)),
    run<Row[]>((s) => s.from('imaging_reports').select('id,status').eq('document_id', docId)),
    run<Row[]>((s) => s.from('prescriptions').select('id').eq('document_id', docId))
  ])
  if (!l.ok) return l
  if (!v.ok) return v
  if (!i.ok) return i
  if (!p.ok) return p
  const rx = p.data.map((x) => x.id)
  const it = rx.length ? await run<Row[]>((s) => s.from('prescription_items').select('id,status').in('prescription_id', rx)) : none<Row>()
  if (!it.ok) return it
  const rows = [...l.data, ...v.data, ...i.data, ...it.data]
  if (rows.length === 0) return { ok: true, data: 'open' } // a document with no rows is confirmed or rejected by hand
  if (rows.some((r) => r.status === 'draft')) return { ok: true, data: 'open' }
  const status = rows.some((r) => r.status === 'confirmed') ? 'confirmed' : 'rejected'
  if (rx.length) {
    const c = await setStatus('prescriptions', rx, status) // children first, the document last: a failure leaves it draft so it is retried
    if (!c.ok) return c
  }
  const r = await setStatus('documents', [docId], status)
  if (!r.ok) return r
  return { ok: true, data: status }
}

// ---- offline cache of confirmed documents (no drafts ever cached)
export const docsKey = (personId: string) => `records.docs.${personId}`
export async function cachedDocs(personId: string): Promise<DocBundle[]> {
  try { return ((await db.kv.get(docsKey(personId)))?.value as DocBundle[] | undefined) ?? [] } catch { return [] }
}
export async function cacheDocs(personId: string, docs: DocBundle[]) {
  try { await db.kv.put({ key: docsKey(personId), value: docs.filter((d) => d.doc.status === 'confirmed') }) } catch { /* storage blocked */ }
}
