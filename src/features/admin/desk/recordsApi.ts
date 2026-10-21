import { supabase } from '../../auth/client'
import { confirmRows, rejectRows, EDITABLE, type Res, type Table } from '../../records/api'
import { LOW_CONFIDENCE } from '../../records/ConfirmSheet'

// Admin dashboard reads/writes for Records, Queue and Duplicates. RLS lets the admin see every person; nothing here deletes.
// Codes only on failure (messages can carry row values).
export type Row = Record<string, unknown> & { id: string }
export type Status = 'draft' | 'confirmed' | 'rejected'
export const CAP = 500

const fail = (e: unknown): Res<never> => {
  const c = (e as { code?: string } | null)?.code
  return { ok: false, error: c === '42501' || c === 'PGRST301' ? 'forbidden' : c && /^(22|23)/.test(c) ? 'invalid' : 'failed', code: c }
}
type Sb = NonNullable<typeof supabase>
async function run<T>(f: (s: Sb) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Res<T>> {
  if (!supabase) return { ok: false, error: 'not_connected' }
  try {
    const { data, error } = await f(supabase)
    return error ? fail(error) : { ok: true, data: (data ?? []) as T }
  } catch (e) {
    return fail(e)
  }
}

// ---- Records kinds ----
export type KindKey = 'papers' | 'labs' | 'medicines' | 'rx' | 'imaging' | 'vaccinations' | 'allergies' | 'conditions' | 'visits'
type Src = { table: string; date: string; ts: boolean; where?: 'live' | 'notCard' }
export type Kind = { key: KindKey; label: string; src: Src[]; text: string[]; cols: { key: string; label: string }[] }
export const KINDS: Kind[] = [
  { key: 'papers', label: 'Papers', src: [{ table: 'documents', date: 'doc_date', ts: false, where: 'notCard' }], text: ['title', 'facility', 'kind'], cols: [{ key: 'doc_date', label: 'Date' }, { key: 'kind', label: 'Kind' }, { key: 'title', label: 'Title' }, { key: 'facility', label: 'Facility' }] },
  { key: 'labs', label: 'Labs', src: [{ table: 'lab_results', date: 'collected_at', ts: true }], text: ['name_raw', 'test_code', 'value_text', 'unit_raw'], cols: [{ key: 'collected_at', label: 'Date' }, { key: 'name_raw', label: 'Test' }, { key: 'value_num', label: 'Value' }, { key: 'unit_raw', label: 'Unit' }] },
  { key: 'medicines', label: 'Medicines', src: [{ table: 'medications', date: 'started_on', ts: false, where: 'live' }], text: ['name', 'generic_name', 'strength'], cols: [{ key: 'started_on', label: 'Started' }, { key: 'name', label: 'Medicine' }, { key: 'strength', label: 'Strength' }, { key: 'med_status', label: 'Taking' }] },
  { key: 'rx', label: 'Prescriptions', src: [{ table: 'prescription_items', date: 'created_at', ts: true }], text: ['drug_raw', 'generic_name', 'brand', 'instructions'], cols: [{ key: 'created_at', label: 'Added' }, { key: 'drug_raw', label: 'Medicine' }, { key: 'dose', label: 'Dose' }, { key: 'frequency', label: 'How often' }] },
  { key: 'imaging', label: 'Imaging', src: [{ table: 'imaging_reports', date: 'reported_at', ts: true }], text: ['modality', 'body_region', 'findings', 'impression'], cols: [{ key: 'reported_at', label: 'Date' }, { key: 'modality', label: 'Type' }, { key: 'body_region', label: 'Region' }, { key: 'impression', label: 'Impression' }] },
  { key: 'vaccinations', label: 'Vaccinations', src: [{ table: 'vaccinations', date: 'given_on', ts: false }], text: ['vaccine', 'facility', 'lot'], cols: [{ key: 'given_on', label: 'Given' }, { key: 'vaccine', label: 'Vaccine' }, { key: 'dose_no', label: 'Dose' }, { key: 'facility', label: 'Facility' }] },
  { key: 'allergies', label: 'Allergies', src: [{ table: 'allergies', date: 'created_at', ts: true }], text: ['substance', 'reaction', 'severity'], cols: [{ key: 'created_at', label: 'Added' }, { key: 'substance', label: 'Substance' }, { key: 'reaction', label: 'Reaction' }, { key: 'severity', label: 'Severity' }] },
  { key: 'conditions', label: 'Conditions', src: [{ table: 'conditions', date: 'onset_on', ts: false }], text: ['name', 'notes', 'cond_status'], cols: [{ key: 'onset_on', label: 'Since' }, { key: 'name', label: 'Condition' }, { key: 'cond_status', label: 'State' }, { key: 'notes', label: 'Notes' }] },
  { key: 'visits', label: 'Visits', src: [{ table: 'encounters', date: 'occurred_on', ts: false }, { table: 'appointments', date: 'due_on', ts: false }], text: ['facility', 'provider', 'reason', 'notes', 'purpose'], cols: [{ key: 'when', label: 'Date' }, { key: 'kind', label: 'Kind' }, { key: 'facility', label: 'Facility' }, { key: 'provider', label: 'Provider' }] }
]

export type Filter = { person: string | null; status: Status | 'all'; from: string; to: string }
export type KRow = Row & { _table: string; status: Status; when?: string | null }

export async function listKind(kind: Kind, f: Filter): Promise<Res<KRow[]>> {
  const parts = await Promise.all(kind.src.map((s) => run<Row[]>((sb) => {
    let q = sb.from(s.table).select('*')
    if (f.person) q = q.eq('person_id', f.person)
    if (f.status !== 'all') q = q.eq('status', f.status)
    if (s.where === 'live') q = q.is('deleted_at', null)
    if (s.where === 'notCard') q = q.not('kind', 'in', '(id_card,insurance_card)') // cards live on the IDs page
    if (f.from) q = q.gte(s.date, f.from)
    if (f.to) q = q.lte(s.date, s.ts ? `${f.to}T23:59:59.999Z` : f.to)
    return q.order(s.date, { ascending: false, nullsFirst: false }).limit(CAP)
  })))
  const bad = parts.find((p) => !p.ok)
  if (bad && !bad.ok) return bad
  const rows = parts.flatMap((p, i) => (p.ok ? p.data : []).map((r) => ({ ...r, _table: kind.src[i].table, when: (r[kind.src[i].date] as string | null) ?? null }) as KRow))
  rows.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''))
  return { ok: true, data: rows.slice(0, CAP) }
}

