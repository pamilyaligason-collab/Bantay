import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from '../../auth/client'
import { deskHref } from './types'
import { confirmRows, listDrafts, rejectRows, settleDocument, updateRow, type DocBundle, type Table } from '../../records/api'
import { KIND } from '../../records/ConfirmSheet'
import { emitConfirmed } from '../../records/papers'
import type { PageProps } from './types'
import { BulkBar, Empty, PageHead, Tag, useConfirm, useToast } from './ui'
import { useDeskPeople } from './people'
import { EditFields, fmt, LoadError, Preview, say } from './recordsUi'
import { defaultChecked, isLow, labRange, labTag, labValue, queueKey, reopenDocument, restore, type Change, type QItem, type QTable, type Status } from './recordsApi'
import './records.css'

const TITLE: Record<QTable, (r: QItem['row']) => string> = {
  lab_results: (r) => String(r.name_raw ?? 'Result'),
  prescription_items: (r) => String(r.drug_raw ?? 'Line that could not be read'),
  vaccinations: (r) => String(r.vaccine ?? 'Vaccination'),
  imaging_reports: (r) => [r.modality, r.body_region].filter(Boolean).join(' ') || 'Imaging report'
}
const detail = (i: QItem): string => {
  const r = i.row as Record<string, unknown>
  if (i.table === 'lab_results') return labValue(i.row) || 'Not read'
  if (i.table === 'prescription_items') return [r.strength, r.dose, r.frequency, r.duration].filter(Boolean).join(' · ')
  if (i.table === 'vaccinations') return [r.dose_no ? `Dose ${r.dose_no}` : '', fmt(r.given_on)].filter(Boolean).join(' · ')
  return String(r.impression ?? '')
}
/** Value cell: for a lab, the value, its printed range and a High/Low tag (same words as Records). */
const ValueCell = ({ i }: { i: QItem }) => {
  if (i.table !== 'lab_results') return <>{detail(i)}</>
  const t = labTag(i.row), range = labRange(i.row)
  return <span className="rc-val"><b>{detail(i)}</b>{range && <span className="dk-sub">Range {range}</span>}{t && <Tag tone={t.tone}>{t.word}</Tag>}</span>
}
const itemsOf = (b: DocBundle): QItem[] => [
  ...b.labs.map((row) => ({ table: 'lab_results' as const, row })), ...b.items.map((row) => ({ table: 'prescription_items' as const, row })),
  ...b.vaccinations.map((row) => ({ table: 'vaccinations' as const, row })), ...b.imaging.map((row) => ({ table: 'imaging_reports' as const, row }))
] as unknown as QItem[]
const isUnclear = (i: QItem) => i.table === 'prescription_items' && !!i.row.unclear

// Drafts the queue does not hold: each is confirmed on its own page.
const OTHER: { table: string; label: [string, string]; href: string }[] = [
  { table: 'person_identifiers', label: ['ID', 'IDs'], href: deskHref('ids') },
  { table: 'insurance_policies', label: ['insurance policy', 'insurance policies'], href: deskHref('ids') },
  { table: 'conditions', label: ['condition', 'conditions'], href: deskHref('records', 'all', 'conditions') },
  { table: 'allergies', label: ['allergy', 'allergies'], href: deskHref('records', 'all', 'conditions') },
  { table: 'medications', label: ['medicine', 'medicines'], href: deskHref('records', 'all', 'meds') },
  { table: 'appointments', label: ['appointment', 'appointments'], href: deskHref('records', 'all', 'visits') },
  { table: 'encounters', label: ['visit', 'visits'], href: deskHref('records', 'all', 'visits') }
]
function useOtherDrafts() {
  const [n, setN] = useState<{ table: string; count: number }[]>([])
  useEffect(() => {
    if (!supabase) return
    void Promise.all(OTHER.map((o) => supabase!.from(o.table).select('id', { count: 'exact', head: true }).eq('status', 'draft').then(({ count }) => ({ table: o.table, count: count ?? 0 }))))
      .then((x) => setN(x.filter((c) => c.count > 0)))
  }, [])
  return n
}

const paperName = (d: DocBundle['doc']) => [KIND[d.kind] ?? 'Document', d.title, d.facility, d.doc_date].filter(Boolean).join(', ')

