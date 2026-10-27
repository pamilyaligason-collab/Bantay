import { useCallback, useEffect, useState } from 'react'
import { linkCarer, rpc, unlinkCarer } from '../api'
import { why } from '../shared'
import { useDeskPeople, type DeskPerson } from './people'
import type { PageProps } from './types'
import { Empty, PageHead, useConfirm, useToast } from './ui'
import '../../sharing/sharing.css'

/** admin_share_grid() (0037): every link and pending offer on an active person. */
export type GridRow = { person_id: string; person_name: string; carer_user_id: string; carer_name: string; can_write: boolean; pending: boolean }
export type CellKind = 'self' | 'none' | 'view' | 'carer' | 'pending'

/** What the box for "viewer sees person" shows. A row of the person themself is Self; a pending offer stays pending whatever its edit flag. */
export function cellOf(rows: GridRow[], person: DeskPerson, viewer: DeskPerson): CellKind {
  if (person.id === viewer.id) return 'self'
  const r = rows.find((x) => x.person_id === person.id && x.carer_user_id === viewer.auth_user_id)
  return !r ? 'none' : r.pending ? 'pending' : r.can_write ? 'carer' : 'view'
}

const MARK: Record<CellKind, string> = { self: 'Self', none: '', view: '✓', carer: 'C', pending: '…' }
const SAY: Record<CellKind, string> = { self: 'is the person', none: 'does not see', view: 'sees', carer: 'is the carer of', pending: 'has an offer waiting for' }

/** Admin > Who sees whom (canvas board 2). Rows are the records, columns are the people who can see them. Records are private until shared. */
export default function Sharing(_: PageProps) {
  const { people } = useDeskPeople()
  const [rows, setRows] = useState<GridRow[] | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<{ person: DeskPerson; viewer: DeskPerson } | null>(null)
  const [carer, setCarer] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const conf = useConfirm()
  const load = useCallback(async () => {
    const r = await rpc<GridRow[]>('admin_share_grid')
    if (r.ok) { setErr(''); setRows(r.data) } else setErr(why(r.error)) // keep what is on screen; never say "nobody" after a failed load
  }, [])
  useEffect(() => { void load() }, [load])

  const active = (people ?? []).filter((p) => !p.archived_at)
  const viewers = active.filter((p) => p.auth_user_id)
  const kind = pick && rows ? cellOf(rows, pick.person, pick.viewer) : 'none'
  const canCarer = pick ? pick.person.auth_user_id === null : false // only an admin can make a carer, and only for a person with no login (0037)
  const open = (person: DeskPerson, viewer: DeskPerson) => {
    setPick({ person, viewer })
    setCarer(rows ? cellOf(rows, person, viewer) === 'carer' : false)
  }
  const save = async () => {
    if (!pick) return
    setBusy(true)
    const r = await linkCarer(pick.viewer.auth_user_id!, pick.person.id, canCarer && carer)
    setBusy(false)
    if (!r.ok) { toast.show(why(r.error)); return }
    const who = pick.viewer.display_name
    toast.show(r.data === 'pending' ? `Offer sent to ${who}. They see nothing until they accept.${pick.person.auth_user_id ? ` ${pick.person.display_name} is told and can cancel it.` : ''}`
      : r.data === 'updated' ? (carer && canCarer ? `Saved. ${who} is now a carer.` : `Saved. ${who} now sees the records but is not a carer.`) : 'Nothing changed.')
    await load()
  }
  const stop = () => {
    if (!pick) return
    const { person, viewer } = pick
    conf.ask(`Stop ${viewer.display_name} seeing ${person.display_name}'s records?`, async () => {
      const r = await unlinkCarer(viewer.auth_user_id!, person.id)
      toast.show(r.ok ? `${viewer.display_name} can no longer see ${person.display_name}.` : why(r.error))
      if (r.ok) setPick(null)
      await load()
    }, { verb: 'Stop sharing', danger: true })
  }

  return (
    <>
      <PageHead title="Who sees whom" sub="Rows are the records. Columns are the people who can see them. Records are private until shared. A filled box means shared, C means carer (gets missed-dose alerts), a dashed box means waiting for them to accept. Admins can see records to help. Offering a viewer on a member who has a login tells that member, and they can cancel it." />
      {err && <p className="mb-err" role="alert">{err} <button className="dk-b" onClick={() => void load()}>Try again</button></p>}
      {rows === null || people === null ? (err ? null : <Empty>Loading...</Empty>) : active.length === 0 ? <Empty>No members yet.</Empty> : (
        <div className="sg-scroll">
          <table className="sg-grid">
            <thead><tr><th scope="col">Records of</th>{viewers.map((v) => <th key={v.id} scope="col">{v.display_name}</th>)}</tr></thead>
            <tbody>
              {active.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.display_name}</th>
                  {viewers.map((v) => {
                    const k = cellOf(rows, p, v)
                    return (
                      <td key={v.id}>
                        <button type="button" className="sg-cell" data-self={k === 'self' || undefined} data-pending={k === 'pending' || undefined}
                          aria-pressed={k === 'view' || k === 'carer'} disabled={k === 'self'} aria-label={`${v.display_name} ${SAY[k]} ${p.display_name}`} onClick={() => open(p, v)}>{MARK[k]}</button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="dk-sub">Each change is saved on the server and logged with your name. A new member starts with nothing shared.</p>
      {pick && (
        <section className="dk-card sg-panel" aria-label="Selected">
          <h2 className="h2">{pick.viewer.display_name} {SAY[kind]} {pick.person.display_name}</h2>
          <label className="sg-check" aria-disabled={!canCarer}>
            <input type="checkbox" checked={canCarer && carer} disabled={!canCarer} onChange={(e) => setCarer(e.target.checked)} />
            <span>Carer (missed-dose alerts, 8 PM summary)<span className="dk-sub">{canCarer ? '' : ' Only for a person with no login of their own.'}</span></span>
          </label>
          <div className="dk-acts">
            {(kind === 'none' || canCarer) && <button className="dk-b go" disabled={busy} onClick={() => void save()}>{kind === 'none' ? 'Offer to share' : 'Save'}</button>}
            {kind !== 'none' && <button className="dk-b bad" disabled={busy} onClick={stop}>{kind === 'pending' ? 'Cancel the offer' : 'Stop sharing'}</button>}
            <button className="dk-b" onClick={() => setPick(null)}>Close</button>
          </div>
        </section>
      )}
      {conf.node}
      {toast.node}
    </>
  )
}
