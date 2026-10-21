import { useMemo, useState } from 'react'
import { supabase } from '../../auth/client'
import { adminMembers } from '../api'
import Avatar from '../Avatar'
import { pinError } from '../pin'
import { NOT_CONNECTED, why } from '../shared'
import MemberPage, { Ago, carersText, Form, Invite, needsAttention, Pin, roleOf, selfId, Shown, signInOf, stateOf, useRoster, type Ask, type Line } from './Person'
import { deskHref, type PageProps } from './types'
import { Empty, Filters, PageHead, Panel, SortTh, Skeleton, Tag, useConfirm, useSort, useToast } from './ui'
import './members.css'

export { memberState, selfId, signInType, type Row } from './Person'

export const HANDLE_OK = /^[a-z][a-z0-9_]{2,19}$/

/** Body for admin-members `create`: a member (never an admin), handle optional. */
export const createBody = (name: string, handle: string, pin: string) => ({ action: 'create', displayName: name.trim(), ...(handle.trim() ? { handle: handle.trim().toLowerCase() } : {}), pin, role: 'member' })
/** A person with no phone: the DB trigger adds the creator as writer carer. */
export const dependentRow = (name: string, createdBy: string) => ({ display_name: name.trim(), created_by: createdBy })

export const FILTERS = [['all', 'All'], ['login', 'With sign-in'], ['dependents', 'Dependents'], ['attention', 'Needs attention']] as const
export type MemberFilter = (typeof FILTERS)[number][0]

/** Filter chips, the carers toggle and the search box, applied in that order. */
export function filterLines(lines: Line[], f: MemberFilter, hasCarers: boolean, q: string, now = Date.now()): Line[] {
  const t = q.trim().toLowerCase()
  return lines.filter((l) => {
    if (f === 'login' && !l.p.auth_user_id) return false
    if (f === 'dependents' && l.p.auth_user_id) return false
    if (f === 'attention' && !needsAttention(l, now)) return false
    if (hasCarers && !(l.carers && l.carers > 0)) return false
    return !t || l.p.display_name.toLowerCase().includes(t) || (l.m?.handle ?? '').toLowerCase().includes(t) || signInOf(l).toLowerCase().includes(t)
  })
}

function AddMember({ ask, done, close }: { ask: Ask; done: () => void; close: () => void }) {
  const [f, setF] = useState({ name: '', handle: '', pin: '' })
  const [err, setErr] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  if (shown) return <Shown title={`${f.name.trim()} can now sign in with the sign-in name and this PIN.`} pin={shown} onClose={close} />
  return (
    <Form label="Add member" err={err} onSubmit={(e) => {
      e.preventDefault()
      const bad = !f.name.trim() ? 'Enter a name.' : f.handle.trim() && !HANDLE_OK.test(f.handle.trim().toLowerCase()) ? 'Sign-in name: 3 to 20 letters, digits or _, starting with a letter.' : pinError(f.pin)
      if (bad) return setErr(bad)
      setErr('')
      ask(`Add ${f.name.trim()} as a member with a PIN?`, async () => {
        const r = await adminMembers(createBody(f.name, f.handle, f.pin))
        if (!r.ok) return setErr(why(r.error))
        setShown(f.pin); done()
      })
    }}>
      <label className="dk-field">Name<input className="dk-in" value={f.name} maxLength={80} autoComplete="off" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="dk-field">Sign-in name (optional, made from the name if empty)<input className="dk-in" value={f.handle} maxLength={20} autoComplete="off" onChange={(e) => setF({ ...f, handle: e.target.value })} /></label>
      <Pin pin={f.pin} set={(pin) => setF({ ...f, pin })} />
      <button className="dk-b go" type="submit">Add member</button>
    </Form>
  )
}

