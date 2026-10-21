import { useEffect, useState } from 'react'
import { driveUrl, EDITABLE, settleDocument, signedUrl, updateRow, type Table } from '../../records/api'
import { NOT_CONNECTED } from '../shared'
import type { PageProps } from './types'
import { Empty, Filters, PageHead, Panel, statusTone, Tag, useToast } from './ui'
import { useDeskPeople } from './people'
import { deskHref } from './types'
import {
  CAP, filesOf, KINDS, listKind, parentDoc, reopenDocument, restore, searchRows, setStatusFor,
  type Filter, type KindKey, type KRow, type PageFile, type Row, type Status
} from './recordsApi'
import './records.css'

export const say = (e: string) =>
  e === 'not_connected' ? NOT_CONNECTED : e === 'forbidden' ? 'Nothing changed. You may not have access to that row.' : e === 'invalid' ? 'Check the value and try again.' : e === 'column_not_allowed' ? 'That field cannot be edited.' : 'Something went wrong. Try again.'

const NUMERIC = new Set(['value_num', 'value_canonical', 'ref_low', 'ref_high', 'dose_no'])
const isDate = (k: string) => /_(on|date)$/.test(k) || k === 'doc_date'
const label = (k: string) => k.replace(/_/g, ' ')
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

/** Inputs for the EDITABLE columns of one row (dashboard Records panel and Queue Fix). */
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

