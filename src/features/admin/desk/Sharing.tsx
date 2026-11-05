import { useCallback, useEffect, useState } from 'react'
import { getMember } from '../../auth/session'
import { linkCarer, rpc, unlinkCarer } from '../api'
import { why } from '../shared'
import { useDeskPeople, type DeskPerson } from './people'
import type { PageProps } from './types'
import { Empty, PageHead, useConfirm, useToast } from './ui'
import '../../sharing/sharing.css'

/** admin_share_grid() (0037): every link on an active person. `pending` is always false since 0046; a leftover offer is not a link. */
export type GridRow = { person_id: string; person_name: string; carer_user_id: string; carer_name: string; can_write: boolean; pending: boolean }
export type CellKind = 'self' | 'none' | 'view' | 'carer'

/** What the box for "viewer sees person" shows. A row of the person themself is Self. */
export function cellOf(rows: GridRow[], person: DeskPerson, viewer: DeskPerson): CellKind {
  if (person.id === viewer.id) return 'self'
  const r = rows.find((x) => x.person_id === person.id && x.carer_user_id === viewer.auth_user_id && !x.pending)
  return !r ? 'none' : r.can_write ? 'carer' : 'view'
}

const MARK: Record<CellKind, string> = { self: 'Self', none: '', view: '✓', carer: 'C' }
const SAY: Record<CellKind, string> = { self: 'is the person', none: 'does not see', view: 'sees', carer: 'is the carer of' }

/** Admin > Who sees whom (board D109Desk). Rows are the records, columns are the people who can see them. Every admin reads the grid; only the family owner changes it (D-109). */
export default function Sharing(_: PageProps) {
  const { people } = useDeskPeople()
  const [rows, setRows] = useState<GridRow[] | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<{ person: DeskPerson; viewer: DeskPerson } | null>(null)
  const [carer, setCarer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [owner, setOwner] = useState<boolean | null>(null) // null = not asked yet; any error reads as not the owner
  const [ownerId, setOwnerId] = useState<string | null>(null) // the owner's own sign-in: never a column, the owner sees everyone without a link
  const toast = useToast()
  const conf = useConfirm()
  const load = useCallback(async () => {
    const r = await rpc<GridRow[]>('admin_share_grid')
    if (r.ok) { setErr(''); setRows(r.data) } else setErr(why(r.error)) // keep what is on screen; never say "nobody" after a failed load
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void getMember().catch(() => null).then((m) => { setOwner(m?.isOwner === true); setOwnerId(m?.isOwner ? m.userId : null) }) }, [])

  const active = (people ?? []).filter((p) => !p.archived_at)
  const viewers = active.filter((p) => p.auth_user_id && p.auth_user_id !== ownerId && p.kind !== 'shared') // the shared family account never gets a link (D-120)
  const kind = pick && rows ? cellOf(rows, pick.person, pick.viewer) : 'none'
  const canCarer = pick ? pick.person.auth_user_id === null : false // only an admin can make a carer, and only for a person with no login (0037)
  // An empty box asks first, then allows (no accept step); a filled box opens the panel, where Stop asks first.
  const open = async (person: DeskPerson, viewer: DeskPerson) => {
    if (owner !== true || !rows) return
    const k = cellOf(rows, person, viewer)
    if (k === 'self') return
    if (k !== 'none') { setPick({ person, viewer }); setCarer(k === 'carer'); return }
    setPick(null)
    conf.ask(`Let ${viewer.display_name} see ${person.display_name}'s records? ${person.auth_user_id ? person.display_name : viewer.display_name} will be told.`, async () => {
      setBusy(true)
      const r = await linkCarer(viewer.auth_user_id!, person.id, false)
      setBusy(false)
      toast.show(!r.ok ? why(r.error) : r.data === 'added' ? `${viewer.display_name} can now see ${person.display_name}'s records.` : 'Nothing changed.')
      await load()
    }, { verb: 'Allow' })
  }
  const save = async () => {
    if (!pick) return
    setBusy(true)
    const r = await linkCarer(pick.viewer.auth_user_id!, pick.person.id, canCarer && carer)
    setBusy(false)
    if (!r.ok) { toast.show(why(r.error)); return }
    const who = pick.viewer.display_name
    toast.show(r.data === 'updated' ? (carer && canCarer ? `Saved. ${who} is now a carer.` : `Saved. ${who} now sees the records but is not a carer.`) : r.data === 'added' ? `${who} had been removed, so the link was made again.` : 'Nothing changed.') // 'added' = the link was removed elsewhere while this panel stayed open
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
      <PageHead title="Who sees whom" sub={`Rows are the records. Columns are the people who can see them. A check means they see the records, C means carer (gets missed-dose alerts).${owner === true ? ' Tap an empty box to allow (it asks first), a filled box to stop. Allow tells the person, or the new viewer if the person has no login. Stop tells the viewer. You always see everyone.' : ''}`} />
      {err && <p className="mb-err" role="alert">{err} <button className="dk-b" onClick={() => void load()}>Try again</button></p>}
      {rows === null || people === null ? (err ? null : <Empty>Loading...</Empty>) : active.length === 0 ? <Empty>No members yet.</Empty> : (
        <div className="sg-scroll">
          <table className="sg-grid">
            <thead><tr><th scope="col">Records of</th>{viewers.map((v) => <th key={v.id} scope="col">{v.display_name}</th>)}</tr></thead>
            <tbody>
              {active.filter((p) => p.kind !== 'shared').map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.display_name}</th>
                  {viewers.map((v) => {
                    const k = cellOf(rows, p, v)
                    return (
                      <td key={v.id}>
                        <button type="button" className="sg-cell" data-self={k === 'self' || undefined}
                          aria-pressed={k === 'view' || k === 'carer'} disabled={k === 'self' || owner !== true || busy} aria-label={`${v.display_name} ${SAY[k]} ${p.display_name}`} onClick={() => void open(p, v)}>{MARK[k]}</button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="dk-sub">Each change is saved on the server and logged with your name. Only the family owner can change this page.</p>
      {pick && owner === true && (
        <section className="dk-card sg-panel" aria-label="Selected">
          <h2 className="h2">{pick.viewer.display_name} {SAY[kind]} {pick.person.display_name}</h2>
          <label className="sg-check" aria-disabled={!canCarer}>
            <input type="checkbox" checked={canCarer && carer} disabled={!canCarer} onChange={(e) => setCarer(e.target.checked)} />
            <span>Carer (missed-dose alerts, 8 PM summary)<span className="dk-sub">{canCarer ? '' : ' Only for a person with no login of their own.'}</span></span>
          </label>
          <div className="dk-acts">
            {canCarer && <button className="dk-b go" disabled={busy} onClick={() => void save()}>Save</button>}
            <button className="dk-b bad" disabled={busy} onClick={stop}>Stop sharing</button>
            <button className="dk-b" onClick={() => setPick(null)}>Close</button>
          </div>
        </section>
      )}
      {conf.node}
      {toast.node}
    </>
  )
}
