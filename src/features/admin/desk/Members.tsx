import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../auth/client'
import { adminMembers, rpc, type Member, type Res, type UsageRow } from '../api'
import { pinError } from '../pin'
import { NOT_CONNECTED, when, why } from '../shared'
import { deskHref, type PageProps } from './types'
import { Empty, Filters, PageHead, Panel, Tag, useConfirm, useToast, type Tone } from './ui'
import './members.css'

/** admin-members `list` after E1 adds lockedUntil and fails; both are absent from an older deploy. */
export type Row = Member & { lockedUntil?: string | null; fails?: number }

export const LOCK_AT = 5 // wrong PINs that start the lock (HANDLE_LIMIT in supabase/functions/_shared/login.ts)
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' })

/** pin_attempts also holds a window that has not locked yet, so a future time alone is not a lock: it needs LOCK_AT wrong tries. */
export function memberState(m: Row, now = Date.now()): { tone: Tone; text: string; locked: boolean } {
  if (m.disabled) return { tone: 'bad', text: 'Disabled', locked: false }
  const until = m.lockedUntil ? Date.parse(m.lockedUntil) : NaN
  const fails = m.fails ?? 0
  if (!Number.isNaN(until) && until > now && fails >= LOCK_AT) return { tone: 'warn', text: `Locked until ${hhmm(until)}, ${fails} wrong tries`, locked: true }
  return { tone: 'ok', text: 'Active', locked: false }
}

export const signInType = (m: Row) => (m.provider === 'google' ? 'Google' : 'PIN')
export const HANDLE_OK = /^[a-z][a-z0-9_]{2,19}$/

/** Body for admin-members `create`: a member (never an admin), handle optional. */
export const createBody = (name: string, handle: string, pin: string) => ({ action: 'create', displayName: name.trim(), ...(handle.trim() ? { handle: handle.trim().toLowerCase() } : {}), pin, role: 'member' })
/** A person with no phone: the DB trigger adds the creator as writer carer. */
export const dependentRow = (name: string, createdBy: string) => ({ display_name: name.trim(), created_by: createdBy })

/** The signed-in admin's user id, or null. */
export async function selfId(): Promise<string | null> {
  if (!supabase) return null
  try { return (await supabase.auth.getUser()).data.user?.id ?? null } catch { return null }
}

const randomPin = () => {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000
    const pin = String(n).padStart(6, '0')
    if (!pinError(pin)) return pin
  }
}

type Sheet = { k: 'pin'; m: Row } | { k: 'add' } | { k: 'dep' } | { k: 'invite' }
type Ask = (text: string, run: () => Promise<void>) => void

function Pin({ pin, set }: { pin: string; set: (v: string) => void }) {
  return (
    <div className="mb-pinrow">
      <label className="dk-field mb-grow">PIN (6 digits)<input className="dk-in" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} /></label>
      <button type="button" className="dk-b" onClick={() => set(randomPin())}>Make one</button>
    </div>
  )
}

function Shown({ title, pin, onClose }: { title: string; pin: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(pin); setCopied(true) } catch { /* the PIN stays on screen */ } }
  return (
    <>
      <p>{title}</p>
      <p className="mb-pin" aria-label="PIN">{pin}</p>
      <p className="dk-sub">A new PIN is shown once, to the admin. Give it to the person yourself.</p>
      <div className="dk-acts"><button className="dk-b" onClick={copy}>{copied ? 'Copied' : 'Copy PIN'}</button><button className="dk-b go" onClick={onClose}>Done</button></div>
    </>
  )
}

function Form({ children, onSubmit, err, label }: { children: ReactNode; onSubmit: (e: FormEvent) => void; err: string; label: string }) {
  return <form className="mb-form" aria-label={label} onSubmit={onSubmit}>{children}{err && <p className="mb-err" role="alert">{err}</p>}</form>
}

