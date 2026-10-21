import { useCallback, useEffect, useRef, useState } from 'react'
import { useDeskPeople } from './people'
import { deskHref, type PageProps } from './types'
import {
  ID_TYPES, isExpired, listIdentifiers, maskNumber, openSourceFile, replaceNumber, revealNumber, setIdStatus, updateIdentifier,
  type Ident, type IdSource
} from './logsApi'
import { Empty, Filters, PageHead, Panel, Tag, statusTone, useConfirm, useToast } from './ui'
import './files.css'

const REVEAL_MS = 30_000
const ID_WORDS: Record<string, string> = {
  philsys: 'PhilSys', senior: 'Senior citizen', pwd: 'PWD', drivers: "Driver's licence", passport: 'Passport', umid: 'UMID', voters: "Voter's ID",
  postal: 'Postal ID', philhealth: 'PhilHealth', hmo: 'HMO card', tin: 'TIN', sss: 'SSS', other: 'Other'
}
const kind = (r: Ident) => (r.source === 'id' ? ID_WORDS[r.label ?? ''] ?? r.label ?? 'ID' : r.label || 'Insurance')
const key = (r: { source: IdSource; id: string }) => `${r.source}:${r.id}`

/** One full number at a time, for 30 s. Held only in this state: hidden on timeout, hash change, tab hide, new person and unmount. */
export function useReveal(personId: string | null, fetchNumber: typeof revealNumber = revealNumber) {
  const [shown, setShown] = useState<{ key: string; value: string } | null>(null)
  const timer = useRef<number>(undefined)
  const seq = useRef(0)
  const hide = useCallback(() => { seq.current++; window.clearTimeout(timer.current); setShown(null) }, [])
  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'hidden') hide() }
    window.addEventListener('hashchange', hide)
    document.addEventListener('visibilitychange', vis)
    return () => { window.removeEventListener('hashchange', hide); document.removeEventListener('visibilitychange', vis); seq.current++; window.clearTimeout(timer.current) }
  }, [hide])
  useEffect(hide, [personId, hide])
  const show = async (r: { source: IdSource; id: string }) => {
    hide()
    const mine = seq.current
    const res = await fetchNumber(r.source, r.id)
    if (mine !== seq.current) return false // hidden, replaced or unmounted while waiting
    if (!res.ok) return false
    setShown({ key: key(r), value: res.data })
    timer.current = window.setTimeout(hide, REVEAL_MS)
    return true
  }
  return { shown, show, hide }
}

