import { Fragment, useEffect, useRef, useState } from 'react'
import { confirmRows, listDrafts, rejectRows, settleDocument, updateRow, type DocBundle, type Table } from '../../records/api'
import { KIND } from '../../records/ConfirmSheet'
import { emitConfirmed } from '../../records/papers'
import type { PageProps } from './types'
import { Empty, PageHead, Tag, useConfirm, useToast } from './ui'
import { useDeskPeople } from './people'
import { EditFields, fmt, say } from './Records'
import { defaultChecked, isLow, queueKey, reopenDocument, restore, type Change, type QItem, type QTable, type Status } from './recordsApi'
import './records.css'

const TITLE: Record<QTable, (r: QItem['row']) => string> = {
  lab_results: (r) => String(r.name_raw ?? 'Result'),
  prescription_items: (r) => String(r.drug_raw ?? 'Line that could not be read'),
  vaccinations: (r) => String(r.vaccine ?? 'Vaccination'),
  imaging_reports: (r) => [r.modality, r.body_region].filter(Boolean).join(' ') || 'Imaging report'
}
const detail = (i: QItem): string => {
  const r = i.row as Record<string, unknown>
  if (i.table === 'lab_results') return [r.value_num ?? r.value_text, r.unit_raw, r.flag ? `flag ${r.flag}` : ''].filter((x) => x != null && x !== '').join(' ') || 'Not read'
  if (i.table === 'prescription_items') return [r.strength, r.dose, r.frequency, r.duration].filter(Boolean).join(' · ')
  if (i.table === 'vaccinations') return [r.dose_no ? `Dose ${r.dose_no}` : '', fmt(r.given_on)].filter(Boolean).join(' · ')
  return String(r.impression ?? '')
}
const itemsOf = (b: DocBundle): QItem[] => [
  ...b.labs.map((row) => ({ table: 'lab_results' as const, row })), ...b.items.map((row) => ({ table: 'prescription_items' as const, row })),
  ...b.vaccinations.map((row) => ({ table: 'vaccinations' as const, row })), ...b.imaging.map((row) => ({ table: 'imaging_reports' as const, row }))
] as unknown as QItem[]
const paperName = (d: DocBundle['doc']) => [KIND[d.kind] ?? 'Document', d.title, d.facility, d.doc_date].filter(Boolean).join(', ')