function ResetPin({ m, ask, done, close }: { m: Row; ask: Ask; done: () => void; close: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  if (shown) return <Shown title={`New PIN for ${m.displayName}`} pin={shown} onClose={close} />
  return (
    <Form label={`New PIN for ${m.displayName}`} err={err} onSubmit={(e) => {
      e.preventDefault()
      const bad = pinError(pin)
      if (bad) return setErr(bad)
      setErr('')
      ask(`Set a new PIN for ${m.displayName}? Their current sessions end.`, async () => {
        const r = await adminMembers({ action: 'set_pin', userId: m.userId, pin })
        if (!r.ok) return setErr(why(r.error))
        setShown(pin); done()
      })
    }}>
      <Pin pin={pin} set={setPin} />
      <button className="dk-b go" type="submit">Set PIN</button>
    </Form>
  )
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

function Invite({ ask, close, say }: { ask: Ask; close: () => void; say: (t: string) => void }) {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  return (
    <Form label="Invite by email" err={err} onSubmit={(e) => {
      e.preventDefault()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Enter a full email address.')
      setErr('')
      ask(`Invite ${email.trim()} to sign in with Google?`, async () => {
        const r = await adminMembers({ action: 'invite', email: email.trim() })
        if (!r.ok) return setErr(why(r.error))
        say(`${email.trim()} invited.`); close()
      })
    }}>
      <label className="dk-field">Google email<input className="dk-in" type="email" value={email} maxLength={254} autoComplete="off" onChange={(e) => setEmail(e.target.value)} /></label>
      <button className="dk-b go" type="submit">Invite</button>
    </Form>
  )
}

export default function Members(_: PageProps) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [usage, setUsage] = useState<Map<string, UsageRow>>(new Map())
  const [err, setErr] = useState('')
  const [me, setMe] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  const reload = () => {
    void adminMembers<{ members: Row[] }>({ action: 'list' }).then((r) => { if (r.ok) { setRows(r.data.members); setErr('') } else setErr(why(r.error)) })
    void rpc<UsageRow[]>('admin_usage_summary', { days: 30 }).then((r: Res<UsageRow[]>) => { if (r.ok) setUsage(new Map(r.data.map((u) => [u.user_id, u]))) })
  }
  useEffect(() => { reload(); void selfId().then(setMe) }, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (rows ?? []).filter((m) => !t || m.displayName.toLowerCase().includes(t) || (m.handle ?? '').includes(t)).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [rows, q])

  const act = (text: string, body: Record<string, unknown>, doneText: string, undo?: Record<string, unknown>) =>
    confirm.ask(text, async () => {
      const r = await adminMembers(body)
      if (!r.ok) return toast.show(why(r.error))
      reload()
      toast.show(doneText, undo && (async () => { const u = await adminMembers(undo); toast.show(u.ok ? 'Undone.' : why(u.error)); reload() }))
    })
  const close = () => setSheet(null)
  const title = !sheet ? '' : sheet.k === 'pin' ? `Reset PIN: ${sheet.m.displayName}` : sheet.k === 'add' ? 'Add member' : sheet.k === 'dep' ? 'Add dependent' : 'Invite by email'

  return (
    <>
      <PageHead title="Members" sub="Everyone who can sign in. People without a phone are on the People page.">
        <button className="dk-b go" onClick={() => setSheet({ k: 'add' })}>Add member</button>
        <button className="dk-b" onClick={() => setSheet({ k: 'dep' })}>Add dependent</button>
        <button className="dk-b" onClick={() => setSheet({ k: 'invite' })}>Invite by email</button>
      </PageHead>
      <Filters>
        <input className="dk-in" type="search" aria-label="Search members" placeholder="Search name or sign-in name" value={q} onChange={(e) => setQ(e.target.value)} />
      </Filters>
      {err ? <Empty>{err}</Empty> : rows === null ? <Empty>Loading members.</Empty> : shown.length === 0 ? <Empty>No members match.</Empty> : (
        <div className="dk-scrollx">
          <table className="dk-table">
            <caption className="mb-cap">Members</caption>
            <thead><tr>
              <th scope="col">Name</th><th scope="col">Sign-in name</th><th scope="col">Role</th><th scope="col">Sign-in type</th><th scope="col">State</th>
              <th scope="col">Last sign-in</th><th scope="col">Last seen</th><th scope="col" className="num">Events 30 d</th><th scope="col">Actions</th>
            </tr></thead>
            <tbody>
              {shown.map((m) => {
                const st = memberState(m)
                const u = usage.get(m.userId)
                const self = m.userId === me
                const pinUser = signInType(m) === 'PIN'
                return (
                  <tr key={m.userId}>
                    <th scope="row">{m.personId ? <a className="mb-link" href={deskHref('people', m.personId)}>{m.displayName || 'No name'}</a> : (m.displayName || 'No name')}</th>
                    <td>{m.handle ?? 'None'}</td>
                    <td>{m.role === 'admin' ? 'Admin' : 'Member'}</td>
                    <td>{signInType(m)}</td>
                    <td><Tag tone={st.tone}>{st.text}</Tag></td>
                    <td>{when(m.lastSignInAt)}</td>
                    <td>{when(u?.last_seen)}</td>
                    <td className="num">{u ? u.events : 'None'}</td>
                    <td>
                      <div className="mb-acts">
                        {pinUser && <button className="dk-b" onClick={() => setSheet({ k: 'pin', m })} aria-label={`Reset PIN for ${m.displayName}`}>Reset PIN</button>}
                        {pinUser && st.locked && <button className="dk-b" onClick={() => act(`Unlock ${m.displayName} so they can try their PIN again?`, { action: 'unlock', userId: m.userId }, `${m.displayName} unlocked.`)} aria-label={`Unlock ${m.displayName}`}>Unlock</button>}
                        {!self && m.role === 'member' && !pinUser && <button className="dk-b" onClick={() => act(`Make ${m.displayName} an admin?`, { action: 'set_role', userId: m.userId, role: 'admin' }, `${m.displayName} is now an admin.`, { action: 'set_role', userId: m.userId, role: 'member' })} aria-label={`Make ${m.displayName} admin`}>Make admin</button>}
                        {!self && m.role === 'admin' && <button className="dk-b" onClick={() => act(`Make ${m.displayName} a member?`, { action: 'set_role', userId: m.userId, role: 'member' }, `${m.displayName} is now a member.`, { action: 'set_role', userId: m.userId, role: 'admin' })} aria-label={`Make ${m.displayName} member`}>Make member</button>}
                        {!self && <button className="dk-b bad" onClick={() => act(`${m.disabled ? 'Enable' : 'Disable'} ${m.displayName}?${m.disabled ? '' : ' They are signed out and cannot sign in.'}`, { action: 'disable', userId: m.userId, disabled: !m.disabled }, `${m.displayName} ${m.disabled ? 'enabled' : 'disabled'}.`, { action: 'disable', userId: m.userId, disabled: m.disabled })} aria-label={`${m.disabled ? 'Enable' : 'Disable'} ${m.displayName}`}>{m.disabled ? 'Enable' : 'Disable'}</button>}
                        {self && <Tag>You</Tag>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {sheet && (
        <Panel title={title} onClose={close}>
          {sheet.k === 'pin' && <ResetPin m={sheet.m} ask={confirm.ask} done={reload} close={close} />}
          {sheet.k === 'add' && <AddMember ask={confirm.ask} done={reload} close={close} />}
          {sheet.k === 'dep' && <AddDependent ask={confirm.ask} done={reload} close={close} say={(t) => toast.show(t)} />}
          {sheet.k === 'invite' && <Invite ask={confirm.ask} close={close} say={(t) => toast.show(t)} />}
        </Panel>
      )}
      {confirm.node}
      {toast.node}
    </>
  )
}
