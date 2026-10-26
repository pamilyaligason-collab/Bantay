import { supabase } from '../../auth/client'
import { driveUrl, signedUrl } from '../../records/api'

// Online calls behind Files, IDs and History. Never throws; never logs values. ID numbers come only from the admin RPCs, never from a table select.
export type Res<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }
type Sb = NonNullable<typeof supabase>
const fail = (e: unknown): Res<never> => {
  const code = (e as { code?: string } | null)?.code // codes only: messages can carry row values
  const error = code === '42501' || code === 'PGRST301' ? 'forbidden' : code && /^(22|23)/.test(code) ? 'invalid' : 'failed'
  return { ok: false, error, code }
}
async function run<T>(f: (s: Sb) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Res<T>> {
  if (!supabase) return { ok: false, error: 'not_connected' }
  try {
    const { data, error } = await f(supabase)
    return error ? fail(error) : { ok: true, data: data as T }
  } catch (e) {
    return fail(e)
  }
}

// ---------- Files ----------
export type FileStatus = 'new' | 'reading' | 'extracted' | 'queued' | 'done' | 'skipped' | 'failed'
export type FileRow = {
  id: string; person_id: string | null; name: string; page_no: number | null; ingest_status: FileStatus; ingest_error: string | null; ingest_tries: number | null
  created_at: string; storage_path: string | null; drive_file_id: string | null; documents: { kind: string | null; page_count: number | null } | null
}
export const FILE_COLS = 'id, person_id, name, page_no, ingest_status, ingest_error, ingest_tries, created_at, storage_path, drive_file_id, documents(kind, page_count)'
export const FILTERS = [['all', 'All'], ['failed', 'Failed'], ['reading', 'Reading'], ['new', 'New'], ['done', 'Done'], ['skipped', 'Skipped']] as const
export type FileFilter = (typeof FILTERS)[number][0]

export const listFiles = (f: { status: FileFilter; person: string }) => run<FileRow[]>((s) => {
  let q = s.from('source_files').select(FILE_COLS)
  if (f.status !== 'all') q = q.eq('ingest_status', f.status)
  if (f.person) q = q.eq('person_id', f.person)
  return q.order('created_at', { ascending: false }).limit(500)
})

const ERRORS: Record<string, string> = { too_many_tries: 'Tried too many times', unreadable: 'Could not read the page', no_text: 'No text found', timeout: 'Took too long' }
/** Short server code to plain words; unknown codes lose their underscores. */
export const errorWords = (code: string | null | undefined) => (code ? ERRORS[code] ?? code.replace(/_/g, ' ') : '')

/** Retry resets the scan to the start. Only a failed file with an uploaded copy can be read again. */
export const RETRY_PATCH = { ingest_status: 'new', ingest_tries: 0, ingest_error: null } as const
export const canRetry = (r: Pick<FileRow, 'ingest_status' | 'storage_path'>) => r.ingest_status === 'failed' && !!r.storage_path
export const retryFile = async (id: string): Promise<Res<null>> => {
  const r = await run<{ id: string }[]>((s) => s.from('source_files').update({ ...RETRY_PATCH }).eq('id', id).eq('ingest_status', 'failed').select('id'))
  return !r.ok ? r : r.data.length ? { ok: true, data: null } : { ok: false, error: 'forbidden' }
}

/** Opens a file in a new tab: a 60 s signed link, else the Drive link. The tab opens first so the popup blocker allows it. */
export async function openFile(f: { storage_path: string | null; drive_file_id: string | null }, w = window.open('about:blank', '_blank')): Promise<boolean> {
  let url: string | null = null
  if (f.storage_path) { const r = await signedUrl(f.storage_path); if (r.ok) url = r.data }
  if (!url && f.drive_file_id) url = driveUrl(f.drive_file_id)
  if (!w) return false
  if (!url) { w.close(); return false }
  w.opener = null
  w.location.href = url
  return true
}
export async function openSourceFile(id: string): Promise<boolean> {
  const w = window.open('about:blank', '_blank') // before the await, while the click still counts as a user gesture
  const r = await run<{ storage_path: string | null; drive_file_id: string | null }>((s) => s.from('source_files').select('storage_path, drive_file_id').eq('id', id).single())
  if (!r.ok) { w?.close(); return false }
  return openFile(r.data, w)
}

// ---------- IDs and insurance ----------
export type IdSource = 'id' | 'insurance'
export type Ident = {
  id: string; source: IdSource; label: string | null; plan: string | null; last4: string | null; issued_on: string | null; expires_on: string | null
  status: string; source_file_id: string | null; confidence: number | null
}
/** Display mask. Only the last 4 ever reach the browser; the server sends null when the number is shorter than 8. */
export const maskNumber = (last4: string | null | undefined) => (last4 ? `•••• ${last4}` : '••••••••')
/** Mirror of the server rule, for tests: null under 8 characters. */
export const last4Of = (n: string | null | undefined) => (n && n.length >= 8 ? n.slice(-4) : null)
export const isExpired = (d: string | null | undefined, now = new Date()) => !!d && d < now.toISOString().slice(0, 10)

export const listIdentifiers = (person: string) => run<Ident[]>((s) => s.rpc('admin_identifiers', { p_person: person }))
/** The one place a full number is fetched. The caller shows it for 30 s and drops it. */
export const revealNumber = async (source: IdSource, id: string): Promise<Res<string>> => {
  const r = await run<unknown>((s) => s.rpc('admin_reveal_identifier', { p_source: source, p_id: id }))
  return r.ok ? (typeof r.data === 'string' ? { ok: true, data: r.data } : { ok: false, error: 'failed' }) : r
}

export const ID_TYPES = ['philsys', 'senior', 'pwd', 'drivers', 'passport', 'umid', 'voters', 'postal', 'philhealth', 'hmo', 'tin', 'sss', 'other'] as const
const TABLE = { id: 'person_identifiers', insurance: 'insurance_policies' } as const
const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null) // unknown stays null