export default function Queue(_: PageProps) {
  const { nameOf } = useDeskPeople()
  const [papers, setPapers] = useState<DocBundle[] | null>(null)
  const [err, setErr] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(-1)
  const [fixing, setFixing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const seenRows = useRef(new Set<string>()) // rows already offered: new ones get the default tick, old ones keep the admin's choice
  const seenDocs = useRef(new Set<string>())
  const toast = useToast()
  const conf = useConfirm()

  const load = async () => {
    const r = await listDrafts()
    if (!r.ok) { setErr(say(r.error)); return setPapers([]) }
    setErr(''); setPapers(r.data)
    setChecked((prev) => {
      const next = new Set<string>()
      const now = new Set<string>()
      for (const b of r.data) for (const i of itemsOf(b)) {
        if (seenRows.current.has(i.row.id) ? prev.has(i.row.id) : defaultChecked(i)) next.add(i.row.id)
        now.add(i.row.id)
      }
      seenRows.current = now // a row that left the queue (confirmed) and came back (Undo) gets the default tick again
      return next
    })
  }
  useEffect(() => { void load() }, [])

  const flat = (papers ?? []).flatMap(itemsOf)
  const byPerson = new Map<string, DocBundle[]>()
  for (const b of papers ?? []) byPerson.set(b.doc.person_id, [...(byPerson.get(b.doc.person_id) ?? []), b])
  const totals = { lab_results: 0, prescription_items: 0, vaccinations: 0, imaging_reports: 0 }
  for (const i of flat) totals[i.table]++
  const checkedItems = flat.filter((i) => checked.has(i.row.id))
  const docOf = new Map<string, DocBundle>()
  for (const b of papers ?? []) for (const i of itemsOf(b)) docOf.set(i.row.id, b)

  // Confirm or reject a set of rows, close the papers that have nothing left, then offer Undo.
  const apply = async (items: QItem[], verb: 'confirmed' | 'rejected', extra: { table: 'documents'; id: string }[] = []) => {
    setBusy(true)
    try {
      const changes: Change[] = []
      const docs = new Set<string>()
      for (const t of ['lab_results', 'prescription_items', 'vaccinations', 'imaging_reports'] as QTable[]) {
        const ids = items.filter((i) => i.table === t).map((i) => i.row.id)
        if (ids.length === 0) continue
        const r = await (verb === 'confirmed' ? confirmRows : rejectRows)(t, ids)
        if (!r.ok) { toast.show(say(r.error)); break }
        changes.push({ table: t, ids: r.data.ids, prev: 'draft' })
        for (const id of r.data.ids) { const b = docOf.get(id); if (b) docs.add(b.doc.id) }
      }
      for (const x of extra) {
        const r = await (verb === 'confirmed' ? confirmRows : rejectRows)(x.table, [x.id])
        if (r.ok) changes.push({ table: 'documents', ids: [x.id], prev: 'draft' })
        else toast.show(say(r.error))
      }
      const prevDoc = new Map<string, Status>()
      for (const id of docs) {
        prevDoc.set(id, (papers ?? []).find((b) => b.doc.id === id)!.doc.status as Status)
        const s = await settleDocument(id)
        if (s.ok && s.data === 'confirmed') emitConfirmed(id, seenDocs.current)
      }
      if (changes.length === 0) return
      const n = changes.reduce((a, c) => a + c.ids.length, 0)
      toast.show(`${n} ${verb}.`, () => {
        void restore(changes).then(async (u) => {
          if (u.ok) for (const [id, st] of prevDoc) await reopenDocument(id, st)
          toast.show(u.ok ? 'Put back.' : say(u.error))
          void load()
        })
      })
      await load()
    } finally { setBusy(false) }
  }

  const confirmChecked = () => {
    const n = checkedItems.length
    if (n === 0 || busy) return
    const go = () => apply(checkedItems, 'confirmed')
    if (n > 1) conf.ask(`Confirm ${n} checked rows? Unchecked rows stay in the queue.`, go)
    else void go()
  }
  const rejectPaper = (b: DocBundle) => {
    const its = itemsOf(b)
    conf.ask(`Reject this paper (${paperName(b.doc)})? ${its.length} ${its.length === 1 ? 'row goes' : 'rows go'} to Rejected. You can undo right after.`,
      () => apply(its, 'rejected', its.length ? [] : [{ table: 'documents', id: b.doc.id }]))
  }
  const toggle = (id: string, on?: boolean) => setChecked((s) => { const n = new Set(s); if (on ?? !n.has(id)) n.add(id); else n.delete(id); return n })

  // j/k/x/c; always reads the latest state through the ref.
  const latest = useRef({ flat, cursor, confirmChecked, toggle })
  latest.current = { flat, cursor, confirmChecked, toggle }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="alertdialog"]')) return
      const a = queueKey({ key: e.key, target: e.target as HTMLElement | null, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey })
      if (!a) return
      const { flat: f, cursor: c } = latest.current
      if (a === 'confirm') return latest.current.confirmChecked()
      if (f.length === 0) return
      if (a === 'toggle') { const i = f[c]; if (i && !(i.table === 'prescription_items' && i.row.unclear)) latest.current.toggle(i.row.id); return }
      const n = Math.min(f.length - 1, Math.max(0, a === 'next' ? c + 1 : c - 1))
      setCursor(n)
      document.querySelector<HTMLElement>(`[data-qi="${n}"]`)?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fixRow = async (i: QItem, patch: Record<string, unknown>) => {
    const r = await updateRow(i.table as Table, i.row.id, patch)
    if (!r.ok) { toast.show(say(r.error)); return false }
    toast.show('Saved.'); setFixing(null); await load()
    return true
  }

  let idx = -1
  return (
    <>
      <PageHead title="Confirm queue" sub={papers ? `${flat.length} draft ${flat.length === 1 ? 'row' : 'rows'} in ${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}` : 'Loading...'}>
        <button className="dk-b go" disabled={busy || checkedItems.length === 0} onClick={confirmChecked}>Confirm {checkedItems.length} checked</button>
      </PageHead>
      {papers && <p className="dk-sub" data-testid="q-totals">Lab results {totals.lab_results} · Prescription lines {totals.prescription_items} · Vaccinations {totals.vaccinations} · Imaging {totals.imaging_reports}. Keys: j and k move, x ticks, c confirms the ticked rows.</p>}
      {err && <p className="rc-err" role="alert">{err}</p>}
      {papers === null ? <Empty>Loading...</Empty> : papers.length === 0 ? <Empty>Nothing to confirm.</Empty> : [...byPerson].map(([pid, bs]) => (
        <section key={pid} className="rc-person" aria-label={nameOf(pid)}>
          <h2 className="h2">{nameOf(pid)}</h2>
          {bs.map((b) => {
            const its = itemsOf(b)
            return (
              <div key={b.doc.id} className="rc-paper">
                <div className="dk-head">
                  <h3 className="dk-grow rc-h3">{paperName(b.doc)}</h3>
                  <div className="dk-acts">
                    {its.length === 0 && <button className="dk-b go" disabled={busy} aria-label={`Confirm paper ${paperName(b.doc)}`} onClick={() => void apply([], 'confirmed', [{ table: 'documents', id: b.doc.id }])}>Confirm paper</button>}
                    <button className="dk-b bad rc-bad" disabled={busy} aria-label={`Reject paper ${paperName(b.doc)}`} onClick={() => rejectPaper(b)}>Reject paper</button>
                  </div>
                </div>
                {its.length === 0 ? <p className="dk-sub">No rows were read from this paper.</p> : (
                  <div className="dk-scrollx">
                    <table className="dk-table">
                      <caption className="rc-cap">{paperName(b.doc)}</caption>
                      <thead><tr><th scope="col">Include</th><th scope="col">Item</th><th scope="col">Value</th><th scope="col">Check</th><th scope="col">Actions</th></tr></thead>
                      <tbody>
                        {its.map((i) => {
                          idx++
                          const n = idx
                          const name = TITLE[i.table](i.row)
                          const unclear = i.table === 'prescription_items' && !!i.row.unclear
                          return (
                            <Fragment key={i.row.id}>
                              <tr data-qi={n} data-row={i.row.id} tabIndex={n === Math.max(cursor, 0) ? 0 : -1} className="rc-qrow" onFocus={() => setCursor(n)}>
                                <td><input type="checkbox" className="rc-check" checked={checked.has(i.row.id)} disabled={unclear} onChange={(e) => toggle(i.row.id, e.target.checked)} aria-label={unclear ? `${name} is unclear: confirm it on its own` : `Include ${name}`} /></td>
                                <td>{name}</td>
                                <td>{detail(i)}</td>
                                <td>
                                  {unclear && <Tag tone="warn">Unclear</Tag>}{' '}
                                  {isLow(i.row.confidence) && <Tag tone="warn">Low confidence</Tag>}
                                  {i.row.confidence != null && <span className="dk-sub"> {Math.round(Number(i.row.confidence) * 100)}%</span>}
                                </td>
                                <td>
                                  <div className="dk-acts">
                                    {unclear && <button className="dk-b go" disabled={busy} aria-label={`Confirm ${name}`} onClick={() => void apply([i], 'confirmed')}>Confirm</button>}
                                    <button className="dk-b" aria-label={`Fix ${name}`} aria-expanded={fixing === i.row.id} onClick={() => setFixing(fixing === i.row.id ? null : i.row.id)}>Fix</button>
                                  </div>
                                </td>
                              </tr>
                              {fixing === i.row.id && <tr><td colSpan={5}><EditFields table={i.table} row={i.row} onSave={(p) => fixRow(i, p)} onCancel={() => setFixing(null)} /></td></tr>}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      ))}
      {conf.node}
      {toast.node}
    </>
  )
}
