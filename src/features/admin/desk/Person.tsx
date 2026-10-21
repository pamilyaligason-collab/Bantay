import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../auth/client'
import { adminMembers, listCarers, rpc, uploadAvatar, type Member, type UsageRow } from '../api'
import Avatar from '../Avatar'
import { toAvatarJpeg } from '../photo'
import { pinError } from '../pin'
import { NOT_CONNECTED, when, why } from '../shared'
import Carers from './Carers'
import History from './History'
import Ids from './Ids'
import { useDeskPeople, type DeskPerson } from './people'
import Records from './Records'
import { deskHref, type PageProps } from './types'
import { Empty, PageHead, Skeleton, Tag, useConfirm, useToast, type Tone } from './ui'
import './members.css'

// ---------- shared by the Members list and the member page ----------
/** admin-members `list` after E1 adds lockedUntil and fails; both are absent from an older deploy. */
export type Row = Member & { lockedUntil?: string | null; fails?: number }
export type Ask = (text: string, run: () => Promise<void>) => void

export const LOCK_AT = 5 // wrong PINs that start the lock (HANDLE_LIMIT in supabase/functions/_shared/login.ts)
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' })

/** pin_attempts also holds a window that has not locked yet, so a future time alone is not a lock: it needs LOCK_AT wrong tries. */
export function memberState(m: Row, now = Date.now()): { tone: Tone; text: string; locked: boolean } {
  if (m.disabled) return { tone: 'bad', text: 'Disabled', locked: false }
  const until = m.lockedUntil ? Date.parse(m.lockedUntil) : NaN
  const fails = m.fails ?? 0
  if (!Number.isNaN(until) && until > now && fails >= LOCK_AT) return { tone: 'warn', text: `Locked until ${hhmm(until)}, ${fails} tries`, locked: true }
  return { tone: 'ok', text: 'Active', locked: false }
}

export const signInType = (m: Row) => (m.provider === 'google' ? 'Google' : 'PIN')

/** One person with everything the table and the summary card show. A count is null while unknown, never 0. */
export type Line = { p: DeskPerson; m: Row | undefined; seen: string | null; drafts: number | null; carers: number | null; edit: number | null }
export const roleOf = (l: Line) => (l.m ? (l.m.role === 'admin' ? 'Admin' : 'Member') : l.p.auth_user_id ? 'Unknown' : 'Dependent')
export const stateOf = (l: Line, now = Date.now()): { tone: Tone; text: string; locked: boolean } =>
  l.m ? memberState(l.m, now) : { tone: 'plain', text: l.p.auth_user_id ? 'Unknown' : 'Cared for', locked: false }
export const signInOf = (l: Line) => (l.m ? (l.m.provider === 'google' ? 'Google' : l.m.handle ? `PIN, ${l.m.handle}` : 'PIN') : l.p.auth_user_id ? 'Unknown' : 'No phone')
export const needsAttention = (l: Line, now = Date.now()) => !!l.m?.disabled || stateOf(l, now).locked || (l.drafts ?? 0) > 0
export const carersText = (l: Line) => (l.carers === null ? 'Unknown' : l.carers === 0 ? 'None' : l.edit ? `${l.carers} (${l.edit} can edit)` : String(l.carers))

