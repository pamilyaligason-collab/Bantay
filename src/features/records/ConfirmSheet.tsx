import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { position } from '../health/ranges'
import {
  canonicalFor, confirmRows, driveUrl, listDrafts, listTestCatalog, rejectRows, ROW_TABLES, settleDocument, signedUrl, updateRow,
  type CatalogTest, type DocBundle, type Lab, type RowTable, type RxItem, type SourceFile
} from './api'
import type { Person } from './store'
import { usePeople } from './useRecordsServer'
import './records.css'

// D-36 / D-47: nothing counts until a person confirms it. The sheet lists draft documents, then draft rows to confirm, fix or reject.
export const LOW_CONFIDENCE = 0.8
export const KIND: Record<string, string> = { lab: 'Lab results', prescription: 'Prescription', lab_request: 'Lab request', imaging: 'Imaging report', vaccination: 'Vaccination', insurance: 'Insurance', certificate: 'Certificate', id_card: 'ID card', insurance_card: 'Insurance card', other: 'Document' }
export const firstName = (n?: string) => (n ?? '').trim().split(/\s+/)[0] || 'Person'
export const isLow = (c: number | null | undefined) => c != null && c < LOW_CONFIDENCE
export function outOfRange(l: Lab) {
  if (l.flag === 'H' || l.flag === 'L' || l.flag === 'A') return true
  return l.value_num != null && position(l.value_num, { low: l.ref_low, high: l.ref_high }) !== 'within' && position(l.value_num, { low: l.ref_low, high: l.ref_high }) !== 'none'
}
const FLAG: Record<string, string> = { H: 'High', L: 'Low', A: 'Abnormal', N: 'Normal' }
export const labRange = (l: Lab) => (l.ref_low == null && l.ref_high == null ? (l.ref_text ?? '') : l.ref_low == null ? `up to ${l.ref_high}` : l.ref_high == null ? `${l.ref_low} or more` : `${l.ref_low} to ${l.ref_high}`)

type Item = { table: RowTable; row: Lab & RxItem & Record<string, unknown> }
type Field = { key: string; label: string; kind: 'num' | 'text' | 'date' | 'datetime' | 'test'; wide?: boolean }
const FIELDS: Record<RowTable, Field[]> = {
  lab_results: [{ key: 'value_num', label: 'Value', kind: 'num' }, { key: 'unit_raw', label: 'Unit', kind: 'text' }, { key: 'test_code', label: 'Test', kind: 'test', wide: true }, { key: 'collected_at', label: 'Date', kind: 'date', wide: true }],
  prescription_items: [{ key: 'drug_raw', label: 'Medicine', kind: 'text', wide: true }, { key: 'strength', label: 'Strength', kind: 'text' }, { key: 'dose', label: 'Dose', kind: 'text' }, { key: 'frequency', label: 'How often', kind: 'text' }, { key: 'duration', label: 'For how long', kind: 'text' }],
  vaccinations: [{ key: 'vaccine', label: 'Vaccine', kind: 'text', wide: true }, { key: 'dose_no', label: 'Dose number', kind: 'num' }, { key: 'given_on', label: 'Date given', kind: 'date' }],
  imaging_reports: [{ key: 'impression', label: 'Impression', kind: 'text', wide: true }]
}
const cur = (row: Record<string, unknown>, f: Field) => {
  const v = row[f.key]
  return v == null ? '' : f.kind === 'date' ? String(v).slice(0, 10) : String(v)
}

/** Changed fields only. Empty input becomes null (unknown stays blank, never 0). Returns an error key for a bad number. */
export function buildPatch(table: RowTable, row: Record<string, unknown>, form: Record<string, string>, catalog: CatalogTest[]): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {}
  for (const f of FIELDS[table]) {
    const next = (form[f.key] ?? '').trim()
    if (next === cur(row, f)) continue
    if (next === '') patch[f.key] = null
    else if (f.kind === 'num') {
      const n = Number(next.replace(',', '.'))
      if (!Number.isFinite(n)) return { error: `${f.label} must be a number` }
      patch[f.key] = n
    } else if (f.key === 'collected_at') patch[f.key] = `${next}T08:00:00+08:00`
    else patch[f.key] = next
  }
  if (table === 'lab_results' && ['value_num', 'unit_raw', 'test_code'].some((k) => k in patch)) {
    const m = { ...row, ...patch } as Record<string, unknown>
    patch.value_canonical = canonicalFor(catalog.find((c) => c.code === m.test_code), (m.value_num as number | null) ?? null, (m.unit_raw as string | null) ?? null)
  }
  return { patch }
}