export default function Queue(_: PageProps) {
  const { nameOf } = useDeskPeople()
  const [papers, setPapers] = useState<DocBundle[] | null>(null)
  const [err, setErr] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [docsOn, setDocsOn] = useState<Set<string>>(new Set()) // papers with no rows, ticked for the bulk confirm
  const others = useOtherDrafts()
  const [cursor, setCursor] = useState(-1)
  const [viewDoc, setViewDoc] = useState<string | null>(null) // the paper shown beside the values
  const [fixing, setFixing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const seenRows = useRef(new Set<string>()) // rows already offered: new ones get the default tick, old ones keep the admin's choice
  const seenDocs = useRef(new Set<string>())
  const toast = useToast()
  const conf = useConfirm()

  const load = async () => {
    const r = await listDrafts()
    if (!r.ok) { setErr(say(r.error)); return } // keep any list already on screen; never turn an error into "Nothing to confirm"
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
  const selectable = flat.filter((i) => !isUnclear(i))
  const unclearCount = flat.length - selectable.length
  const emptyPapers = (papers ?? []).filter((b) => itemsOf(b).length === 0)
  const checkedDocs = emptyPapers.filter((b) => docsOn.has(b.doc.id))
  const allOn = selectable.length + emptyPapers.length > 0 && selectable.every((i) => checked.has(i.row.id)) && checkedDocs.length === emptyPapers.length
  const someOn = checkedItems.length + checkedDocs.length > 0
  const selectAll = (on: boolean) => {
    setChecked(on ? new Set(selectable.map((i) => i.row.id)) : new Set())
    setDocsOn(on ? new Set(emptyPapers.map((b) => b.doc.id)) : new Set())
  }
  const bulkCount = checkedItems.length + checkedDocs.length
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
    const n = checkedItems.length, d = checkedDocs.length
    if (n + d === 0 || busy) return
    const go = () => apply(checkedItems, 'confirmed', checkedDocs.map((b) => ({ table: 'documents' as const, id: b.doc.id })))
    const what = [n ? `${n} ${n === 1 ? 'row' : 'rows'}` : '', d ? `${d} ${d === 1 ? 'paper' : 'papers'} with no rows` : ''].filter(Boolean).join(' and ')
    const left = unclearCount ? ` ${unclearCount} ${unclearCount === 1 ? 'line has' : 'lines have'} unclear handwriting and ${unclearCount === 1 ? 'is' : 'are'} not included: check the paper and confirm ${unclearCount === 1 ? 'it' : 'each'} on its own.` : ''
    if (n + d > 1) conf.ask(`Confirm ${what}? Unticked rows stay in the queue.${left} You can undo right after.`, go)
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

  const shownDoc = (papers ?? []).find((b) => b.doc.id === viewDoc) ?? (papers ?? [])[0]
  let idx = -1
  return (
    <>
      <PageHead title="Confirm queue" sub={papers ? `${flat.length} draft ${flat.length === 1 ? 'row' : 'rows'} in ${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}` : err ? undefined : 'Loading...'} />
      {papers && <p className="dk-sub" data-testid="q-totals">Lab results {totals.lab_results} · Prescription lines {totals.prescription_items} · Vaccinations {totals.vaccinations} · Imaging {totals.imaging_reports}. Keys: j and k move, x ticks, c confirms the ticked rows.</p>}
      {papers && papers.length > 0 && (
        <div className="rc-selectall">
          <label className="rc-sa-l">
            <input type="checkbox" className="rc-check" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn }} onChange={(e) => selectAll(e.target.checked)} />
            Select all ({selectable.length + emptyPapers.length})
          </label>
          {unclearCount > 0 && <p className="rc-warn" role="note"><Tag tone="warn">Unclear</Tag> {unclearCount} prescription {unclearCount === 1 ? 'line has' : 'lines have'} unclear handwriting. Select all leaves {unclearCount === 1 ? 'it' : 'them'} out: check the paper and confirm {unclearCount === 1 ? 'it' : 'each one'} on its own.</p>}
        </div>
      )}
      {others.length > 0 && <p className="dk-sub" data-testid="q-others">Also waiting, confirmed on their own pages: {others.map((o, k) => { const m = OTHER.find((x) => x.table === o.table)!; return <Fragment key={o.table}>{k ? ', ' : ''}<a href={m.href}>{o.count} {m.label[o.count === 1 ? 0 : 1]}</a></Fragment> })}.</p>}
      {err && <LoadError onRetry={() => void load()}>{err}</LoadError>}
      {papers === null ? (err ? null : <Empty>Loading...</Empty>) : papers.length === 0 ? <Empty>Nothing to confirm.</Empty> : (
      <div className="rc-split">
      <div className="rc-splitl">
      {[...byPerson].map(([pid, bs]) => (
        <section key={pid} className="rc-person" aria-label={nameOf(pid)}>
          <h2 className="h2">{nameOf(pid)}</h2>
          {bs.map((b) => {
            const its = itemsOf(b)
            return (
              <div key={b.doc.id} className="rc-paper" data-current={shownDoc?.doc.id === b.doc.id || undefined} onClick={() => setViewDoc(b.doc.id)}>
                <div className="dk-head">
                  <h3 className="dk-grow rc-h3">{paperName(b.doc)}</h3>
                  <div className="dk-acts">
                    {its.length === 0 && <label className="rc-sa-l"><input type="checkbox" className="rc-check" checked={docsOn.has(b.doc.id)} onChange={(e) => setDocsOn((x) => { const n = new Set(x); if (e.target.checked) n.add(b.doc.id); else n.delete(b.doc.id); return n })} aria-label={`Include paper ${paperName(b.doc)}`} />Include</label>}
                    {its.length === 0 && <button className="dk-b go" disabled={busy} aria-label={`Confirm paper ${paperName(b.doc)}`} onClick={() => void apply([], 'confirmed', [{ table: 'documents', id: b.doc.id }])}>Confirm paper</button>}
                    <button className="dk-b bad" disabled={busy} aria-label={`Reject paper ${paperName(b.doc)}`} onClick={() => rejectPaper(b)}>Reject paper</button>
                  </div>
                </div>
                {its.length === 0 ? <p className="dk-sub">No rows were read from this paper.</p> : (
                  <div className="dk-scrollx">
                    <table className="dk-table rc-qt">
                      <caption className="rc-sr">{paperName(b.doc)}</caption>
                      <colgroup><col className="rc-c1" /><col className="rc-c2" /><col className="rc-c3" /><col className="rc-c4" /><col /></colgroup>
                      <thead><tr><th scope="col">Include</th><th scope="col">Item</th><th scope="col">Value</th><th scope="col">Check</th><th scope="col">Actions</th></tr></thead>
                      <tbody>
                        {its.map((i) => {
                          idx++
                          const n = idx
                          const name = TITLE[i.table](i.row)
                          const unclear = i.table === 'prescription_items' && !!i.row.unclear
                          return (
                            <Fragment key={i.row.id}>
                              <tr data-qi={n} data-row={i.row.id} tabIndex={n === Math.max(cursor, 0) ? 0 : -1} className="rc-qrow" onFocus={() => { setCursor(n); setViewDoc(b.doc.id) }}>
                                <td className="rc-ck"><input type="checkbox" className="rc-check" checked={checked.has(i.row.id)} disabled={unclear} onChange={(e) => toggle(i.row.id, e.target.checked)} aria-label={unclear ? `${name} is unclear: confirm it on its own` : `Include ${name}`} /></td>
                                <td>{name}</td>
                                <td className="rc-num"><ValueCell i={i} /></td>
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
      </div>
      {shownDoc && (
        <aside className="rc-src" aria-label="Source paper">
          <h2 className="h2">Source paper</h2>
          <p className="dk-sub">{paperName(shownDoc.doc)}</p>
          <Preview docId={shownDoc.doc.id} />
        </aside>
      )}
      </div>
      )}
      <BulkBar count={bulkCount} noun="checked">
        <button className="dk-b go" disabled={busy} onClick={confirmChecked}>Confirm {bulkCount} checked</button>
        <button className="dk-b" onClick={() => selectAll(false)}>Clear</button>
      </BulkBar>
      {conf.node}
      {toast.node}
    </>
  )
}
