import { useState } from 'react'
import { EDITABLE, type Table } from '../../records/api'
import { NOT_CONNECTED } from '../shared'
import type { Row } from './recordsApi'

// Shared by Records and Queue: error words and the edit form for the EDITABLE columns.
export const say = (e: string) =>
  e === 'not_connected' ? NOT_CONNECTED : e === 'forbidden' ? 'Nothing changed. You may not have access to that row.' : e === 'invalid' ? 'Check the value and try again.' : e === 'column_not_allowed' ? 'That field cannot be edited.' : 'Something went wrong. Try again.'

const NUMERIC = new Set(['value_num', 'value_canonical', 'ref_low', 'ref_high', 'dose_no'])
const isDate = (k: string) => /_(on|date)$/.test(k) || k === 'doc_date'
export const label = (k: string) => k.replace(/_/g, ' ')
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