export default function Ids({ id }: PageProps) {
  const { people, nameOf } = useDeskPeople()
  const [rows, setRows] = useState<Ident[] | null>(null)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const [edit, setEdit] = useState<Ident | null>(null)
  const reveal = useReveal(id)
  const confirm = useConfirm()
  const toast = useToast()

  useEffect(() => {
    setEdit(null)
    if (!id) { setRows(null); return }
    let live = true
    setError(false)
    void listIdentifiers(id).then((r) => { if (!live) return; if (r.ok) setRows(r.data); else { setRows([]); setError(true) } })
    return () => { live = false }
  }, [id, tick])

  const reload = () => setTick((t) => t + 1)
  const setStatus = async (r: Ident, status: 'confirmed' | 'rejected') => {
    const prev = r.status
    const res = await setIdStatus(r.source, r.id, status)
    if (!res.ok) return toast.show('Could not save. Try again.')
    reload()
    toast.show(`${kind(r)} ${status}.`, () => { void setIdStatus(r.source, r.id, prev).then(reload) })
  }
  const showNumber = async (r: Ident) => { if (!(await reveal.show(r))) toast.show('Could not show the number.') }
  const open = async (r: Ident) => { if (!r.source_file_id || !(await openSourceFile(r.source_file_id))) toast.show('Could not open that page.') }

  return (
    <div className="fl">
      <PageHead title="IDs and insurance" sub={id ? nameOf(id) : undefined} />
      <Filters>
        <label className="fl-sr" htmlFor="id-person">Person</label>
        <select id="id-person" className="dk-in" value={id ?? ''} onChange={(e) => { location.hash = e.target.value ? deskHref('ids', e.target.value) : deskHref('ids') }}>
          <option value="">Choose a person</option>
          {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </Filters>
      <p className="fl-note">Numbers stay hidden. Show reveals one for 30 seconds and the dashboard logs that it was shown.</p>
      {!id && <Empty>Choose a person to see their IDs and insurance.</Empty>}
      {id && error && <Empty>Could not load. The admin update (0021) may not be applied yet.</Empty>}
      {id && !error && rows && !rows.length && <Empty>No IDs or insurance on file.</Empty>}
      {id && !error && !!rows?.length && (
        <div className="dk-scrollx">
          <table className="dk-table">
            <caption className="fl-sr">IDs and insurance</caption>
            <thead><tr>{['Type', 'Plan', 'Number', 'Issued', 'Expires', 'Status', 'Source', 'Actions'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const on = reveal.shown?.key === key(r)
                return (
                  <tr key={key(r)}>
                    <th scope="row" className="fl-name">{kind(r)}<span className="fl-note">{r.source === 'id' ? ' ID' : ' insurance'}</span></th>
                    <td>{r.plan ?? ''}</td>
                    <td>
                      <div className="dk-acts">
                        <span className="fl-num">{on ? reveal.shown?.value : maskNumber(r.last4)}</span>
                        {on
                          ? <button className="dk-b" onClick={reveal.hide} aria-label={`Hide number for ${kind(r)}`}>Hide</button>
                          : <button className="dk-b" onClick={() => showNumber(r)} aria-label={`Show number for ${kind(r)}`}>Show</button>}
                      </div>
                    </td>
                    <td>{r.issued_on ?? ''}</td>
                    <td>{r.expires_on ?? ''}{isExpired(r.expires_on) && <> <Tag tone="bad">Expired</Tag></>}</td>
                    <td><Tag tone={statusTone(r.status)}>{r.status}</Tag></td>
                    <td>{r.source_file_id ? <button className="dk-b" onClick={() => open(r)} aria-label={`Open source page for ${kind(r)}`}>Open page</button> : ''}</td>
                    <td>
                      <div className="dk-acts">
                        <button className="dk-b" onClick={() => setEdit(r)} aria-label={`Edit ${kind(r)}`}>Edit</button>
                        {r.status !== 'confirmed' && <button className="dk-b go" onClick={() => setStatus(r, 'confirmed')} aria-label={`Confirm ${kind(r)}`}>Confirm</button>}
                        {r.status !== 'rejected' && <button className="dk-b bad" onClick={() => confirm.ask(`Reject this ${kind(r)}? You can undo it right after.`, () => setStatus(r, 'rejected'))} aria-label={`Reject ${kind(r)}`}>Reject</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <EditPanel row={edit} onClose={() => setEdit(null)} ask={confirm.ask} say={toast.show} saved={() => { setEdit(null); reload() }} />}
      {confirm.node}
      {toast.node}
    </div>
  )
}

function EditPanel({ row, onClose, ask, say, saved }: { row: Ident; onClose: () => void; ask: ReturnType<typeof useConfirm>['ask']; say: (t: string) => void; saved: () => void }) {
  const [label, setLabel] = useState(row.label ?? '')
  const [plan, setPlan] = useState(row.plan ?? '')
  const [issued, setIssued] = useState(row.issued_on ?? '')
  const [expires, setExpires] = useState(row.expires_on ?? '')
  const [status, setStatus] = useState(row.status)
  const [num, setNum] = useState('') // write-only: never prefilled
  const isId = row.source === 'id'

  const save = async () => {
    const res = await updateIdentifier(row.source, row.id, { label: label || null, plan: plan || null, issued_on: issued || null, expires_on: expires || null, status })
    if (!res.ok) return say('Could not save. Check the dates and try again.')
    say('Saved.'); saved()
  }
  const replace = () => ask('Replace the saved number? The old one is overwritten and cannot be shown again.', async () => {
    const res = await replaceNumber(row.source, row.id, num)
    setNum('')
    if (!res.ok) return say(res.error === 'invalid' ? 'That number was not accepted.' : 'Could not replace it. Try again.')
    say('Number replaced.'); saved()
  })

  return (
    <Panel title={`Edit ${kind(row)}`} onClose={onClose}>
      <label className="dk-field">{isId ? 'Type' : 'Carrier'}
        {isId
          ? <select className="dk-in" value={label} onChange={(e) => setLabel(e.target.value)}>{ID_TYPES.map((t) => <option key={t} value={t}>{ID_WORDS[t]}</option>)}</select>
          : <input className="dk-in" value={label} onChange={(e) => setLabel(e.target.value)} />}
      </label>
      {!isId && <label className="dk-field">Plan<input className="dk-in" value={plan} onChange={(e) => setPlan(e.target.value)} /></label>}
      <label className="dk-field">{isId ? 'Issued' : 'Valid from'}<input className="dk-in" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></label>
      <label className="dk-field">{isId ? 'Expires' : 'Valid to'}<input className="dk-in" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
      <label className="dk-field">Status
        <select className="dk-in" value={status} onChange={(e) => setStatus(e.target.value)}>{['draft', 'confirmed', 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      <button className="dk-b go" onClick={save}>Save</button>
      <hr />
      <label className="dk-field">Replace number (write only)
        <input className="dk-in" value={num} onChange={(e) => setNum(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <button className="dk-b" onClick={replace} disabled={num.trim().length < 3}>Replace number</button>
    </Panel>
  )
}