/** Client-side text search over the kind's text columns; empty query keeps everything. */
export const searchRows = <T extends Record<string, unknown>>(rows: T[], q: string, cols: string[]) => {
  const n = q.trim().toLowerCase()
  return n ? rows.filter((r) => cols.some((c) => String(r[c] ?? '').toLowerCase().includes(n))) : rows
}

// ---- status writes ----
export type Change = { table: string; ids: string[]; prev: Status }

/** Confirm or reject. Tables the phone also handles reuse its calls (readings mirror, unclear-line rule); the rest are plain status updates. */
export async function setStatusFor(table: string, ids: string[], status: 'confirmed' | 'rejected'): Promise<Res<{ changed: number; ids: string[] }>> {
  if (Object.hasOwn(EDITABLE, table)) return status === 'confirmed' ? confirmRows(table as Table, ids) : rejectRows(table as Table, ids)
  if (ids.length === 0) return { ok: false, error: 'invalid' }
  const r = await run<{ id: string }[]>((s) => s.from(table).update({ status }).in('id', ids).select('id'))
  if (!r.ok) return r
  return r.data.length ? { ok: true, data: { changed: r.data.length, ids: r.data.map((x) => x.id) } } : { ok: false, error: 'forbidden' }
}

/** Put rows back to the status they had (Undo). The server stamps/clears confirmed_by. */
export async function restore(changes: Change[]): Promise<Res<null>> {
  for (const c of changes) {
    if (c.ids.length === 0) continue
    const r = await run<{ id: string }[]>((s) => s.from(c.table).update({ status: c.prev }).in('id', c.ids).select('id'))
    if (!r.ok) return r
  }
  return { ok: true, data: null }
}

/** After an Undo of rows, reopen the paper (and its prescription headers) that settleDocument had closed. */
export async function reopenDocument(docId: string, prev: Status): Promise<Res<null>> {
  const a = await run<unknown[]>((s) => s.from('documents').update({ status: prev }).eq('id', docId).select('id'))
  if (!a.ok) return a
  const b = await run<unknown[]>((s) => s.from('prescriptions').update({ status: prev }).eq('document_id', docId).select('id'))
  return b.ok ? { ok: true, data: null } : b
}

// ---- Queue ----
export type QTable = 'lab_results' | 'prescription_items' | 'vaccinations' | 'imaging_reports'
export type QItem = { table: QTable; row: Row & { confidence: number | null; unclear?: boolean; value_num?: number | null; value_text?: string | null } }
export const isLow = (c: number | null | undefined) => c != null && c < LOW_CONFIDENCE // unknown confidence is not low (same as the phone)
/** The phone ConfirmSheet rule: not unclear, confidence not low, a lab value present. */
export const defaultChecked = (i: QItem) => !i.row.unclear && !isLow(i.row.confidence) && !(i.table === 'lab_results' && i.row.value_num == null && i.row.value_text == null)

