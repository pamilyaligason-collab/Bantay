import { useEffect, useRef, useState, type ReactNode } from 'react'
import { driveUrl, EDITABLE, signedUrl, type Table } from '../../records/api'
import { NOT_CONNECTED } from '../shared'
import { filesOf, type PageFile, type Row } from './recordsApi'

// Shared by Records and Queue: error words and the edit form for the EDITABLE columns.
export const say = (e: string) =>
  e === 'not_connected' ? NOT_CONNECTED : e === 'forbidden' ? 'Nothing changed. You may not have access to that row.' : e === 'invalid' ? 'Check the value and try again.' : e === 'column_not_allowed' ? 'That field cannot be edited.' : 'Something went wrong. Try again.'

const NUMERIC = new Set(['value_num', 'value_canonical', 'ref_low', 'ref_high', 'dose_no'])
const isDate = (k: string) => /_(on|date)$/.test(k) || k === 'doc_date'
/** Plain names for the database columns (audit R1). Anything not listed falls back to the column name with spaces. */
export const FIELD_LABELS: Record<string, string> = {
  name_raw: 'Test', value_num: 'Value', value_text: 'Value (text)', unit_raw: 'Unit', value_canonical: 'Value in standard unit', test_code: 'Test code',
  collected_at: 'Collected on', flag: 'Flag', ref_low: 'Range low', ref_high: 'Range high', ref_text: 'Range (text)',
  drug_raw: 'Medicine', generic_name: 'Generic name', brand: 'Brand', strength: 'Strength', form: 'Form', dose: 'Dose', frequency: 'How often', duration: 'Duration', quantity: 'Quantity', instructions: 'Instructions',
  vaccine: 'Vaccine', dose_no: 'Dose number', given_on: 'Given on', facility: 'Facility', lot: 'Lot number',
  modality: 'Scan type', body_region: 'Body part', findings: 'Findings', impression: 'Impression', reported_at: 'Reported on',
  doc_date: 'Paper date', title: 'Title', rx_date: 'Prescription date', prescriber: 'Doctor', follow_up_on: 'Follow-up on',
  document_id: 'Paper', prescription_id: 'Prescription', person_id: 'Person', line_no: 'Line', created_at: 'Added on', confirmed_at: 'Confirmed on', confirmed_by: 'Confirmed by', unclear: 'Unclear handwriting', confidence: 'Read confidence'
}
export const label = (k: string) => FIELD_LABELS[k] ?? k.replace(/_/g, ' ')
export const fmt = (v: unknown): string => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v).slice(0, 10) : String(v))

/** Changed editable fields only. Empty becomes null (unknown stays null, never 0); a bad number is an error. */
export function buildEditPatch(table: string, row: Record<string, unknown>, form: Record<string, string>): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE[table as Table] ?? []) {
    if (!(k in form)) continue
    const next = (form[k] ?? '').trim()
    const was = fmt(row[k])
    if (next === was) continue
    if (next === '') patch[k] = null
    else if (NUMERIC.has(k)) {
      const n = Number(next.replace(',', '.'))
      if (!Number.isFinite(n)) return { error: `${label(k)} must be a number` }
      patch[k] = n
    } else patch[k] = next
  }
  return { patch }
}

/** Inputs for the EDITABLE columns of one row (Records panel and Queue Fix). */
export function EditFields({ table, row, onSave, onCancel }: { table: string; row: Row; onSave(patch: Record<string, unknown>): Promise<boolean>; onCancel?(): void }) {
  const cols = EDITABLE[table as Table]
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries((cols ?? []).map((k) => [k, fmt(row[k])])))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!cols) return null
  const save = async () => {
    const b = buildEditPatch(table, row, form)
    if ('error' in b) return setErr(b.error)
    if (Object.keys(b.patch).length === 0) return onCancel?.()
    setErr(''); setBusy(true)
    try { await onSave(b.patch) } finally { setBusy(false) }
  }
  return (
    <form className="rc-edit" onSubmit={(e) => { e.preventDefault(); void save() }}>
      {cols.map((k) => (
        <label key={k} className="dk-field">{label(k)}
          <input className="dk-in" type={isDate(k) ? 'date' : 'text'} inputMode={NUMERIC.has(k) ? 'decimal' : undefined} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        </label>
      ))}
      {err && <p className="rc-err" role="alert">{err}</p>}
      <div className="dk-acts"><button className="dk-b go" type="submit" disabled={busy}>Save fix</button>{onCancel && <button className="dk-b" type="button" onClick={onCancel}>Cancel</button>}</div>
    </form>
  )
}

/** A load that failed: say so with a Retry. Never show "nothing here" for an error (audit Q1). */
export function LoadError({ children, onRetry }: { children: ReactNode; onRetry(): void }) {
  return <div className="rc-lerr" role="alert"><p className="rc-err">{children}</p><button className="dk-b" onClick={onRetry}>Retry</button></div>
}

/** Page images or PDF of the paper, from the private bucket (60 s links) or Drive. */
export function Preview({ docId }: { docId: string }) {
  const [files, setFiles] = useState<PageFile[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [bad, setBad] = useState(false)
  useEffect(() => {
    let live = true
    setFiles(null); setUrls({}); setBad(false)
    void filesOf(docId).then(async (r) => {
      if (!live) return
      if (!r.ok) return setBad(true)
      setFiles(r.data)
      for (const f of r.data) if (f.storage_path) void signedUrl(f.storage_path).then((u) => live && u.ok && setUrls((x) => ({ ...x, [f.id]: u.data })))
    })
    return () => { live = false }
  }, [docId])
  if (bad) return <p className="rc-err" role="alert">Could not load the source pages.</p>
  if (!files) return <p className="dk-sub">Loading the source page...</p>
  if (files.length === 0) return <p className="dk-sub">No source page on file.</p>
  return (
    <div className="rc-pages">
      {files.map((f) => {
        const d = f.drive_file_id ? driveUrl(f.drive_file_id) : null
        const u = urls[f.id]
        return (
          <figure key={f.id} className="rc-page">
            {u && f.mime.startsWith('image/') && <img src={u} alt={`Source page ${f.name}`} />}
            {u && f.mime === 'application/pdf' && <iframe src={u} title={`Source page ${f.name}`} />}
            {f.storage_path && !u && <p className="dk-sub">Loading {f.name}...</p>}
            {d && !f.storage_path && <a className="dk-b" href={d} target="_blank" rel="noreferrer">Open {f.name} in Drive</a>}
          </figure>
        )
      })}
    </div>
  )
}

/** Tab strip that scrolls sideways. A fade and a "More" button show when tabs are cut off (audit P4); `nav` renders links, otherwise a tablist. */
export function TabScroller({ nav, label: aria, children }: { nav: boolean; label: string; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const t = el.current
    if (!t) return
    const measure = () => setMore(t.scrollLeft + t.clientWidth < t.scrollWidth - 4)
    measure()
    t.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => { t.removeEventListener('scroll', measure); window.removeEventListener('resize', measure) }
  }, [children])
  const props = { ref: el, className: 'dk-tabs' } as const
  return (
    <div className="rc-tabsw" data-more={more || undefined}>
      {nav ? <nav {...props} aria-label={aria}>{children}</nav> : <div {...props} role="tablist" aria-label={aria}>{children}</div>}
      {more && <button className="dk-b rc-more" aria-label="Show more kinds of record" onClick={() => el.current?.scrollBy({ left: 240, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>More &rsaquo;</button>}
    </div>
  )
}