function itemsOf(b: DocBundle): Item[] {
  const t = (table: RowTable, rows: unknown[]) => rows.map((row) => ({ table, row })) as Item[]
  return [...t('lab_results', b.labs), ...t('prescription_items', b.items), ...t('vaccinations', b.vaccinations), ...t('imaging_reports', b.imaging)]
}
const title = (i: Item): string => String(i.table === 'lab_results' ? i.row.name_raw : i.table === 'prescription_items' ? (i.row.drug_raw ?? 'Line that could not be read') : i.table === 'vaccinations' ? i.row.vaccine : [i.row.modality, i.row.body_region].filter(Boolean).join(' ') || 'Imaging report')
const unclear = (i: Item) => i.table === 'prescription_items' && !!i.row.unclear
const lowOrOut = (i: Item) => isLow(i.row.confidence) || (i.table === 'lab_results' && outOfRange(i.row))
const defaultChecked = (i: Item) => !unclear(i) && !isLow(i.row.confidence) && !(i.table === 'lab_results' && i.row.value_num == null && i.row.value_text == null)

/** Drive file: plain link. Private-bucket file: a 60 s signed link made on click, opened and forgotten. */
export function OriginalLink({ file }: { file: SourceFile }) {
  const [err, setErr] = useState(false)
  const d = file.drive_file_id ? driveUrl(file.drive_file_id) : null
  if (d) return <a className="rx-open" href={d} target="_blank" rel="noreferrer">Open original ({file.name})</a>
  if (!file.storage_path) return null
  const go = async () => {
    setErr(false)
    const w = window.open('about:blank', '_blank') // opened now so the click is not treated as a popup
    const r = await signedUrl(file.storage_path!)
    if (!r.ok || !w) { w?.close(); setErr(true); return }
    w.opener = null
    w.location.href = r.data
  }
  return (
    <>
      <button className="rx-btn" style={{ justifyContent: 'flex-start' }} onClick={() => void go()}>Open original{file.side ? ` (${file.side})` : ''} ({file.name})</button>
      {err && <span className="sub" role="alert">Could not open the file. Check your connection and try again.</span>}
    </>
  )
}

