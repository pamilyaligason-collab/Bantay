import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../auth/client'
import { adminMembers } from '../api'
import Avatar from '../Avatar'
import { pinError } from '../pin'
import { NOT_CONNECTED, why } from '../shared'
import MemberPage, { Ago, archivedOf, carersText, dayText, Form, Invite, needsAttention, Pin, roleOf, selfId, Shown, signInOf, stateOf, useRoster, type Ask, type Line } from './Person'
import { deskHref, type PageProps } from './types'
import { Empty, Filters, PageHead, Panel, SortTh, Skeleton, Tag, useConfirm, useSort, useToast } from './ui'
import './members.css'

import { HANDLE_OK } from './Person'
export { HANDLE_OK, memberState, selfId, signInType, type Row } from './Person'

/** Body for admin-members `create`: a member (never an admin), handle optional. */
export const createBody = (name: string, handle: string, pin: string) => ({ action: 'create', displayName: name.trim(), ...(handle.trim() ? { handle: handle.trim().toLowerCase() } : {}), pin, role: 'member' })
/** A person with no phone: the DB trigger adds the creator as writer carer. */
export const dependentRow = (name: string, createdBy: string) => ({ display_name: name.trim(), created_by: createdBy })

/** A PIN member who has never signed in has no PIN of their own yet: the admin can make them a personal invite link (D-81, migration 0038). */
export const needsInvite = (l: Line): boolean => Boolean(l.m && l.m.provider !== 'google' && l.m.handle && !l.m.disabled && !l.m.lastSignInAt && !archivedOf(l))
/** The link opens the app on the family's real address, whichever address the admin page is on. */
export const INVITE_BASE = 'https://bantay.pages.dev/#join/'
export const inviteError = (code?: string) =>
  code === '22023' ? 'This person has signed in before, so they already have a PIN. Use Forgot PIN for them.'
  : code === '53400' ? 'Too many links this hour. Try again later.'
  : code === '42501' ? 'Only an admin can do this.'
  : why('failed')

export const FILTERS = [['all', 'All'], ['login', 'With sign-in'], ['dependents', 'Dependents'], ['attention', 'Needs attention'], ['archived', 'Archived']] as const
export type MemberFilter = (typeof FILTERS)[number][0]