/** Page images or PDF of the paper, from the private bucket (60 s links) or Drive. */
function Preview({ docId }: { docId: string }) {
  const [files, setFiles] = useState<PageFile[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [bad, setBad] = useState(false)
  useEffect(() => {
    let live = true
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

/** The cell that opens the panel. A paper with no title falls back to its kind. */
const primaryText = (r: KRow, key: string) => fmt(r[key]) || (key === 'title' ? fmt(r.kind) : '') || '(blank)'

export default function Records({ id }: PageProps) {
  const { people, error: peopleErr, nameOf } = useDeskPeople()
  const [kindKey, setKind] = useState<KindKey>('papers')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<KRow[] | null>(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<KRow | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const kind = KINDS.find((k) => k.key === kindKey)!

  useEffect(() => {
    let live = true
    const f: Filter = { person: id, status, from, to }
    setRows(null); setErr('')
    void listKind(kind, f).then((r) => { if (!live) return; if (r.ok) setRows(r.data); else { setRows([]); setErr(say(r.error)) } })
    return () => { live = false }
  }, [kind, id, status, from, to, tick])

  const shown = rows ? searchRows(rows, q, kind.text) : []
  const reload = () => { setSel(null); setTick((t) => t + 1) }

  const decide = async (row: KRow, next: 'confirmed' | 'rejected') => {
    setBusy(true)
    try {
      const prev = row.status
      const doc = await parentDoc(row._table, row)
      const r = await setStatusFor(row._table, [row.id], next)
      if (!r.ok) return toast.show(say(r.error))
      if (doc && row._table !== 'documents') await settleDocument(doc.id)
      reload()
      toast.show(next === 'confirmed' ? 'Confirmed.' : 'Rejected.', () => {
        void restore([{ table: row._table, ids: [row.id], prev }]).then(async (u) => {
          if (u.ok && doc && row._table !== 'documents') await reopenDocument(doc.id, doc.status)
          toast.show(u.ok ? 'Put back.' : say(u.error))
          setTick((t) => t + 1)
        })
      })
    } finally { setBusy(false) }
  }

  const fix = async (row: KRow, patch: Record<string, unknown>) => {
    const r = await updateRow(row._table as Table, row.id, patch)
    if (!r.ok) { toast.show(say(r.error)); return false }
    toast.show('Saved.'); reload()
    return true
  }

  const primary = kind.key === 'papers' ? 'title' : kind.cols[1].key
  return (
    <>
      <PageHead title="Records" sub={id ? nameOf(id) : 'Everyone'} />
      <Filters>
        <button className="dk-chip" aria-pressed={id === null} onClick={() => { location.hash = deskHref('records') }}>Everyone</button>
        {people?.map((p) => <button key={p.id} className="dk-chip" aria-pressed={id === p.id} onClick={() => { location.hash = deskHref('records', p.id) }}>{p.display_name}</button>)}
        {peopleErr && <span className="rc-err" role="alert">Could not load people.</span>}
      </Filters>
      <div className="dk-filters" role="group" aria-label="Kind of record">
        {KINDS.map((k) => <button key={k.key} className="dk-chip" aria-pressed={k.key === kindKey} onClick={() => { setKind(k.key); setSel(null) }}>{k.label}</button>)}
      </div>
      <Filters>
        {(['all', 'draft', 'confirmed', 'rejected'] as const).map((s) => <button key={s} className="dk-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}</button>)}
        <label className="rc-lbl">From<input className="dk-in" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="rc-lbl">To<input className="dk-in" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="rc-lbl rc-grow">Search<input className="dk-in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind.label.toLowerCase()}`} /></label>
      </Filters>
      {err && <p className="rc-err" role="alert">{err}</p>}
      {rows === null ? <Empty>Loading...</Empty> : shown.length === 0 ? <Empty>Nothing matches.</Empty> : (
        <>
          {rows.length >= CAP && <p className="dk-sub">Showing the newest {CAP}. Narrow the dates or person to see older rows.</p>}
          <div className="dk-scrollx">
            <table className="dk-table">
              <caption className="rc-cap">{kind.label}, {shown.length} {shown.length === 1 ? 'row' : 'rows'}</caption>
              <thead><tr>
                {kind.cols.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
                {!id && <th scope="col">Person</th>}<th scope="col">Status</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r._table + r.id} aria-selected={sel?.id === r.id}>
                    {kind.cols.map((c) => <td key={c.key}>{c.key === primary ? <button className="dk-rowbtn" onClick={() => setSel(r)}>{primaryText(r, primary)}</button> : fmt(c.key === 'when' ? r.when : r[c.key])}</td>)}
                    {!id && <td>{nameOf(r.person_id as string)}</td>}
                    <td><Tag tone={statusTone(r.status)}>{r.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sel && <Detail key={sel.id} row={sel} title={`${kind.label}: ${primaryText(sel, primary)}`} person={nameOf(sel.person_id as string)} busy={busy} onClose={() => setSel(null)} onDecide={(n) => void decide(sel, n)} onFix={(p) => fix(sel, p)} />}
      {toast.node}
    </>
  )
}

function Detail({ row, title, person, busy, onClose, onDecide, onFix }: { row: KRow; title: string; person: string; busy: boolean; onClose(): void; onDecide(n: 'confirmed' | 'rejected'): void; onFix(p: Record<string, unknown>): Promise<boolean> }) {
  const [docId, setDocId] = useState<string | null>(null)
  useEffect(() => { let live = true; void parentDoc(row._table, row).then((d) => live && setDocId(d?.id ?? null)); return () => { live = false } }, [row])
  const edit = EDITABLE[row._table as Table]
  const ro = Object.entries(row).filter(([k]) => !['client_id', '_table', 'when'].includes(k) && !edit?.includes(k))
  return (
    <Panel title={title} onClose={onClose}>
      <p className="dk-sub">{person} <Tag tone={statusTone(row.status)}>{row.status}</Tag></p>
      <div className="dk-acts">
        <button className="dk-b go" disabled={busy || row.status === 'confirmed'} onClick={() => onDecide('confirmed')}>Confirm</button>
        <button className="dk-b bad rc-bad" disabled={busy || row.status === 'rejected'} onClick={() => onDecide('rejected')}>Reject</button>
      </div>
      {docId && <Preview docId={docId} />}
      {edit && <EditFields table={row._table} row={row} onSave={onFix} />}
      <dl className="rc-dl">{ro.map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{fmt(v) || '-'}</dd></div>)}</dl>
    </Panel>
  )
}
