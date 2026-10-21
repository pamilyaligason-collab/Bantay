import { useEffect, useState, type ReactNode } from 'react'
import { driveUrl, EDITABLE, settleDocument, signedUrl, updateRow, type Res, type Table } from '../../records/api'
import { deskHref, type PageProps } from './types'
import { Empty, Filters, PageHead, Panel, Skeleton, SortTh, statusTone, Tag, useConfirm, useSort, useToast } from './ui'
import { useDeskPeople } from './people'
import Ids from './Ids'
import { EditFields, fmt, label, say } from './recordsUi'
import {
  CAP, countKinds, docOf, docStatuses, filesOf, FLAGS, isAbnormal, KINDS, labNumber, labRange, labValue, listItems, listKind, parentDoc, reopenDocument,
  resolveTab, restore, searchRows, setStatusFor, sourceNames, TABS, toChanges,
  type Change, type Filter, type Kind, type KindKey, type KRow, type PageFile, type Status, type TabKey
} from './recordsApi'
import './records.css'

const rk = (r: KRow) => `${r._table}:${r.id}`
const ITEM_TEXT = ['drug_raw', 'generic_name', 'brand', 'instructions']
const okRows = (r: Res<KRow[]>) => (r.ok ? r.data : [])
const primaryKey = (k: Kind) => (k.key === 'papers' ? 'title' : k.key === 'labs' ? 'name_raw' : k.cols[1].key)
/** The cell that opens the panel. A paper with no title falls back to its kind. */
const primaryText = (r: KRow, key: string) => fmt(r[key]) || (key === 'title' ? fmt(r.kind) : '') || '(blank)'
const panelTitle = (r: KRow) => {
  if (r._table === 'prescription_items') return `Prescription line: ${primaryText(r, 'drug_raw')}`
  const k = KINDS.find((x) => x.src.some((s) => s.table === r._table))!
  return `${k.label}: ${primaryText(r, primaryKey(k))}`
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

// ---- table columns ----
type Col = { key: string; label: string; get(r: KRow): string | number | null; cell?(r: KRow): ReactNode; primary?: boolean }
type Ctx = { nameOf(id: string | null | undefined): string; names: Map<string, string>; everyone: boolean }

function colsFor(kind: Kind, o: Ctx): Col[] {
  const status: Col = { key: 'status', label: 'Status', get: (r) => r.status, cell: (r) => <Tag tone={statusTone(r.status)}>{r.status}</Tag> }
  const who: Col[] = o.everyone ? [{ key: 'person', label: 'Person', get: (r) => o.nameOf(r.person_id as string) }] : []
  if (kind.key === 'labs') {
    return [
      { key: 'when', label: 'Date', get: (r) => fmt(r.when) || null },
      { key: 'name_raw', label: 'Test', primary: true, get: (r) => fmt(r.name_raw) || null },
      { key: 'value', label: 'Value', get: (r) => labNumber(r), cell: (r) => labValue(r) },
      { key: 'range', label: 'Range', get: (r) => labRange(r) || null },
      { key: 'flag', label: 'Flag', get: (r) => (r.flag as string | null) ?? null, cell: (r) => { const f = FLAGS[r.flag as string]; return f ? <Tag tone={f.tone}>{f.word}</Tag> : null } },
      ...who, status,
      { key: 'source', label: 'Source', get: (r) => o.names.get(r.document_id as string) ?? null }
    ]
  }
  const pk = primaryKey(kind)
  return [
    ...kind.cols.map((c): Col => ({
      key: c.key, label: c.label, primary: c.key === pk,
      get: (r) => { const v = c.key === 'when' ? r.when : r[c.key]; return typeof v === 'number' ? v : fmt(v) || null },
      cell: (r) => (c.key === 'when' ? fmt(r.when) : undefined)
    })),
    ...who, status
  ]
}

type Pick = { picked: Set<string>; setPicked(s: Set<string>): void }

function Check({ checked, onChange, name }: { checked: boolean; onChange(): void; name: string }) {
  return <input type="checkbox" className="rc-check" checked={checked} onChange={onChange} onClick={(e) => e.stopPropagation()} aria-label={name} />
}

function KindTable({ kind, rows, cols, pick, openId, onOpen }: { kind: Kind; rows: KRow[]; cols: Col[]; pick: Pick; openId: string | null; onOpen(r: KRow): void }) {
  const sort = useSort(rows, (r, k) => cols.find((c) => c.key === k)?.get(r))
  const { picked, setPicked } = pick
  const all = sort.sorted.length > 0 && sort.sorted.every((r) => picked.has(rk(r)))
  const toggle = (r: KRow) => { const s = new Set(picked); if (!s.delete(rk(r))) s.add(rk(r)); setPicked(s) }
  const toggleAll = () => { const s = new Set(picked); for (const r of sort.sorted) all ? s.delete(rk(r)) : s.add(rk(r)); setPicked(s) }
  const pk = primaryKey(kind)
  return (
    <div className="dk-scrollx">
      <table className="dk-table">
        <caption className="rc-cap">{kind.label}, {rows.length} {rows.length === 1 ? 'row' : 'rows'}</caption>
        <thead><tr>
          <th scope="col" className="rc-ck"><Check checked={all} onChange={toggleAll} name={`Select all ${kind.label.toLowerCase()}`} /></th>
          {cols.map((c) => <SortTh key={c.key} k={c.key} label={c.label} sort={sort} />)}
        </tr></thead>
        <tbody>
          {sort.sorted.map((r) => (
            <tr key={rk(r)} className={`dk-click${kind.key === 'labs' && isAbnormal(r.flag) ? ' rc-abn' : ''}`} aria-selected={openId === rk(r)} onClick={() => onOpen(r)}>
              <td className="rc-ck"><Check checked={picked.has(rk(r))} onChange={() => toggle(r)} name={`Select ${primaryText(r, pk)}`} /></td>
              {cols.map((c) => <td key={c.key}>{c.primary ? <button className="dk-rowbtn" onClick={(e) => { e.stopPropagation(); onOpen(r) }}>{primaryText(r, pk)}</button> : (c.cell?.(r) ?? fmt(c.get(r)))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Prescription headers, each with its lines underneath. Lines are confirmed or rejected one by one (or in bulk); an unclear line is flagged. */
function RxList({ headers, items, pick, openId, onOpen, ctx }: { headers: KRow[]; items: KRow[]; pick: Pick; openId: string | null; onOpen(r: KRow): void; ctx: Ctx }) {
  const { picked, setPicked } = pick
  const toggle = (r: KRow) => { const s = new Set(picked); if (!s.delete(rk(r))) s.add(rk(r)); setPicked(s) }
  return (
    <div className="rc-rx">
      {headers.map((h) => {
        const lines = items.filter((i) => i.prescription_id === h.id)
        return (
          <section key={h.id} className="dk-card" aria-label={`Prescription ${fmt(h.rx_date) || 'with no date'}`}>
            <div className="dk-card-h">
              <h2><button className="dk-rowbtn" onClick={() => onOpen(h)}>{fmt(h.rx_date) || 'No date'}{h.prescriber ? `, ${fmt(h.prescriber)}` : ''}</button></h2>
              {ctx.everyone && <span className="dk-sub">{ctx.nameOf(h.person_id as string)}</span>}
              {h.follow_up_on ? <span className="dk-sub">Follow-up {fmt(h.follow_up_on)}</span> : null}
              <Tag tone={statusTone(h.status)}>{h.status}</Tag>
            </div>
            {lines.length === 0 ? <p className="dk-sub rc-pad">No lines were read from this prescription.</p> : (
              <div className="dk-scrollx">
                <table className="dk-table">
                  <caption className="fl-sr">Lines of the prescription dated {fmt(h.rx_date) || 'unknown'}</caption>
                  <thead><tr>{['', 'Medicine', 'Dose', 'How often', 'Duration', 'Status'].map((t, i) => <th key={i} scope="col" className={i === 0 ? 'rc-ck' : undefined}>{i === 0 ? <span className="fl-sr">Select</span> : t}</th>)}</tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="dk-click" aria-selected={openId === rk(l)} onClick={() => onOpen(l)}>
                        <td className="rc-ck"><Check checked={picked.has(rk(l))} onChange={() => toggle(l)} name={`Select ${primaryText(l, 'drug_raw')}`} /></td>
                        <td>
                          <button className="dk-rowbtn" onClick={(e) => { e.stopPropagation(); onOpen(l) }}>{primaryText(l, 'drug_raw')}</button>
                          {l.unclear ? <> <Tag tone="warn">Unclear: check the photo</Tag></> : null}
                        </td>
                        <td>{fmt(l.dose)}</td><td>{fmt(l.frequency)}</td><td>{fmt(l.duration)}</td>
                        <td><Tag tone={statusTone(l.status)}>{l.status}</Tag></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

type Data = { rows: Partial<Record<KindKey, KRow[]>>; items: KRow[]; names: Map<string, string> }

export default function Records({ id, sub, embedded }: PageProps) {
  const person = id && id !== 'all' ? id : null
  const { people, error: peopleErr, nameOf } = useDeskPeople()
  const [local, setLocal] = useState<TabKey>(resolveTab(sub).key) // embedded: the tab lives here so the host page's URL stays put
  const tab = embedded ? resolveTab(local) : resolveTab(sub)
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [counts, setCounts] = useState<Partial<Record<TabKey, number>>>({})
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<KRow | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const kinds = tab.kinds as readonly KindKey[]

  useEffect(() => {
    setSel(null); setPicked(new Set())
    if (!kinds.length) { setData(null); setErr(''); return }
    let live = true
    const f: Filter = { person, status, from, to }
    setData(null); setErr('')
    void (async () => {
      const ks = kinds.map((k) => KINDS.find((x) => x.key === k)!)
      const res = await Promise.all(ks.map((k) => listKind(k, f)))
      const bad = res.find((r) => !r.ok)
      if (bad && !bad.ok) { if (live) { setData({ rows: {}, items: [], names: new Map() }); setErr(say(bad.error)) } return }
      const rows = Object.fromEntries(ks.map((k, i) => [k.key, okRows(res[i])])) as Data['rows']
      const items = tab.key === 'rx' ? okRows(await listItems(rows.rx ?? [])) : []
      const names = tab.key === 'lab' ? await sourceNames(rows.labs ?? []) : new Map<string, string>()
      if (live) setData({ rows, items, names })
    })()
    return () => { live = false }
  }, [tab.key, person, status, from, to, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true
    const f: Filter = { person, status, from, to }
    void Promise.all(TABS.filter((t) => t.kinds.length).map(async (t) => [t.key, await countKinds(t.kinds, f)] as const))
      .then((es) => live && setCounts(Object.fromEntries(es.filter(([, n]) => n != null)) as Partial<Record<TabKey, number>>))
    return () => { live = false }
  }, [person, status, from, to, tick])

  const reload = () => setTick((t) => t + 1)
  const everyRow = data ? [...Object.values(data.rows).flat(), ...data.items] : []
  const pickedRows = everyRow.filter((r) => picked.has(rk(r)))

  /** Confirm or reject rows (one from the panel, or the ticked ones). Closes the paper when its last draft goes, and Undo reverses both. */
  const apply = async (rows: KRow[], next: 'confirmed' | 'rejected') => {
    const todo = rows.filter((r) => r.status !== next)
    if (!todo.length) return
    setBusy(true)
    try {
      const docs = [...new Set(todo.map(docOf).filter((x): x is string => !!x))]
      const prevDocs = await docStatuses(docs)
      const byTable = new Map<string, KRow[]>()
      for (const r of todo) byTable.set(r._table, [...(byTable.get(r._table) ?? []), r])
      const done: Change[] = []
      let failed = ''
      for (const [table, rs] of byTable) {
        const r = await setStatusFor(table, rs.map((x) => x.id), next)
        if (!r.ok) { failed = say(r.error); break }
        for (const c of toChanges(rs)) { const ids = c.ids.filter((i) => r.data.ids.includes(i)); if (ids.length) done.push({ ...c, ids }) }
      }
      const n = done.reduce((a, c) => a + c.ids.length, 0)
      if (!n) { if (failed) toast.show(failed); return }
      for (const d of docs) await settleDocument(d)
      reload()
      const left = todo.length - n
      const head = n === 1 ? (next === 'confirmed' ? 'Confirmed.' : 'Rejected.') : `${n} ${next}.`
      toast.show(`${head}${left && !failed ? ` ${left} left as they were (unclear lines are confirmed one at a time).` : ''}${failed ? ` ${failed}` : ''}`, () => {
        void restore(done).then(async (u) => {
          if (u.ok) for (const [d, st] of prevDocs) await reopenDocument(d, st)
          toast.show(u.ok ? 'Put back.' : say(u.error))
          reload()
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

  const ctx: Ctx = { nameOf, names: data?.names ?? new Map(), everyone: !person }
  const pick: Pick = { picked, setPicked }
  const openId = sel ? rk(sel) : null
  const badge = (t: (typeof TABS)[number]) => (counts[t.key] != null ? <em>{counts[t.key]}</em> : null)

  const section = (k: Kind, heading?: string) => {
    const rows = data?.rows[k.key] ?? []
    const shown = searchRows(rows, q, k.text)
    return (
      <section key={k.key} className="rc-sec" aria-label={heading ?? k.label}>
        {heading && <h2 className="rc-h3">{heading}</h2>}
        {rows.length >= CAP && <p className="dk-sub">Showing the newest {CAP}. Narrow the dates or person to see older rows.</p>}
        {shown.length === 0
          ? <Empty>{rows.length ? 'Nothing matches the search. Clear it to see all rows.' : `No ${k.label.toLowerCase()} for these filters. Try All statuses or a wider date range.`}</Empty>
          : <KindTable kind={k} rows={shown} cols={colsFor(k, ctx)} pick={pick} openId={openId} onOpen={setSel} />}
      </section>
    )
  }

  let body: ReactNode
  if (tab.key === 'ids') body = <Ids id={person} embedded />
  else if (data === null) body = <Skeleton rows={6} />
  else if (tab.key === 'rx') {
    const k = KINDS.find((x) => x.key === 'rx')!
    const n = q.trim().toLowerCase()
    const headers = (data.rows.rx ?? []).filter((h) => !n || searchRows([h], q, k.text).length > 0 || searchRows(data.items.filter((i) => i.prescription_id === h.id), q, ITEM_TEXT).length > 0)
    body = (
      <>
        {(data.rows.rx ?? []).length >= CAP && <p className="dk-sub">Showing the newest {CAP}. Narrow the dates or person to see older rows.</p>}
        {headers.length === 0
          ? <Empty>{(data.rows.rx ?? []).length ? 'Nothing matches the search. Clear it to see all prescriptions.' : 'No prescriptions for these filters. Try All statuses or a wider date range.'}</Empty>
          : <RxList headers={headers} items={data.items} pick={pick} openId={openId} onOpen={setSel} ctx={ctx} />}
      </>
    )
  } else if (kinds.length > 1) body = kinds.map((key) => { const k = KINDS.find((x) => x.key === key)!; return section(k, k.label) })
  else body = section(KINDS.find((x) => x.key === kinds[0])!)

  const ask = (next: 'confirmed' | 'rejected') => {
    const rows = pickedRows
    confirm.ask(`${next === 'confirmed' ? 'Confirm' : 'Reject'} ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}? You can undo it right after.`, () => apply(rows, next))
  }

  return (
    <div className="rc-wrap">
      {!embedded && <PageHead title="Records" sub={person ? nameOf(person) : 'Everyone'} />}
      <Filters>
        {!embedded && (
          <label className="rc-lbl">Person
            <select className="dk-in" value={person ?? 'all'} onChange={(e) => { location.hash = deskHref('records', e.target.value, tab.key) }}>
              <option value="all">Everyone</option>
              {[...(people ?? [])].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at)).map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.archived_at ? ' (archived)' : ''}</option>)}
            </select>
          </label>
        )}
        {tab.key !== 'ids' && <>
          <div className="dk-filters" role="group" aria-label="Status">
            {(['all', 'draft', 'confirmed', 'rejected'] as const).map((s) => <button key={s} className="dk-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}</button>)}
          </div>
          <label className="rc-lbl">From<input className="dk-in" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="rc-lbl">To<input className="dk-in" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="rc-lbl rc-grow">Search<input className="dk-in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab.label.toLowerCase()}`} /></label>
        </>}
        {peopleErr && !embedded && <span className="rc-err" role="alert">Could not load people.</span>}
      </Filters>
      {embedded
        ? <div className="dk-tabs" role="tablist" aria-label="Kinds of record">{TABS.map((t) => <button key={t.key} role="tab" aria-selected={t.key === tab.key} onClick={() => setLocal(t.key)}>{t.label}{' '}{badge(t)}</button>)}</div>
        : <nav className="dk-tabs" aria-label="Kinds of record">{TABS.map((t) => <a key={t.key} href={deskHref('records', person ?? 'all', t.key)} aria-current={t.key === tab.key ? 'page' : undefined}>{t.label}{' '}{badge(t)}</a>)}</nav>}
      {pickedRows.length > 0 && (
        <div className="rc-bulk" role="region" aria-label="Bulk actions">
          <b>{pickedRows.length} selected</b>
          <button className="dk-b go" disabled={busy} onClick={() => ask('confirmed')}>Confirm {pickedRows.length}</button>
          <button className="dk-b bad" disabled={busy} onClick={() => ask('rejected')}>Reject {pickedRows.length}</button>
          <button className="dk-b" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}
      {err && <p className="rc-err" role="alert">{err}</p>}
      <div role={embedded ? 'tabpanel' : undefined} aria-label={embedded ? tab.label : undefined}>{body}</div>
      {sel && <Detail key={rk(sel)} row={sel} title={panelTitle(sel)} person={nameOf(sel.person_id as string)} busy={busy} onClose={() => setSel(null)} onDecide={(n) => void apply([sel], n)} onFix={(p) => fix(sel, p)} />}
      {confirm.node}
      {toast.node}
    </div>
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
        <button className="dk-b bad" disabled={busy || row.status === 'rejected'} onClick={() => onDecide('rejected')}>Reject</button>
      </div>
      {docId && <Preview docId={docId} />}
      {edit && <EditFields table={row._table} row={row} onSave={onFix} />}
      <dl className="rc-dl">{ro.map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{fmt(v) || '-'}</dd></div>)}</dl>
    </Panel>
  )
}