/** Filter chips, the carers toggle and the search box, applied in that order. */
export function filterLines(lines: Line[], f: MemberFilter, hasCarers: boolean, q: string, now = Date.now()): Line[] {
  const t = q.trim().toLowerCase()
  return lines.filter((l) => {
    if (f === 'archived') { if (!archivedOf(l)) return false } else if (archivedOf(l)) return false // archived people show only under their own chip
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

/** Copy sheet for a personal invite link. The token is shown now and never again (only its hash is stored). */
function LinkSheet({ name, link, onClose }: { name: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* the link stays on screen to copy by hand */ } }
  return (
    <>
      <p>Send this link to {name} yourself, for example in Messenger. Anyone who has it can set the PIN, so send it only to them.</p>
      <input className="dk-in" readOnly aria-label="Invite link" value={link} onFocus={(e) => e.currentTarget.select()} />
      <p className="dk-sub">It works once and ends in 7 days. It is shown only now. Making a new link cancels this one.</p>
      <div className="dk-acts"><button className="dk-b" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button><button className="dk-b go" onClick={onClose}>Done</button></div>
    </>
  )
}

/** Phone width (matches the 767px rules in members.css). False where matchMedia is missing (tests). */
function usePhone() {
  const q = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 767px)') : null)
  const [on, setOn] = useState(() => q()?.matches ?? false)
  useEffect(() => { const m = q(); if (!m) return; const f = () => setOn(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return on
}

/** Needs-attention people first, then by name (audit M1). */
export const attentionFirst = (lines: Line[], now = Date.now()): Line[] =>
  [...lines].sort((a, b) => Number(needsAttention(b, now)) - Number(needsAttention(a, now)) || a.p.display_name.localeCompare(b.p.display_name))

function MembersList() {
  const phone = usePhone()
  const roster = useRoster()
  const [f, setF] = useState<MemberFilter>('all')
  const [hasCarers, setHasCarers] = useState(false)
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [link, setLink] = useState<{ name: string; url: string } | null>(null)
  const confirm = useConfirm()
  const toast = useToast()
  const more = useRef<HTMLDetailsElement>(null)
  // The phone "More" menu closes on Escape and on a click outside it.
  useEffect(() => {
    const shut = (e: Event) => { const d = more.current; if (d?.open && (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : !d.contains(e.target as Node))) d.open = false }
    document.addEventListener('keydown', shut); document.addEventListener('pointerdown', shut)
    return () => { document.removeEventListener('keydown', shut); document.removeEventListener('pointerdown', shut) }
  }, [])

  const shown = useMemo(() => attentionFirst(filterLines(roster.lines, f, hasCarers, q)), [roster.lines, f, hasCarers, q]) // eslint-disable-line react-hooks/exhaustive-deps
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
  }) // no initial sort: attentionFirst above sets the order until a header is clicked
  const open = (id: string) => { location.hash = deskHref('members', id) }
  const makeInvite = (l: Line) => confirm.ask(`Make a new invite link for ${l.p.display_name}? Any older link for them stops working.`, async () => {
    if (!supabase || !l.m) return toast.show(NOT_CONNECTED)
    const { data, error } = await supabase.rpc('admin_create_invite', { p_user: l.m.userId })
    if (error || typeof data !== 'string') return toast.show(inviteError((error as { code?: string } | null)?.code))
    setLink({ name: l.p.display_name, url: INVITE_BASE + data })
  })
  const counts = useMemo(() => ({ attention: roster.lines.filter((l) => needsAttention(l)).length, archived: roster.lines.filter((l) => archivedOf(l)).length }), [roster.lines])

  return (
    <div className="mb-page">
      <PageHead title="Members" sub="Everyone in the family, with or without a phone. Open a row for the profile, sign-in, carers and records.">
        {phone ? (
          <details className="mb-more" ref={more}><summary className="dk-b">More</summary>
            <div className="mb-more-m" onClick={() => { if (more.current) more.current.open = false }}>
              <button className="dk-b" onClick={() => setSheet('invite')}>Invite by email</button>
              <button className="dk-b" onClick={() => setSheet('dep')}>Add dependent</button>
            </div>
          </details>
        ) : <>
          <button className="dk-b" onClick={() => setSheet('invite')}>Invite by email</button>
          <button className="dk-b" onClick={() => setSheet('dep')}>Add dependent</button>
        </>}
        <button className="dk-b go" onClick={() => setSheet('add')}>Add member</button>
      </PageHead>
      <Filters>
        <input className="dk-in" type="search" aria-label="Search members" placeholder="Search name or sign-in" value={q} onChange={(e) => setQ(e.target.value)} />
        {FILTERS.map(([k, label]) => (
          <button key={k} className="dk-chip" aria-pressed={f === k} onClick={() => setF(k)}>{label}{k === 'attention' && counts.attention > 0 ? ` (${counts.attention})` : ''}{k === 'archived' ? ` (${counts.archived})` : ''}</button>
        ))}
        <button className="dk-chip" aria-pressed={hasCarers} onClick={() => setHasCarers((v) => !v)}>Has carers</button>
      </Filters>
      {roster.error ? <Empty>{NOT_CONNECTED}</Empty> : !roster.ready ? <Skeleton rows={8} /> : (
        <>
          {roster.err && <p className="mb-err" role="alert">Sign-in details could not be loaded ({roster.err}). Names and carers still show.</p>}
          {sort.sorted.length === 0 ? <Empty>{roster.lines.length === 0 ? 'No one yet. Add a member or a dependent with the buttons above.' : f === 'archived' && !q.trim() && !hasCarers ? 'No one is archived.' : 'No one matches. Clear the search or pick All.'}</Empty> : (
            <div className="dk-scrollx">
              <table className="dk-table mb-tbl">
                <caption className="mb-cap">Members</caption>
                <thead><tr>
                  <SortTh k="name" label="Name" sort={sort} /><SortTh k="signin" label="Sign-in" sort={sort} /><SortTh k="role" label="Role" sort={sort} /><SortTh k="state" label="State" sort={sort} />
                  <SortTh k="carers" label="Carers" sort={sort} /><SortTh k="seen" label="Last seen" sort={sort} /><SortTh k="drafts" label="To confirm" sort={sort} />
                </tr></thead>
                <tbody>
                  {sort.sorted.map((l) => {
                    const st = stateOf(l)
                    const gone = archivedOf(l)
                    return (
                      <tr key={l.p.id} className="dk-click" onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) open(l.p.id) }}>
                        <th scope="row"><a className="mb-link" href={deskHref('members', l.p.id)}><Avatar name={l.p.display_name} photoPath={l.p.photo_path} size={32} />{l.p.display_name || 'No name'}</a></th>
                        <td data-l="Sign-in">{signInOf(l)}</td>
                        <td data-l="Role">{roleOf(l)}</td>
                        <td className="mb-st"><Tag tone={st.tone}>{st.text}</Tag>{gone && <span className="dk-sub mb-when"> {dayText(gone)}</span>}
                          {needsInvite(l) && <button className="dk-b" aria-label={`Invite link for ${l.p.display_name}`} onClick={() => makeInvite(l)}>Invite link</button>}</td>
                        <td data-l="Carers">{carersText(l)}</td>
                        <td data-l="Last seen">{l.m ? <Ago iso={l.seen} /> : <span className="dk-sub">No sign-in</span>}</td>
                        <td className="num" data-l="To confirm">{l.drafts === null ? 'Unknown' : l.drafts}</td>
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
      {link && <Panel title="Invite link" onClose={() => setLink(null)}><LinkSheet name={link.name} link={link.url} onClose={() => setLink(null)} /></Panel>}
      {confirm.node}
      {toast.node}
    </div>
  )
}

/** #/members is the list, #/members/<personId>[/<tab>] the member page. */
export default function Members(props: PageProps) {
  return props.id ? <MemberPage {...props} /> : <MembersList />
}