/** Keyboard on the queue: j/k move, x toggles, c confirms checked. Typing in a field never triggers it. */
export type QKey = 'next' | 'prev' | 'toggle' | 'confirm'
export function queueKey(e: { key: string; target?: { tagName?: string; type?: string; isContentEditable?: boolean } | null; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): QKey | null {
  const tag = (e.target?.tagName ?? '').toUpperCase()
  if ((tag === 'INPUT' && e.target?.type !== 'checkbox') || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return null
  return e.key === 'j' ? 'next' : e.key === 'k' ? 'prev' : e.key === 'x' ? 'toggle' : e.key === 'c' ? 'confirm' : null
}

// ---- Duplicates ----
export type DocLite = { id: string; person_id: string; status: Status; doc_date: string | null; facility: string | null; title: string | null; created_at: string; kind: string }
export type FileLite = { sha256: string | null; document_id: string | null }
export type ChildRow = { id: string; document_id: string; status: Status }
export type RxLine = Row & { prescription_id: string; document_id: string; line_no: number; status: Status }
export type DupGroup = { key: string; docs: DocLite[] }

/** Live documents that share a file hash and a person with another live document. */
export function groupDuplicates(docs: DocLite[], files: FileLite[]): DupGroup[] {
  const live = new Map(docs.filter((d) => d.status !== 'rejected').map((d) => [d.id, d]))
  const by = new Map<string, Map<string, DocLite>>()
  for (const f of files) {
    const d = f.sha256 && f.document_id ? live.get(f.document_id) : undefined
    if (!d) continue
    const k = `${f.sha256}|${d.person_id}`
    by.set(k, (by.get(k) ?? new Map()).set(d.id, d))
  }
  return [...by].filter(([, m]) => m.size > 1).map(([key, m]) => ({ key, docs: [...m.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
}

export const RX_FIELDS = ['drug_raw', 'generic_name', 'frequency', 'dose', 'strength', 'duration'] as const
export type RxDiff = { line: number; field: string; a: string; b: string }
/** Field differences between two copies' prescription lines, paired by line number. A missing line shows as an empty cell. */
export function rxDiff(a: RxLine[], b: RxLine[]): RxDiff[] {
  const out: RxDiff[] = []
  const nums = [...new Set([...a, ...b].map((l) => l.line_no))].sort((x, y) => x - y)
  for (const n of nums) {
    const x = a.find((l) => l.line_no === n), y = b.find((l) => l.line_no === n)
    for (const f of RX_FIELDS) {
      const p = x ? String(x[f] ?? '') : '', q = y ? String(y[f] ?? '') : ''
      if (p !== q) out.push({ line: n, field: f, a: p, b: q })
    }
  }
  return out
}

export type Kids = { labs: ChildRow[]; vaccinations: ChildRow[]; imaging: ChildRow[]; items: RxLine[]; prescriptions: ChildRow[] }
export const REFUSED = 'This copy has confirmed rows. Check it in Records first.'
const KID_TABLE: Record<keyof Kids, string> = { labs: 'lab_results', vaccinations: 'vaccinations', imaging: 'imaging_reports', items: 'prescription_items', prescriptions: 'prescriptions' }

/** What "Keep this one" changes: every other live copy and its DRAFT rows go to rejected. Refuses when any other copy has a confirmed row. */
export function planKeep(group: DupGroup, keepId: string, kids: Kids): { ok: true; changes: Change[] } | { ok: false; error: string } {
  const others = group.docs.filter((d) => d.id !== keepId)
  const changes: Change[] = []
  for (const o of others) {
    const mine = (Object.keys(KID_TABLE) as (keyof Kids)[]).map((k) => ({ table: KID_TABLE[k], rows: (kids[k] as ChildRow[]).filter((r) => r.document_id === o.id) }))
    if (mine.some((m) => m.table !== 'prescriptions' && m.rows.some((r) => r.status === 'confirmed'))) return { ok: false, error: REFUSED }
    for (const m of mine) {
      const ids = m.rows.filter((r) => r.status === 'draft').map((r) => r.id)
      if (ids.length) changes.push({ table: m.table, ids, prev: 'draft' })
    }
    changes.push({ table: 'documents', ids: [o.id], prev: o.status })
  }
  return { ok: true, changes }
}

/** Reject the planned rows, children first and the paper last (a failure leaves the paper live and retryable). */
export async function applyKeep(changes: Change[]): Promise<Res<null>> {
  for (const c of changes) {
    const r = await run<{ id: string }[]>((s) => s.from(c.table).update({ status: 'rejected' }).in('id', c.ids).select('id'))
    if (!r.ok) return r
  }
  return { ok: true, data: null }
}

async function pages<T>(build: (s: Sb, from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Res<T[]>> {
  const out: T[] = []
  for (let i = 0; i < 30; i++) { // PostgREST caps a response at 1000 rows
    const r = await run<T[]>((s) => build(s, i * 1000, i * 1000 + 999))
    if (!r.ok) return r
    out.push(...r.data)
    if (r.data.length < 1000) break
  }
  return { ok: true, data: out }
}

export async function loadDuplicates(): Promise<Res<{ groups: DupGroup[]; kids: Kids }>> {
  const [docs, files] = await Promise.all([
    pages<DocLite>((s, a, b) => s.from('documents').select('id,person_id,status,doc_date,facility,title,created_at,kind').neq('status', 'rejected').order('id').range(a, b)),
    pages<FileLite>((s, a, b) => s.from('source_files').select('sha256,document_id').not('sha256', 'is', null).not('document_id', 'is', null).order('id').range(a, b))
  ])
  if (!docs.ok) return docs
  if (!files.ok) return files
  const groups = groupDuplicates(docs.data, files.data)
  const ids = groups.flatMap((g) => g.docs.map((d) => d.id))
  const empty: Kids = { labs: [], vaccinations: [], imaging: [], items: [], prescriptions: [] }
  if (ids.length === 0) return { ok: true, data: { groups, kids: empty } }
  const sel = (t: string) => run<ChildRow[]>((s) => s.from(t).select('id,document_id,status').in('document_id', ids))
  const [labs, vaccinations, imaging, prescriptions] = await Promise.all([sel('lab_results'), sel('vaccinations'), sel('imaging_reports'), sel('prescriptions')])
  for (const r of [labs, vaccinations, imaging, prescriptions]) if (!r.ok) return r
  if (!labs.ok || !vaccinations.ok || !imaging.ok || !prescriptions.ok) return { ok: false, error: 'failed' }
  const rxDoc = new Map(prescriptions.data.map((p) => [p.id, p.document_id]))
  const items = rxDoc.size ? await run<RxLine[]>((s) => s.from('prescription_items').select('*').in('prescription_id', [...rxDoc.keys()])) : ({ ok: true, data: [] } as Res<RxLine[]>)
  if (!items.ok) return items
  return { ok: true, data: { groups, kids: { labs: labs.data, vaccinations: vaccinations.data, imaging: imaging.data, prescriptions: prescriptions.data, items: items.data.map((i) => ({ ...i, document_id: rxDoc.get(i.prescription_id) ?? '' })) } } }
}

/** Row counts and confirmed counts for one copy, per kind (prescription lines stand in for prescriptions). */
export function countsFor(docId: string, kids: Kids) {
  const c = (rows: ChildRow[]) => { const m = rows.filter((r) => r.document_id === docId); return { n: m.length, confirmed: m.filter((r) => r.status === 'confirmed').length } }
  return { Labs: c(kids.labs), 'Prescription lines': c(kids.items), Vaccinations: c(kids.vaccinations), Imaging: c(kids.imaging) }
}

// ---- Records panel helpers ----
export type PageFile = { id: string; name: string; mime: string; drive_file_id: string | null; storage_path: string | null; side: string | null; page_no: number | null }

/** The paper a row belongs to (its status is needed to reopen it on Undo). Child rows reach it directly or through their prescription. */
export async function parentDoc(table: string, row: Row): Promise<{ id: string; status: Status } | null> {
  if (table === 'documents') return { id: row.id, status: row.status as Status }
  let docId = (row.document_id as string | null | undefined) ?? null
  if (table === 'prescription_items' && !docId) {
    const p = await run<{ document_id: string | null }[]>((s) => s.from('prescriptions').select('document_id').eq('id', row.prescription_id as string).limit(1))
    docId = p.ok ? (p.data[0]?.document_id ?? null) : null
  }
  if (!docId) return null
  const id = docId
  const d = await run<{ id: string; status: Status }[]>((s) => s.from('documents').select('id,status').eq('id', id).limit(1))
  return d.ok && d.data[0] ? d.data[0] : null
}

export async function filesOf(docId: string): Promise<Res<PageFile[]>> {
  const r = await run<PageFile[]>((s) => s.from('source_files').select('id,name,mime,drive_file_id,storage_path,side,page_no').eq('document_id', docId))
  return r.ok ? { ok: true, data: [...r.data].sort((a, b) => (a.page_no ?? 0) - (b.page_no ?? 0)) } : r
}
