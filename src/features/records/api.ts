import { db } from '../../db'
import { supabase } from '../auth/client'
import type { Reading } from '../health/ranges'
import { fromRow } from '../sync/tables'
import { hdb } from './store'

// Online, RLS-limited calls on the records tables (migration 0008). Never throws; never logs values (B-7).
// The client only ever sets `status`: confirmed_by / confirmed_at are stamped by a trigger from auth.uid().
export type Res<T> = { ok: true; data: T } | { ok: false; error: string }
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

export interface SourceFile { id: string; name: string; mime: string; drive_file_id: string }
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
  return { ok: false, error }
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

/** N for "To check (N)": draft rows waiting; a draft document with no rows yet counts as one. */
export async function listQueue(): Promise<Res<Queue>> {
  const r = await run<{ person_id: string; kind: string; drafts: number }[]>((s) => s.from('records_queue').select('*'))
  if (!r.ok) return r
  const items = r.data.filter((x) => x.kind !== 'documents')
  const rows = items.length ? items : r.data
  const byPerson: Record<string, number> = {}
  for (const x of rows) byPerson[x.person_id] = (byPerson[x.person_id] ?? 0) + Number(x.drafts)
  return { ok: true, data: { total: rows.reduce((n, x) => n + Number(x.drafts), 0), byPerson } }
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
  const files = ids.size ? await run<(SourceFile & { document_id: string })[]>((s) => s.from('source_files').select('id,name,mime,drive_file_id,document_id').in('document_id', [...ids])) : none<SourceFile & { document_id: string }>()
  const g = {
    labs: group(labs.data.filter((r) => r.document_id), 'document_id'),
    vacc: group(vacc.data.filter((r) => r.document_id), 'document_id'),
    img: group(img.data.filter((r) => r.document_id), 'document_id'),
    items: group(itemDoc.filter((r) => r.document_id), 'document_id'),
    files: group(files.ok ? files.data : [], 'document_id')
  }
  // ponytail: rows with no document are not shown; the admin tools own those.
  const out = [...known.values()]
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

export const listDrafts = (personId?: string) => bundles('draft', personId)
export const listConfirmedDocuments = (personId: string) => bundles('confirmed', personId)

/** One document with every non-rejected child and its original files (detail screen). */
export async function getDocument(id: string): Promise<Res<DocBundle>> {
  const d = await run<Doc | null>((s) => s.from('documents').select('*').eq('id', id).maybeSingle())
  if (!d.ok) return d
  if (!d.data) return { ok: false, error: 'not_found' }
  const [labs, vacc, img, rx, files] = await Promise.all([
    run<Lab[]>((s) => s.from('lab_results').select('*').eq('document_id', id)),
    run<Vaccination[]>((s) => s.from('vaccinations').select('*').eq('document_id', id)),
    run<Imaging[]>((s) => s.from('imaging_reports').select('*').eq('document_id', id)),
    run<{ id: string }[]>((s) => s.from('prescriptions').select('id').eq('document_id', id)),
    run<SourceFile[]>((s) => s.from('source_files').select('id,name,mime,drive_file_id').eq('document_id', id))
  ])
  if (!labs.ok) return labs
  if (!vacc.ok) return vacc
  if (!img.ok) return img
  if (!rx.ok) return rx
  if (!files.ok) return files
  const rxIds = rx.data.map((p) => p.id)
  const items = rxIds.length ? await run<RxItem[]>((s) => s.from('prescription_items').select('*').in('prescription_id', rxIds)) : none<RxItem>()
  if (!items.ok) return items
  const keep = <T,>(rows: T[]) => rows.filter((r) => (r as { status?: unknown }).status !== 'rejected')
  return { ok: true, data: { doc: d.data, labs: keep(labs.data), items: keep(items.data).sort((a, b) => a.line_no - b.line_no), vaccinations: keep(vacc.data), imaging: keep(img.data), files: files.data } }
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

async function setStatus(table: Table, ids: string[], status: 'confirmed' | 'rejected'): Promise<Res<{ changed: number }>> {
  if (!Object.hasOwn(EDITABLE, table) || ids.length === 0) return { ok: false, error: 'invalid' }
  const go = async (): Promise<Res<{ changed: number }>> => {
    const r = await run<{ id: string }[]>((s) => {
      const q = s.from(table).update({ status }).in('id', ids)
      // an unclear prescription line is confirmed on its own, never swept in with others
      return (table === 'prescription_items' && status === 'confirmed' && ids.length > 1 ? q.eq('unclear', false) : q).select('id')
    })
    if (!r.ok) return r
    return r.data.length ? { ok: true, data: { changed: r.data.length } } : { ok: false, error: 'forbidden' } // RLS hides rows it will not change
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
  const f = cat.conversions?.[u]
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
  if (rows.some((r) => r.status === 'draft')) return { ok: true, data: 'open' }
  const status = rows.some((r) => r.status === 'confirmed') ? 'confirmed' : 'rejected'
  const r = await setStatus('documents', [docId], status)
  if (!r.ok) return r
  if (rx.length) await setStatus('prescriptions', rx, status)
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
