import { useEffect, useMemo, useState } from 'react'
import { dateTime, statusLabel } from '../shared'
import { useDeskPeople } from './people'
import { ACTIONS, dedupeCounts, fieldWord, listAudit, listDedupe, noAuditTable, PAGE, TABLE_WORDS, tableWords, type AuditRow, type DedupeRow } from './logsApi'
import type { PageProps } from './types'
import { Empty, Filters, PageHead, Tag, type Tone } from './ui'
import './files.css'

const ACTION_TONE: Record<string, Tone> = { confirm: 'ok', reject: 'bad', delete: 'bad', reveal: 'warn' }
const short = (id: string | null) => (id ? id.slice(0, 8) : '')

/** `person` fixes the person filter (and hides it) for the member page; `embedded` drops the page header. The duplicate clean-up log is global, so it shows only on the full page. */
export default function History({ person, embedded }: PageProps & { person?: string }) {
  const [tab, setTab] = useState<'audit' | 'dedupe'>('audit')
  return (
    <div className="fl">
      {!embedded && <PageHead title="History" sub="Who changed what. Field names only, never the values." />}
      {!person && <div className="fl-tabs">
        <button className="dk-chip" aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>Changes</button>
        <button className="dk-chip" aria-pressed={tab === 'dedupe'} onClick={() => setTab('dedupe')}>Duplicate clean-up (0019)</button>
      </div>}
      {tab === 'audit' || person ? <Audit person={person} /> : <Dedupe />}
    </div>
  )
}

function Audit({ person }: { person?: string }) {
  const { people, nameOf } = useDeskPeople()
  const [own, setF] = useState({ person: '', table: '', action: '', from: '', to: '' })
  const f = useMemo(() => ({ ...own, person: person ?? own.person }), [own, person])
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [state, setState] = useState<'ok' | 'error' | 'missing'>('ok')
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(0) }

  useEffect(() => {
    let live = true
    setState('ok')
    void listAudit({ ...f, page }).then((r) => {
      if (!live) return
      if (r.ok) setRows(r.data)
      else { setRows([]); setState(noAuditTable(r.code) ? 'missing' : 'error') }
    })
    return () => { live = false }
  }, [f, page])

  const actor = (a: string | null) => (a === null ? 'System' : people?.find((p) => p.auth_user_id === a)?.display_name ?? 'Unknown')
  const shown = rows?.slice(0, PAGE) ?? []
  const older = (rows?.length ?? 0) > PAGE

  return (
    <>
      <Filters>
        {!person && <>
          <label className="fl-sr" htmlFor="hi-person">Person</label>
          <select id="hi-person" className="dk-in" value={f.person} onChange={(e) => set('person', e.target.value)}>
            <option value="">Everyone</option>
            {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </>}
        <label className="fl-sr" htmlFor="hi-table">Table</label>
        <select id="hi-table" className="dk-in" value={f.table} onChange={(e) => set('table', e.target.value)}>
          <option value="">All tables</option>
          {Object.entries(TABLE_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="fl-sr" htmlFor="hi-action">Action</label>
        <select id="hi-action" className="dk-in" value={f.action} onChange={(e) => set('action', e.target.value)}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{statusLabel(a)}</option>)}
        </select>
        <label className="fl-sr" htmlFor="hi-from">From date</label>
        <input id="hi-from" className="dk-in" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set('from', e.target.value)} />
        <label className="fl-sr" htmlFor="hi-to">To date</label>
        <input id="hi-to" className="dk-in" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set('to', e.target.value)} />
      </Filters>
      {state === 'missing' && <Empty>History starts after the 0021 update.</Empty>}
      {state === 'error' && <Empty>Could not load history. Check the connection and try again.</Empty>}
      {state === 'ok' && rows && !shown.length && <Empty>No changes match.</Empty>}
      {state === 'ok' && !!shown.length && (
        <div className="dk-scrollx" tabIndex={0} role="region" aria-label="Changes, newest first">
          <table className="dk-table dk-cardtab">
            <caption className="fl-sr">Changes, newest first</caption>
            <thead><tr>{['When', 'Who', 'Action', 'Table', ...(person ? [] : ['Person']), 'Fields'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="fl-name">{dateTime(r.at)}</th>
                  <td data-label="Who">{actor(r.actor)}</td>
                  <td data-label="Action"><Tag tone={ACTION_TONE[r.action] ?? 'plain'}>{statusLabel(r.action)}</Tag></td>
                  <td data-label="Table">{tableWords(r.tbl)}</td>
                  {!person && <td data-label="Person">{r.person_id ? nameOf(r.person_id) : ''}</td>}
                  <td data-label="Fields" className="fl-fields">{(r.fields ?? []).map(fieldWord).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state === 'ok' && (page > 0 || older) && (
        <div className="dk-acts">
          <button className="dk-b" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</button>
          <span className="fl-note">Page {page + 1}</span>
          <button className="dk-b" disabled={!older} onClick={() => setPage((p) => p + 1)}>Older</button>
        </div>
      )}
    </>
  )
}

function Dedupe() {
  const [rows, setRows] = useState<DedupeRow[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    void listDedupe().then((r) => { if (!live) return; if (r.ok) setRows(r.data); else { setRows([]); setError(true) } })
    return () => { live = false }
  }, [])
  const counts = useMemo(() => dedupeCounts(rows ?? []), [rows])
  if (error) return <Empty>Could not load the clean-up log. Check the connection and try again.</Empty>
  if (rows && !rows.length) return <Empty>The 0019 clean-up changed nothing.</Empty>
  return (
    <>
      <div className="dk-scrollx" tabIndex={0} role="region" aria-label="Rows changed by the clean-up, by table and old status">
        <table className="dk-table">
          <caption className="fl-sr">Rows changed by the clean-up, by table and old status</caption>
          <thead><tr><th scope="col">Table</th><th scope="col">Old status</th><th scope="col" className="num">Rows</th></tr></thead>
          <tbody>
            {counts.map((c) => (
              <tr key={`${c.tbl}-${c.old_status}`}><th scope="row" className="fl-name">{tableWords(c.tbl)}</th><td>{c.old_status ?? 'none'}</td><td className="num">{c.n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fl-note">Latest 100 rows{rows && rows.length > 100 ? ` of ${rows.length}` : ''}.</p>
      <div className="dk-scrollx" tabIndex={0} role="region" aria-label="Clean-up rows, newest first">
        <table className="dk-table">
          <caption className="fl-sr">Clean-up rows, newest first</caption>
          <thead><tr>{['When', 'Table', 'Row', 'Old status'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {(rows ?? []).slice(0, 100).map((r) => (
              <tr key={r.id}><th scope="row" className="fl-name">{dateTime(r.at)}</th><td>{tableWords(r.tbl)}</td><td className="fl-num">{short(r.row_id)}</td><td>{r.old_status ?? 'none'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