/** '2 h ago' for recent times, the date after a month. Null or unreadable is 'Never'. */
export function agoOf(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return 'Never'
  const s = (now - t) / 1000
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} d ago`
  return new Date(t).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
}
export const Ago = ({ iso }: { iso: string | null | undefined }) => (iso && !Number.isNaN(Date.parse(iso)) ? <time dateTime={iso} title={when(iso)}>{agoOf(iso)}</time> : <>Never</>)

/** The signed-in admin's user id, or null. */
export async function selfId(): Promise<string | null> {
  if (!supabase) return null
  try { return (await supabase.auth.getUser()).data.user?.id ?? null } catch { return null }
}

/** Everyone, joined with the sign-in list, last seen, drafts and carers. Each source can fail alone: its numbers stay null. */
export function useRoster() {
  const { people, error, reload: reloadPeople } = useDeskPeople()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [usage, setUsage] = useState<Map<string, UsageRow>>(new Map())
  const [drafts, setDrafts] = useState<Map<string, number> | null>(null)
  const [carers, setCarers] = useState<Map<string, { n: number; edit: number }> | null>(null)
  const [me, setMe] = useState<string | null>(null)

  const load = () => {
    void adminMembers<{ members: Row[] }>({ action: 'list' }).then((r) => { if (r.ok) { setRows(r.data.members); setErr('') } else { setRows((x) => x ?? []); setErr(why(r.error)) } })
    void rpc<UsageRow[]>('admin_usage_summary', { days: 30 }).then((r) => { if (r.ok) setUsage(new Map(r.data.map((u) => [u.user_id, u]))) })
    if (supabase) {
      void Promise.resolve(supabase.from('records_queue').select('person_id, drafts')).then(({ data, error: e }) => {
        if (e) return
        const m = new Map<string, number>()
        for (const d of (data ?? []) as { person_id: string; drafts: number | null }[]) m.set(d.person_id, (m.get(d.person_id) ?? 0) + (d.drafts ?? 0))
        setDrafts(m)
      }, () => undefined)
    }
    void listCarers().then((r) => {
      if (!r.ok) return
      const m = new Map<string, { n: number; edit: number }>()
      for (const c of r.data) { const x = m.get(c.person_id) ?? { n: 0, edit: 0 }; x.n++; if (c.can_write) x.edit++; m.set(c.person_id, x) }
      setCarers(m)
    })
  }
  useEffect(() => { load(); void selfId().then(setMe) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const byPerson = new Map((rows ?? []).filter((m) => m.personId).map((m) => [m.personId!, m]))
  const lines: Line[] = (people ?? []).map((p) => {
    const m = byPerson.get(p.id)
    const c = carers ? carers.get(p.id) ?? { n: 0, edit: 0 } : null
    return { p, m, seen: m ? usage.get(m.userId)?.last_seen ?? null : null, drafts: drafts ? drafts.get(p.id) ?? 0 : null, carers: c?.n ?? null, edit: c?.edit ?? null }
  })
  return { people, lines, ready: people !== null && rows !== null, error, err, me, reload: () => { reloadPeople(); load() } }
}

// ---------- PIN and invite pieces ----------
const randomPin = () => {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000
    const pin = String(n).padStart(6, '0')
    if (!pinError(pin)) return pin
  }
}

export function Pin({ pin, set }: { pin: string; set: (v: string) => void }) {
  return (
    <div className="mb-pinrow">
      <label className="dk-field mb-grow">PIN (6 digits)<input className="dk-in" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} /></label>
      <button type="button" className="dk-b" onClick={() => set(randomPin())}>Make one</button>
    </div>
  )
}

export function Shown({ title, pin, onClose }: { title: string; pin: string; onClose: () => void }) {
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

export function Form({ children, onSubmit, err, label }: { children: ReactNode; onSubmit: (e: FormEvent) => void; err: string; label: string }) {
  return <form className="mb-form" aria-label={label} onSubmit={onSubmit}>{children}{err && <p className="mb-err" role="alert">{err}</p>}</form>
}

export function ResetPin({ m, ask, done, close }: { m: Row; ask: Ask; done: () => void; close: () => void }) {
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

export function Invite({ ask, close, say }: { ask: Ask; close: () => void; say: (t: string) => void }) {
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

// ---------- profile ----------
/** Allowed values from 0010 (blood type check) and 0013 (sex check). */
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
/** The only people columns an admin may update (column grants in 0010 and 0013). Anything else is never sent. */
export const GRANTED = ['display_name', 'photo_path', 'phone', 'birthdate', 'blood_type', 'allergies', 'conditions', 'medicines', 'aliases', 'sex', 'address'] as const

export type Detail = { id: string; phone: string | null; birthdate: string | null; sex: string | null; blood_type: string | null; address: string | null; aliases: string[]; allergies: string[]; conditions: string[] }
export type FormState = { name: string; phone: string; birthdate: string; sex: string; bloodType: string; address: string; aliases: string; allergies: string; conditions: string }
export type Patch = { display_name: string; phone: string | null; birthdate: string | null; sex: string | null; blood_type: string | null; address: string | null; aliases: string[]; allergies: string[]; conditions: string[] }

const COLS = 'id, phone, birthdate, sex, blood_type, address, aliases, allergies, conditions'
const toLines = (s: string) => {
  const out: string[] = []
  for (const l of s.split('\n')) { const t = l.replace(/\s+/g, ' ').trim(); if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t) }
  return out
}
export const formOf = (name: string, d: Detail | undefined): FormState => ({
  name, phone: d?.phone ?? '', birthdate: d?.birthdate ?? '', sex: d?.sex ?? '', bloodType: d?.blood_type ?? '', address: d?.address ?? '',
  aliases: (d?.aliases ?? []).join('\n'), allergies: (d?.allergies ?? []).join('\n'), conditions: (d?.conditions ?? []).join('\n')
})

/** Checks the form and builds the update payload (granted columns only). Unknown stays null, never a made-up value. */
export function profilePatch(f: FormState, today = new Date().toISOString().slice(0, 10)): { patch: Patch } | { error: string } {
  const name = f.name.trim()
  if (!name) return { error: 'Enter a name.' }
  if (name.length > 80) return { error: 'The name is too long.' }
  if (f.phone.trim().length > 30) return { error: 'The phone number is too long.' }
  if (f.birthdate && (f.birthdate > today || f.birthdate < '1900-01-01')) return { error: 'The birthday cannot be in the future.' }
  if (f.sex && f.sex !== 'female' && f.sex !== 'male') return { error: 'Choose female, male or leave it blank.' }
  if (f.bloodType && !BLOOD_TYPES.includes(f.bloodType)) return { error: 'Choose a blood type from the list.' }
  if (f.address.trim().length > 300) return { error: 'The address is too long.' }
  const aliases = toLines(f.aliases), allergies = toLines(f.allergies), conditions = toLines(f.conditions)
  if (aliases.length > 20) return { error: 'At most 20 other names.' }
  if (allergies.length > 30 || conditions.length > 30) return { error: 'At most 30 allergies and 30 conditions.' }
  return { patch: { display_name: name, phone: f.phone.trim() || null, birthdate: f.birthdate || null, sex: f.sex || null, blood_type: f.bloodType || null, address: f.address.trim() || null, aliases, allergies, conditions } }
}

export const ageOf = (birthdate: string | null | undefined, now = new Date()): number | null => {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null
  const [y, m, d] = birthdate.split('-').map(Number) as [number, number, number]
  const a = now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0)
  return a >= 0 ? a : null
}

type Say = (t: string) => void

/** Rendered only after the details arrive, so its starting values are the real ones (no remount, no flicker). */
function ProfileForm({ id, name, photoPath, detail, say, saved, onDirty }: { id: string; name: string; photoPath: string | null; detail: Detail; say: Say; saved: () => void; onDirty: (d: boolean) => void }) {
  const [base, setBase] = useState(() => formOf(name, detail))
  const [f, setF] = useState(base)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [rev, setRev] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const dirty = (Object.keys(f) as (keyof FormState)[]).some((k) => f[k] !== base[k])
  useEffect(() => { onDirty(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirty(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (patch: Partial<Patch> & { photo_path?: string }) => {
    if (!supabase) { setErr(NOT_CONNECTED); return false }
    const { data, error } = await supabase.from('people').update(patch).eq('id', id).select('id')
    if (error) { setErr(why('failed')); return false }
    if (!data || data.length === 0) { setErr('You cannot change this person.'); return false } // RLS hides a row it will not update
    return true
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const r = profilePatch(f)
    if ('error' in r) return setErr(r.error)
    setErr(''); setBusy(true)
    const ok = await update(r.patch)
    setBusy(false)
    if (ok) { setBase(f); say('Profile saved.'); saved() }
  }
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const pic = e.target.files?.[0]
    e.target.value = ''
    if (!pic) return
    setErr(''); setBusy(true)
    const jpeg = await toAvatarJpeg(pic)
    if (!jpeg) { setBusy(false); return setErr('That file is not a picture Bantay can read.') }
    const up = await uploadAvatar(id, jpeg)
    if (!up.ok) { setBusy(false); return setErr(why(up.error)) }
    const ok = await update({ photo_path: up.data })
    setBusy(false)
    if (ok) { setRev((n) => n + 1); say('Photo saved.'); saved() }
  }

  return (
    <form className="dk-form" aria-label="Profile" onSubmit={save}>
      <div className="mb-who dk-wide">
        <Avatar name={name} photoPath={photoPath} size={72} rev={rev} />
        <button type="button" className="dk-b" disabled={busy} onClick={() => file.current?.click()}>Choose photo</button>
        <input ref={file} type="file" accept="image/*" hidden aria-label="Photo file" onChange={pick} />
      </div>
      <label className="dk-field">Name<input className="dk-in" value={f.name} maxLength={80} autoComplete="off" onChange={set('name')} /></label>
      <label className="dk-field">Phone<input className="dk-in" type="tel" value={f.phone} maxLength={30} autoComplete="off" onChange={set('phone')} /></label>
      <label className="dk-field">Birthday<input className="dk-in" type="date" value={f.birthdate} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={set('birthdate')} /></label>
      <label className="dk-field">Sex
        <select className="dk-in" value={f.sex} onChange={set('sex')}><option value="">Not set</option><option value="female">Female</option><option value="male">Male</option></select>
      </label>
      <label className="dk-field">Blood type
        <select className="dk-in" value={f.bloodType} onChange={set('bloodType')}><option value="">Not set</option>{BLOOD_TYPES.map((b) => <option key={b}>{b}</option>)}</select>
      </label>
      <label className="dk-field">Address<input className="dk-in" value={f.address} maxLength={300} autoComplete="off" onChange={set('address')} /></label>
      <label className="dk-field">Other names (one per line)<textarea className="dk-in mb-ta" value={f.aliases} onChange={set('aliases')} /></label>
      <label className="dk-field">Allergies (one per line)<textarea className="dk-in mb-ta" value={f.allergies} onChange={set('allergies')} /></label>
      <label className="dk-field dk-wide">Conditions (one per line)<textarea className="dk-in mb-ta" value={f.conditions} onChange={set('conditions')} /></label>
      {err && <p className="mb-err dk-wide" role="alert">{err}</p>}
      <div className="dk-acts dk-wide">
        <button className="dk-b go" type="submit" disabled={busy || !dirty}>Save profile</button>
        <button className="dk-b" type="button" disabled={busy || !dirty} onClick={() => { setF(base); setErr('') }}>Cancel</button>
        {dirty && <span className="dk-sub">Unsaved changes</span>}
      </div>
    </form>
  )
}

// ---------- account ----------
function Account({ l, me, reload, ask, toast }: { l: Line; me: string | null; reload: () => void; ask: Ask; toast: ReturnType<typeof useToast> }) {
  const [pinOpen, setPinOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const m = l.m
  if (!m) {
    return (
      <div className="dk-card"><div className="dk-card-h"><h2>Sign-in</h2></div><div className="dk-card-b mb-stack">
        {l.p.auth_user_id ? <p>Sign-in details could not be loaded. Reload the page to try again.</p> : <>
          <p>No sign-in for this person.</p>
          <p className="dk-sub">{l.p.display_name} is cared for by other members. To give a person their own phone sign-in, invite them by email.</p>
          {inviting ? <Invite ask={ask} close={() => setInviting(false)} say={(t) => toast.show(t)} /> : <div><button className="dk-b go" onClick={() => setInviting(true)}>Invite by email</button></div>}
        </>}
      </div></div>
    )
  }
  const self = m.userId === me
  const pinUser = signInType(m) === 'PIN'
  const st = memberState(m)
  const act = (text: string, body: Record<string, unknown>, doneText: string, undo?: Record<string, unknown>) =>
    ask(text, async () => {
      const r = await adminMembers(body)
      if (!r.ok) return toast.show(why(r.error))
      reload()
      toast.show(doneText, undo && (async () => { const u = await adminMembers(undo); toast.show(u.ok ? 'Undone.' : why(u.error)); reload() }))
    })
  return (
    <>
      <div className="dk-card"><div className="dk-card-h"><h2>Sign-in</h2><Tag tone={st.tone}>{st.text}</Tag></div><div className="dk-card-b mb-stack">
        <dl className="mp-dl">
          <div><dt>Type</dt><dd>{signInType(m)}</dd></div>
          <div><dt>Sign-in name</dt><dd>{m.handle ?? 'None'}</dd></div>
          <div><dt>Role</dt><dd>{m.role === 'admin' ? 'Admin' : 'Member'}</dd></div>
          <div><dt>Last sign-in</dt><dd><Ago iso={m.lastSignInAt} /></dd></div>
        </dl>
        <div className="mb-acts">
          {pinUser && <button className="dk-b" onClick={() => setPinOpen((o) => !o)} aria-expanded={pinOpen}>Reset PIN</button>}
          {pinUser && st.locked && <button className="dk-b" onClick={() => act(`Unlock ${m.displayName} so they can try their PIN again?`, { action: 'unlock', userId: m.userId }, `${m.displayName} unlocked.`)}>Unlock</button>}
          {!self && m.role === 'member' && !pinUser && <button className="dk-b" onClick={() => act(`Make ${m.displayName} an admin?`, { action: 'set_role', userId: m.userId, role: 'admin' }, `${m.displayName} is now an admin.`, { action: 'set_role', userId: m.userId, role: 'member' })}>Make admin</button>}
          {!self && m.role === 'admin' && <button className="dk-b" onClick={() => act(`Make ${m.displayName} a member?`, { action: 'set_role', userId: m.userId, role: 'member' }, `${m.displayName} is now a member.`, { action: 'set_role', userId: m.userId, role: 'admin' })}>Make member</button>}
        </div>
        {pinOpen && <ResetPin m={m} ask={ask} done={reload} close={() => setPinOpen(false)} />}
        {self && <p className="dk-sub">This is your own account, so you cannot change your role or disable it here.</p>}
        {!pinUser && m.role === 'member' && !self && <p className="dk-sub">Only Google sign-ins can be made admin.</p>}
      </div></div>
      {!self && (
        <div className="dk-card mp-danger"><div className="dk-card-h"><h2>Danger zone</h2></div><div className="dk-card-b mb-stack">
          <p className="dk-sub">{m.disabled ? `${m.displayName} cannot sign in. Enabling lets them sign in again.` : `Disabling signs ${m.displayName} out and stops them signing in. Their records stay.`}</p>
          <div><button className="dk-b bad" onClick={() => act(`${m.disabled ? 'Enable' : 'Disable'} ${m.displayName}?${m.disabled ? '' : ' They are signed out and cannot sign in.'}`, { action: 'disable', userId: m.userId, disabled: !m.disabled }, `${m.displayName} ${m.disabled ? 'enabled' : 'disabled'}.`, { action: 'disable', userId: m.userId, disabled: m.disabled })}>{m.disabled ? 'Enable' : 'Disable'} {m.displayName}</button></div>
        </div></div>
      )}
    </>
  )
}

// ---------- the page ----------
export const TABS = [['profile', 'Profile'], ['account', 'Account'], ['carers', 'Carers'], ['records', 'Records'], ['ids', 'IDs'], ['history', 'History']] as const
export type TabKey = (typeof TABS)[number][0]
export const tabOf = (sub: string | null | undefined): TabKey => (TABS.find(([k]) => k === sub)?.[0] ?? 'profile')
const WIDE: TabKey[] = ['records', 'ids', 'history']

const countOf = async (table: string, person: string): Promise<number | null> => {
  if (!supabase) return null
  try {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('person_id', person)
    return error ? null : count ?? null
  } catch { return null }
}

export default function MemberPage({ id, sub }: PageProps) {
  const roster = useRoster()
  const [detail, setDetail] = useState<Detail | null | undefined>(undefined) // undefined loading, null failed or missing
  const [papers, setPapers] = useState<number | null>(null)
  const [idCount, setIdCount] = useState<number | null>(null)
  const confirm = useConfirm()
  const toast = useToast()
  const dirty = useRef(false)
  const tab = tabOf(sub)

  useEffect(() => {
    if (!id) return
    setDetail(undefined); setPapers(null); setIdCount(null)
    if (supabase) {
      void Promise.resolve(supabase.from('people').select(COLS).eq('id', id)).then(({ data, error }) => setDetail(error ? null : ((data ?? []) as Detail[]).find((d) => d.id === id) ?? null), () => setDetail(null))
    } else setDetail(null)
    void countOf('documents', id).then(setPapers)
    void rpc<unknown[]>('admin_identifiers', { p_person: id }).then((r) => setIdCount(r.ok && Array.isArray(r.data) ? r.data.length : null))
  }, [id])

  // Unsaved profile edits: a click on any in-page link (tabs, sidebar, breadcrumb) asks first; closing the browser tab warns.
  // A jump made in code (the g + key shortcuts) is not held.
  const here = useRef('')
  here.current = deskHref('members', id, tab)
  useEffect(() => {
    const warn = (e: Event) => { if (dirty.current) e.preventDefault() }
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#/"]')
      if (!a || !dirty.current || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const to = a.getAttribute('href')!
      if (to === location.hash || (tab === 'profile' && to === here.current)) return
      e.preventDefault(); e.stopPropagation()
      confirm.ask('Leave without saving? Your changes to this profile will be lost.', async () => { dirty.current = false; location.hash = to })
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', click, true) }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return null
  const line = roster.lines.find((x) => x.p.id === id)
  if (roster.error) return <><PageHead title="Member" crumbs={[['Members', deskHref('members')]]} /><Empty>{NOT_CONNECTED}</Empty></>
  if (!roster.people || !roster.ready) return <><PageHead title="Member" crumbs={[['Members', deskHref('members')]]} /><Skeleton rows={6} /></>
  if (!line) return <><PageHead title="Member not found" crumbs={[['Members', deskHref('members')]]} /><Empty>This person is not in the family list. Go back to Members and pick someone.</Empty></>

  const { p, m } = line
  const st = stateOf(line)
  const age = ageOf(detail?.birthdate)
  const wide = WIDE.includes(tab)
  const say: Say = (t) => toast.show(t)
  const num = (n: number | null) => (n === null ? 'Unknown' : String(n))

  return (
    <div className="mb-page">
      <PageHead title={p.display_name} crumbs={[['Members', deskHref('members')]]}>
        {m && memberState(m).locked && <Tag tone="warn">Locked</Tag>}
      </PageHead>
      <nav className="dk-tabs" aria-label="Member sections">
        {TABS.map(([k, label]) => (
          <a key={k} href={deskHref('members', id, k)} aria-current={k === tab ? 'page' : undefined}>
            {label}{k === 'carers' && line.carers !== null && <em>{line.carers}</em>}
          </a>
        ))}
      </nav>
      <div className={`dk-grid mp-top${wide ? ' mp-wide' : ''}`}>
        <section className={`dk-card mp-sum ${wide ? 'dk-s12' : 'dk-s4'}`} aria-label="Summary">
          <div className="dk-card-b mb-stack">
            <div className="mb-who"><Avatar name={p.display_name} photoPath={p.photo_path} size={wide ? 44 : 64} /><div><strong>{p.display_name}</strong><div className="dk-sub">{roleOf(line)}</div></div></div>
            <dl className="mp-dl">
              <div><dt>Sign-in</dt><dd>{signInOf(line)}</dd></div>
              <div><dt>State</dt><dd><Tag tone={st.tone}>{st.text}</Tag></dd></div>
              <div><dt>Age</dt><dd>{detail === undefined ? '…' : age ?? 'Unknown'}</dd></div>
              <div><dt>Blood type</dt><dd>{detail === undefined ? '…' : detail?.blood_type ?? 'Unknown'}</dd></div>
              <div><dt>Last seen</dt><dd>{m ? <Ago iso={line.seen} /> : 'Not applicable'}</dd></div>
              <div><dt>Papers</dt><dd>{num(papers)}</dd></div>
              <div><dt>To confirm</dt><dd>{num(line.drafts)}</dd></div>
              <div><dt>IDs</dt><dd>{num(idCount)}</dd></div>
              <div><dt>Carers</dt><dd>{carersText(line)}</dd></div>
            </dl>
          </div>
        </section>
        <div className={`mp-main ${wide ? 'dk-s12' : 'dk-s8'}`}>
          {tab === 'profile' && (
            <div className="dk-card" role="tabpanel" aria-label="Profile"><div className="dk-card-h"><h2>Profile</h2></div><div className="dk-card-b">
              {detail === undefined ? <Skeleton rows={6} /> : detail === null ? <Empty>The profile could not be loaded. Reload the page to try again.</Empty> : (
                <ProfileForm key={id} id={id} name={p.display_name} photoPath={p.photo_path} detail={detail} say={say} onDirty={(d) => { dirty.current = d }} saved={() => roster.reload()} />
              )}
            </div></div>
          )}
          {tab === 'account' && <Account l={line} me={roster.me} reload={roster.reload} ask={confirm.ask} toast={toast} />}
          {tab === 'carers' && (
            <div className="dk-card" role="tabpanel" aria-label="Carers"><div className="dk-card-b">
              <Carers personId={id} people={roster.people} me={roster.me} ask={confirm.ask} say={say} onChange={roster.reload} />
            </div></div>
          )}
          {tab === 'records' && <Records id={id} embedded />}
          {tab === 'ids' && <Ids id={id} embedded />}
          {tab === 'history' && <History id={null} person={id} embedded />}
        </div>
      </div>
      {confirm.node}
      {toast.node}
    </div>
  )
}