function Line({ item, catalog, busy, checked, onCheck, onConfirm, onReject, onFix }: {
  item: Item; catalog: CatalogTest[]; busy: boolean; checked: boolean; onCheck(v: boolean): void; onConfirm(): void; onReject(): void
  onFix(patch: Record<string, unknown>): Promise<boolean>
}) {
  const { table, row } = item
  const [fixing, setFixing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const name = title(item)
  const flagged = lowOrOut(item)
  const val = table === 'lab_results' ? (row.value_num ?? row.value_text) : null
  const open = () => { setForm(Object.fromEntries(FIELDS[table].map((f) => [f.key, cur(row, f)]))); setErr(''); setFixing(true) }
  const save = async () => {
    const b = buildPatch(table, row, form, catalog)
    if ('error' in b) return setErr(b.error)
    if (Object.keys(b.patch).length === 0) return setFixing(false)
    if (await onFix(b.patch)) setFixing(false)
  }
  const sub: ReactNode[] = []
  if (table === 'lab_results') {
    sub.push(<span key="r" className="sub">{labRange(row) ? `Lab range: ${labRange(row)}` : 'Lab range: not printed'}{row.flag ? ` · ${FLAG[row.flag] ?? row.flag}` : ''}</span>)
    if (row.confidence != null) sub.push(<span key="c" className="sub">Confidence {Math.round(Number(row.confidence) * 100)}%</span>)
    if (!row.test_code) sub.push(<span key="t" className="sub">Not matched to a test yet, so it will not be charted.</span>)
  } else if (table === 'prescription_items') {
    const line = [row.strength, row.dose, row.frequency, row.duration].filter(Boolean).join(' · ')
    if (line) sub.push(<span key="l" className="sub">{line}</span>)
  } else if (table === 'vaccinations') sub.push(<span key="v" className="sub">{[row.dose_no ? `Dose ${row.dose_no}` : '', row.given_on ?? ''].filter(Boolean).join(' · ')}</span>)
  else if (row.impression) sub.push(<span key="i" className="sub">{String(row.impression)}</span>)
  return (
    <div className={`row rx-row${flagged ? ' flag' : ''}`} data-flagged={flagged ? 'true' : undefined} data-row={row.id}>
      <div className="rx-main">
        {unclear(item) ? <span style={{ width: 44, flex: 'none' }} /> : (
          <label className="rx-check"><input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Include ${name}`} /></label>
        )}
        <span className="grow">
          <span>{name}</span>
          {unclear(item) && <span className="rx-badge">Unclear: check this line</span>}
          {isLow(row.confidence) && <span className="rx-badge">Low confidence</span>}
          {table === 'lab_results' && outOfRange(row) && <span className="rx-badge">Outside the lab range</span>}
          {sub}
        </span>
        {table === 'lab_results' && <span className="rx-val">{val == null ? <span className="sub">Not read</span> : `${val} ${row.unit_raw ?? ''}`}</span>}
      </div>
      {fixing ? (
        <div className="rx-form">
          {FIELDS[table].map((f) => (
            <label key={f.key} className={f.wide ? 'wide' : undefined}>
              {f.label}
              {f.kind === 'test' ? (
                <select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  <option value="">Not matched</option>
                  {catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              ) : (
                <input type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'num' ? 'decimal' : undefined} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          {err && <p className="sub wide" role="alert" style={{ gridColumn: '1 / -1', margin: 0 }}>{err}</p>}
          <div className="rx-acts wide" style={{ gridColumn: '1 / -1' }}>
            <button className="rx-btn go" disabled={busy} onClick={() => void save()}>Save fix</button>
            <button className="rx-btn" onClick={() => setFixing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="rx-acts">
          <button className="rx-btn" onClick={open} aria-label={`Fix ${name}`}>Fix</button>
          <button className="rx-btn go" disabled={busy} onClick={onConfirm} aria-label={`${unclear(item) ? 'Confirm line' : 'Confirm'} ${name}`}>{unclear(item) ? 'Confirm line' : 'Confirm'}</button>
          <button className="rx-btn no" disabled={busy} onClick={onReject} aria-label={`Reject ${name}`}>Reject</button>
        </div>
      )}
    </div>
  )
}

export function ConfirmFlow({ people: initialPeople, onClose, onChanged }: { people: Person[]; onClose(): void; onChanged(): void }) {
  const people = usePeople(initialPeople)
  const [bundles, setBundles] = useState<DocBundle[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogTest[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState(false)
  const head = useRef<HTMLHeadingElement>(null)
  const opener = useRef<Element | null>(document.activeElement)

  useEffect(() => {
    void listDrafts().then((r) => (r.ok ? setBundles(r.data) : (setBundles([]), setLoadErr(true))))
    void listTestCatalog().then((r) => r.ok && setCatalog(r.data))
  }, [])
  useEffect(() => { head.current?.focus() }, [openId, bundles === null])
  useEffect(() => {
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const back = opener.current as HTMLElement | null
    return () => { root?.removeAttribute('inert'); back?.focus?.() }
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (openId) setOpenId(null); else onClose() } }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [openId, onClose])

  const open = bundles?.find((b) => b.doc.id === openId)
  useEffect(() => {
    // a document opened with no rows left may only need closing (an earlier settle failed): let the server decide
    const b = bundles?.find((x) => x.doc.id === openId)
    if (!b || itemsOf(b).length > 0) return
    void settleDocument(b.doc.id).then((s) => {
      if (s.ok && s.data !== 'open') { setBundles((bs) => bs && bs.filter((x) => x.doc.id !== b.doc.id)); setOpenId(null); onChanged() }
    })
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function actDoc(kind: 'confirm' | 'reject') {
    if (!open) return
    setBusy(true)
    const r = kind === 'confirm' ? await confirmRows('documents', [open.doc.id]) : await rejectRows('documents', [open.doc.id])
    setBusy(false)
    if (!r.ok) return setMsg('Could not save. Check your connection and try again.')
    setBundles((bs) => bs && bs.filter((b) => b.doc.id !== open.doc.id))
    setOpenId(null)
    setMsg(kind === 'confirm' ? 'Document confirmed' : 'Document rejected')
    onChanged()
  }
  const who = (pid: string) => firstName(people.find((p) => p.id === pid)?.name)
  const items = open ? itemsOf(open) : []
  const isOn = (i: Item) => checked[i.row.id] ?? defaultChecked(i)
  const batch = items.filter((i) => isOn(i) && !unclear(i)) // an unclear line is never swept in

  const patchBundle = (id: string, f: (b: DocBundle) => DocBundle) => setBundles((bs) => bs && bs.map((b) => (b.doc.id === id ? f(b) : b)))
  const without = (ids: string[]) => (b: DocBundle): DocBundle => {
    const keep = <T extends { id: string }>(r: T[]) => r.filter((x) => !ids.includes(x.id))
    return { ...b, labs: keep(b.labs), items: keep(b.items), vaccinations: keep(b.vaccinations), imaging: keep(b.imaging) }
  }

  async function act(kind: 'confirm' | 'reject', picked: Item[]) {
    if (!open || picked.length === 0) return
    setBusy(true)
    let done = 0
    let failed = false
    for (const t of ROW_TABLES) {
      const ids = picked.filter((i) => i.table === t).map((i) => i.row.id)
      if (!ids.length) continue
      const r = kind === 'confirm' ? await confirmRows(t, ids) : await rejectRows(t, ids)
      if (r.ok) { done += r.data.changed; patchBundle(open.doc.id, without(r.data.ids)); if (r.data.ids.length < ids.length) failed = true } else failed = true
    }
    const word = kind === 'confirm' ? 'confirmed' : 'rejected'
    setMsg(failed ? `${done ? `${done} ${word}. ` : ''}Could not save the rest. Check your connection and try again.` : `${done} ${word}`)
    if (done) {
      onChanged()
      const s = await settleDocument(open.doc.id)
      if (s.ok && s.data !== 'open') { setBundles((bs) => bs && bs.filter((b) => b.doc.id !== open.doc.id)); setOpenId(null) }
    }
    setBusy(false)
  }

  async function fix(item: Item, patch: Record<string, unknown>) {
    setBusy(true)
    const r = await updateRow(item.table, item.row.id, patch)
    setBusy(false)
    if (!r.ok) { setMsg(r.error === 'column_not_allowed' ? 'That field cannot be changed.' : 'Could not save the fix. Check your connection and try again.'); return false }
    patchBundle(open!.doc.id, (b) => {
      const apply = <T extends { id: string }>(rows: T[]) => rows.map((x) => (x.id === item.row.id ? { ...x, ...patch } : x))
      return { ...b, labs: apply(b.labs), items: apply(b.items), vaccinations: apply(b.vaccinations), imaging: apply(b.imaging) }
    })
    setMsg('Fix saved')
    onChanged()
    return true
  }

  const label = (b: DocBundle) => `${KIND[b.doc.kind] ?? 'Document'}${b.doc.doc_date ? `, ${b.doc.doc_date}` : ''}`
  return createPortal(
    <>
    <div className="sheet-dim" aria-hidden="true" />
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="cs-h">
      <div className="sheet-top">
        {open && <button className="rx-btn" onClick={() => setOpenId(null)}>Back</button>}
        <span className="grow" />
        <button className="rx-btn" onClick={onClose}>Close</button>
      </div>
      <h2 id="cs-h" ref={head} tabIndex={-1}>{open ? label(open) : 'To check'}</h2>
      {open && <p className="sub" style={{ margin: 0 }}>{[who(open.doc.person_id), open.doc.facility].filter(Boolean).join(' · ')}</p>}
      <p className="rx-status" role="status" aria-live="polite">{msg}</p>

      {!open && (
        <div className="grp">
          {bundles === null && <div className="row"><span className="grow sub">Loading</span></div>}
          {bundles?.length === 0 && <div className="row"><span className="grow">{loadErr ? 'Could not load. Check your connection.' : 'Nothing to check'}</span></div>}
          {bundles?.map((b) => {
            const n = itemsOf(b).length
            return (
              <button key={b.doc.id} className="row" onClick={() => { setOpenId(b.doc.id); setMsg('') }}>
                <span className="grow">
                  <span>{label(b)}</span>
                  <span className="sub">{[who(b.doc.person_id), b.doc.facility, `${n} to check`].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {open && (
        <>
          {open.files.map((f) => <OriginalLink key={f.id} file={f} />)}
          {items.length === 0 ? (
            <>
              <div className="grp"><div className="row"><span className="grow sub">This document has no values to check. Look at the original, then confirm or reject it.</span></div></div>
              <button className="btn" disabled={busy} onClick={() => void actDoc('confirm')}>Confirm document</button>
              <button className="btn2" disabled={busy} onClick={() => void actDoc('reject')}>Reject document</button>
            </>
          ) : (
            <div className="grp">
              {items.map((i) => (
                <Line key={i.row.id} item={i} catalog={catalog} busy={busy} checked={isOn(i)} onCheck={(v) => setChecked({ ...checked, [i.row.id]: v })}
                  onConfirm={() => void act('confirm', [i])} onReject={() => void act('reject', [i])} onFix={(p) => fix(i, p)} />
              ))}
            </div>
          )}
          {items.length > 0 && (
            <>
              <button className="btn" disabled={busy || batch.length === 0} onClick={() => void act('confirm', batch)}>Confirm all checked ({batch.length})</button>
              {items.some(unclear) && <p className="sub" style={{ margin: 0 }}>Unclear lines are confirmed one at a time.</p>}
            </>
          )}
        </>
      )}
    </div>
    </>,
    document.body
  )
}