export type IdEdit = { label: string | null; plan: string | null; issued_on: string | null; expires_on: string | null; status: string }
/** Column names differ per table; the number columns are never part of an edit. */
export const editPatch = (source: IdSource, e: IdEdit): Record<string, unknown> =>
  source === 'id'
    ? { id_type: e.label, issued_on: clean(e.issued_on), expires_on: clean(e.expires_on), status: e.status }
    : { carrier: clean(e.label), plan: clean(e.plan), valid_from: clean(e.issued_on), valid_to: clean(e.expires_on), status: e.status }
export const numberPatch = (source: IdSource, value: string) => (source === 'id' ? { id_number: value.trim() } : { member_no: value.trim() })

async function change(source: IdSource, id: string, patch: Record<string, unknown>): Promise<Res<null>> {
  const r = await run<{ id: string }[]>((s) => s.from(TABLE[source]).update(patch).eq('id', id).select('id'))
  return !r.ok ? r : r.data.length ? { ok: true, data: null } : { ok: false, error: 'forbidden' }
}
export const updateIdentifier = (source: IdSource, id: string, e: IdEdit) => change(source, id, editPatch(source, e))
export const setIdStatus = (source: IdSource, id: string, status: string) => change(source, id, { status })
export const replaceNumber = (source: IdSource, id: string, value: string) => (value.trim().length >= 3 ? change(source, id, numberPatch(source, value)) : Promise.resolve<Res<null>>({ ok: false, error: 'invalid' }))

// ---------- History ----------
export const PAGE = 100
export type AuditRow = { id: number; at: string; actor: string | null; tbl: string; row_id: string | null; person_id: string | null; action: string; fields: string[] | null }
export type AuditFilter = { person: string; table: string; action: string; from: string; to: string; page: number }
export const ACTIONS = ['insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view'] as const
export const TABLE_WORDS: Record<string, string> = {
  people: 'Profile', carers: 'Carers', person_identifiers: 'ID', insurance_policies: 'Insurance', documents: 'Paper', lab_results: 'Lab result',
  prescription_items: 'Prescription line', medications: 'Medicine', vaccinations: 'Vaccination', imaging_reports: 'Imaging', conditions: 'Condition', allergies: 'Allergy'
}
export const tableWords = (t: string) => TABLE_WORDS[t] ?? t.replace(/_/g, ' ')
const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString()
const nextDay = (d: string) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + 1); return x.toISOString() }

/** Newest first. Asks for one row more than a page so the caller knows whether "Older" has anything behind it. */
export const listAudit = (f: AuditFilter) => run<AuditRow[]>((s) => {
  let q = s.from('audit_log').select('id, at, actor, tbl, row_id, person_id, action, fields')
  if (f.person) q = q.eq('person_id', f.person)
  if (f.table) q = q.eq('tbl', f.table)
  if (f.action) q = q.eq('action', f.action)
  if (f.from) q = q.gte('at', dayStart(f.from))
  if (f.to) q = q.lt('at', nextDay(f.to))
  return q.order('at', { ascending: false }).order('id', { ascending: false }).range(f.page * PAGE, f.page * PAGE + PAGE)
})
/** audit_log is missing before 0021 is applied (PostgREST 404 / undefined table). */
export const noAuditTable = (code?: string) => code === '42P01' || code === 'PGRST205'

export type DedupeRow = { id: number; at: string; tbl: string; row_id: string; old_status: string | null }
export const listDedupe = () => run<DedupeRow[]>((s) => s.from('records_dedupe_log').select('id, at, tbl, row_id, old_status').order('at', { ascending: false }).order('id', { ascending: false }).limit(1000))
export function dedupeCounts(rows: DedupeRow[]) {
  const m = new Map<string, number>()
  for (const r of rows) { const k = `${r.tbl}\u0000${r.old_status ?? ''}`; m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m].map(([k, n]) => { const [tbl, old] = k.split('\u0000'); return { tbl, old_status: old || null, n } }).sort((a, b) => a.tbl.localeCompare(b.tbl) || b.n - a.n)
}