function AddDependent({ ask, done, close, say }: { ask: Ask; done: () => void; close: () => void; say: (t: string) => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  return (
    <Form label="Add dependent" err={err} onSubmit={(e) => {
      e.preventDefault()
      if (!name.trim()) return setErr('Enter a name.')
      setErr('')
      ask(`Add ${name.trim()} as a person with no phone? You become their carer.`, async () => {
        const uid = await selfId()
        if (!supabase || !uid) return setErr(NOT_CONNECTED)
        const { error } = await supabase.from('people').insert(dependentRow(name, uid))
        if (error) return setErr(why('failed'))
        say(`${name.trim()} added.`); done(); close()
      })
    }}>
      <p className="dk-sub">For a child or an elder without a phone. They have no sign-in.</p>
      <label className="dk-field">Name<input className="dk-in" value={name} maxLength={80} autoComplete="off" onChange={(e) => setName(e.target.value)} /></label>
      <button className="dk-b go" type="submit">Add dependent</button>
    </Form>
  )
}

type Sheet = 'add' | 'dep' | 'invite'
const SHEET_TITLE: Record<Sheet, string> = { add: 'Add member', dep: 'Add dependent', invite: 'Invite by email' }

function MembersList() {
  const roster = useRoster()
  const [f, setF] = useState<MemberFilter>('all')
  const [hasCarers, setHasCarers] = useState(false)
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  const shown = useMemo(() => filterLines(roster.lines, f, hasCarers, q), [roster.lines, f, hasCarers, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const sort = useSort<Line>(shown, (l, key) => {
    switch (key) {
      case 'name': return l.p.display_name
      case 'signin': return signInOf(l)
      case 'role': return roleOf(l)
      case 'state': return stateOf(l).text
      case 'carers': return l.carers
      case 'seen': return l.seen ? Date.parse(l.seen) : null
      default: return l.drafts
    }
  }, { key: 'name', dir: 1 })
  const open = (id: string) => { location.hash = deskHref('members', id) }
  const counts = useMemo(() => ({ attention: roster.lines.filter((l) => needsAttention(l)).length }), [roster.lines])

  return (
    <div className="mb-page">
      <PageHead title="Members" sub="Everyone in the family, with or without a phone. Open a row for the profile, sign-in, carers and records.">
        <button className="dk-b" onClick={() => setSheet('invite')}>Invite by email</button>
        <button className="dk-b" onClick={() => setSheet('dep')}>Add dependent</button>
        <button className="dk-b go" onClick={() => setSheet('add')}>Add member</button>
      </PageHead>
      <Filters>
        <input className="dk-in" type="search" aria-label="Search members" placeholder="Search name or sign-in" value={q} onChange={(e) => setQ(e.target.value)} />
        {FILTERS.map(([k, label]) => (
          <button key={k} className="dk-chip" aria-pressed={f === k} onClick={() => setF(k)}>{label}{k === 'attention' && counts.attention > 0 ? ` (${counts.attention})` : ''}</button>
        ))}
        <button className="dk-chip" aria-pressed={hasCarers} onClick={() => setHasCarers((v) => !v)}>Has carers</button>
      </Filters>
      {roster.error ? <Empty>{NOT_CONNECTED}</Empty> : !roster.ready ? <Skeleton rows={8} /> : (
        <>
          {roster.err && <p className="mb-err" role="alert">Sign-in details could not be loaded ({roster.err}). Names and carers still show.</p>}
          {sort.sorted.length === 0 ? <Empty>{roster.lines.length === 0 ? 'No one yet. Add a member or a dependent with the buttons above.' : 'No one matches. Clear the search or pick All.'}</Empty> : (
            <div className="dk-scrollx">
              <table className="dk-table">
                <caption className="mb-cap">Members</caption>
                <thead><tr>
                  <SortTh k="name" label="Name" sort={sort} /><SortTh k="signin" label="Sign-in" sort={sort} /><SortTh k="role" label="Role" sort={sort} /><SortTh k="state" label="State" sort={sort} />
                  <SortTh k="carers" label="Carers" sort={sort} /><SortTh k="seen" label="Last seen" sort={sort} /><SortTh k="drafts" label="To confirm" sort={sort} />
                </tr></thead>
                <tbody>
                  {sort.sorted.map((l) => {
                    const st = stateOf(l)
                    return (
                      <tr key={l.p.id} className="dk-click" onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) open(l.p.id) }}>
                        <th scope="row"><a className="mb-link" href={deskHref('members', l.p.id)}><Avatar name={l.p.display_name} photoPath={l.p.photo_path} size={28} />{l.p.display_name || 'No name'}</a></th>
                        <td>{signInOf(l)}</td>
                        <td>{roleOf(l)}</td>
                        <td><Tag tone={st.tone}>{st.text}</Tag></td>
                        <td>{carersText(l)}</td>
                        <td>{l.m ? <Ago iso={l.seen} /> : ''}</td>
                        <td className="num">{l.drafts === null ? 'Unknown' : l.drafts}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {sheet && (
        <Panel title={SHEET_TITLE[sheet]} onClose={() => setSheet(null)}>
          {sheet === 'add' && <AddMember ask={confirm.ask} done={roster.reload} close={() => setSheet(null)} />}
          {sheet === 'dep' && <AddDependent ask={confirm.ask} done={roster.reload} close={() => setSheet(null)} say={(t) => toast.show(t)} />}
          {sheet === 'invite' && <Invite ask={confirm.ask} close={() => setSheet(null)} say={(t) => toast.show(t)} />}
        </Panel>
      )}
      {confirm.node}
      {toast.node}
    </div>
  )
}

/** #/members is the list, #/members/<personId>[/<tab>] the member page. */
export default function Members(props: PageProps) {
  return props.id ? <MemberPage {...props} /> : <MembersList />
}
