import { liveQuery } from 'dexie'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { db, enqueue } from '../../db'
import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { SAFETY_IDS, type TemplateId } from '../notify/templates'
import { type Entry, OVERRIDES_KEY, type Overrides, parseEdit } from '../safety/entries'
import { putKv } from '../safety/store'
import { Icon } from '../shell/Icon'
import { adminMembers, connected, type Carer, type ImportRow, linkCarer, listCarers, listPinRequests, markRequestDone, type Member, newsLastAt, type PinRequest, rpc, type Res, unlinkCarer, type UsageRow } from './api'
import { BROADCAST_IDS, sendBroadcast, templateLabel } from './broadcast'
import { pinError } from './pin'
import Avatar from './Avatar'
import MemberPage from './MemberPage'
import { type Ask, Field, NOT_CONNECTED, when, why } from './shared'
import { pickHandle } from '../../../supabase/functions/_shared/handle'
import './admin.css'

type Loaded<T> = { state: 'loading' } | { state: 'err'; error: string } | { state: 'ok'; data: T }

/** Load once, with a reload. Never throws. */
function useLoad<T>(fn: () => Promise<Res<T>>) {
  const [s, setS] = useState<Loaded<T>>({ state: 'loading' })
  const alive = useRef(true)
  const load = useCallback(async () => {
    const r = await fn()
    if (alive.current) setS(r.ok ? { state: 'ok', data: r.data } : { state: 'err', error: r.error })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [load])
  return [s, load] as const
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="hd">{title}</h2>
      <div className="grp ad-card">{children}</div>
    </section>
  )
}
const Msg = ({ s }: { s: { state: 'loading' } | { state: 'err'; error: string } }) =>
  s.state === 'loading' ? <p className="sub ad-pad">Loading</p> : <p className="ad-err ad-pad" role="alert">{why(s.error)}</p>

// ---------- Members ----------
function AddMember({ ask, done, taken }: { ask: Ask; done: () => void; taken: Set<string> }) {
  const [f, setF] = useState({ displayName: '', pin: '', role: 'member' })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const name = f.displayName.trim()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const bad = name === '' ? 'Enter a name.' : f.role === 'admin' ? 'Admins sign in with Google. Invite them below, then make them an admin.' : pinError(f.pin)
    if (bad) return setErr(bad)
    setErr('')
    ask(`Add ${name} as a member?`, async () => {
      const r = await adminMembers({ action: 'create', displayName: name, pin: f.pin, role: f.role }) // the server makes the sign-in name
      if (!r.ok) throw new Error(why(r.error))
      setF({ displayName: '', pin: '', role: 'member' })
      done()
    }, () => setF((x) => ({ ...x, pin: '' })))
  }
  return (
    <form className="ad-pad" onSubmit={submit} aria-label="Add a member">
      <strong>Add a member</strong>
      <Field label="Name"><input className="ad-in" value={f.displayName} onChange={set('displayName')} autoComplete="off" /></Field>
      {name && <p className="sub ad-signin" aria-live="polite">Sign-in name: <strong>{pickHandle(name, taken)}</strong></p>}
      <Field label="PIN (6 digits)"><input className="ad-in" type="password" inputMode="numeric" maxLength={6} value={f.pin} onChange={set('pin')} autoComplete="new-password" /></Field>
      <Field label="Role">
        <select className="ad-in" value={f.role} onChange={set('role')}><option value="member">Member</option><option value="admin">Admin</option></select>
      </Field>
      {err && <p className="ad-err" role="alert">{err}</p>}
      <button className="ad-b go" type="submit">Add member</button>
    </form>
  )
}

function MemberRow({ m, open }: { m: Member; open: () => void }) {
  return (
    <button className="ad-row ad-open" onClick={open} aria-label={`Open ${m.displayName}`}>
      <Avatar name={m.displayName} photoPath={m.profile?.photoPath} />
      <span className="ad-grow">
        <strong>{m.displayName}</strong>{m.disabled && <> <span className="ad-tag">disabled</span></>}
        <span className="sub ad-sub">{m.role === 'admin' ? 'Admin' : 'Member'} · {m.handle ?? 'Google account'}</span>
      </span>
      <Icon name="chev" />
    </button>
  )
}

// ---------- PIN requests ("Forgot PIN? Send a request" on the sign-in screen) ----------
function RequestRow({ r, who, ask, done }: { r: PinRequest; who: string; ask: Ask; done: () => void }) {
  const [pin, setPin] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const first = who.trim().split(/\s+/)[0] || r.handle
  return (
    <div className="ad-row">
      <div className="ad-grow">
        <strong>{first}</strong> <span className="ad-tag">pin reset</span>
        <div className="sub">asked {when(r.created_at)}</div>
      </div>
      <button className="ad-b" onClick={() => setPin(pin === null ? '' : null)} aria-label={`Reset PIN for ${first}`}>Reset PIN</button>
      <button className="ad-b" aria-label={`Mark ${first}'s request done`}
        onClick={() => ask(`Mark ${first}'s request done without changing the PIN?`, async () => { const x = await markRequestDone(r.id); if (!x.ok) throw new Error(why(x.error)); done() })}>Mark done</button>
      {pin !== null && (
        <form className="ad-grow" style={{ flexBasis: '100%' }} aria-label={`New PIN for ${first}`} onSubmit={(e) => {
          e.preventDefault()
          const bad = pinError(pin)
          if (bad) return setErr(bad)
          setErr('')
          const next = pin
          setPin(null)
          ask(`Set a new PIN for ${first} and close the request?`, async () => {
            const x = await adminMembers({ action: 'set_pin', userId: r.user_id, pin: next })
            if (!x.ok) throw new Error(why(x.error))
            await markRequestDone(r.id) // the PIN is changed either way; a failed close just leaves the row for "Mark done"
            done()
          })
        }}>
          <Field label="New PIN (6 digits)"><input className="ad-in" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" /></Field>
          {err && <p className="ad-err" role="alert">{err}</p>}
          <button className="ad-b go" type="submit" style={{ marginTop: 8 }}>Set PIN</button>
        </form>
      )}
    </div>
  )
}

function PinRequests({ members, ask }: { members: Member[]; ask: Ask }) {
  const [s, reload] = useLoad<PinRequest[]>(listPinRequests)
  if (s.state !== 'ok' || s.data.length === 0) return null // nothing waiting (or not readable yet): the section stays out of the way
  return (
    <Section id="ad-requests" title="PIN requests">
      {s.data.map((r) => <RequestRow key={r.id} r={r} who={members.find((m) => m.userId === r.user_id)?.displayName ?? ''} ask={ask} done={reload} />)}
    </Section>
  )
}

function Invite({ ask }: { ask: Ask }) {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  return (
    <form className="ad-pad" aria-label="Invite a Google account" onSubmit={(e) => {
      e.preventDefault()
      const v = email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return setErr('Enter a full email address.')
      setErr('')
      ask(`Let ${v} sign in with Google?`, async () => { const r = await adminMembers({ action: 'invite', email: v }); if (!r.ok) throw new Error(why(r.error)); setEmail('') })
    }}>
      <strong>Invite a Google account</strong>
      <Field label="Email"><input className="ad-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field>
      {err && <p className="ad-err" role="alert">{err}</p>}
      <button className="ad-b go" type="submit">Send invite</button>
    </form>
  )
}

function CarerLinks({ members, ask }: { members: Member[]; ask: Ask }) {
  const [links, reload] = useLoad<Carer[]>(listCarers)
  const [f, setF] = useState({ carer: '', person: '' })
  const people = members.filter((m) => m.personId)
  const name = (id: string, byPerson: boolean) => members.find((m) => (byPerson ? m.personId : m.userId) === id)?.displayName ?? 'Someone'
  return (
    <div>
      <div className="ad-pad">
        <strong>Carer links</strong>
        <span className="sub">A carer can see another person's health records, read only.</span>
        <Field label="Carer"><select className="ad-in" value={f.carer} onChange={(e) => setF({ ...f, carer: e.target.value })}><option value="">Choose</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</select></Field>
        <Field label="Can view records of"><select className="ad-in" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}><option value="">Choose</option>{people.map((m) => <option key={m.personId!} value={m.personId!}>{m.displayName}</option>)}</select></Field>
        <button className="ad-b go" disabled={!f.carer || !f.person} onClick={() => ask(`Let ${name(f.carer, false)} view the records of ${name(f.person, true)}?`, async () => {
          const r = await linkCarer(f.carer, f.person, false); if (!r.ok) throw new Error(why(r.error)); await reload()
        })}>Allow viewing</button>
      </div>
      {links.state === 'ok' && links.data.map((l) => (
        <div className="ad-row" key={l.carer_id + l.person_id}>
          <span className="ad-grow">{name(l.carer_id, false)} can view {name(l.person_id, true)} <span className="ad-tag">{l.can_write ? 'can edit' : 'view only'}</span></span>
          <button className="ad-b bad" aria-label={`Remove link ${name(l.carer_id, false)} to ${name(l.person_id, true)}`} onClick={() => ask(`Remove ${name(l.carer_id, false)} as carer of ${name(l.person_id, true)}?`, async () => {
            const r = await unlinkCarer(l.carer_id, l.person_id); if (!r.ok) throw new Error(why(r.error)); await reload()
          })}>Remove</button>
        </div>
      ))}
      {links.state === 'err' && <Msg s={links} />}
    </div>
  )
}

function Members({ s, reload, ask, open }: { s: Loaded<Member[]>; reload: () => void; ask: Ask; open: (id: string) => void }) {
  return (
    <Section id="ad-members" title="Members">
      {s.state !== 'ok' ? <Msg s={s} /> : (
        <>
          {s.data.length === 0 && <p className="sub ad-pad">No members yet.</p>}
          {s.data.map((m) => <MemberRow key={m.userId} m={m} open={() => open(m.userId)} />)}
          <AddMember ask={ask} done={reload} taken={new Set(s.data.flatMap((m) => (m.handle ? [m.handle] : [])))} />
          <Invite ask={ask} />
          <CarerLinks members={s.data} ask={ask} />
        </>
      )}
    </Section>
  )
}

// ---------- Usage ----------
function Usage({ members }: { members: Member[] }) {
  const [u] = useLoad<UsageRow[]>(() => rpc<UsageRow[]>('admin_usage_summary', { days: 30 }))
  const [a] = useLoad<{ messages: number; cap: number }[]>(() => rpc('admin_assistant_usage')) // hidden when the RPC does not exist
  const who = (id: string) => members.find((m) => m.userId === id)?.displayName ?? 'A member'
  if (u.state !== 'ok') return <Section id="ad-usage" title="Usage"><Msg s={u} /></Section>
  const rows = u.data
  const screens = new Map<string, number>()
  for (const r of rows) for (const t of r.top_screens ?? []) screens.set(t.name, (screens.get(t.name) ?? 0) + t.count)
  const top = [...screens].sort((x, y) => y[1] - x[1]).slice(0, 5)
  const used = a.state === 'ok' ? a.data.reduce((n, r) => n + r.messages, 0) : 0
  const cap = a.state === 'ok' ? a.data.reduce((n, r) => n + r.cap, 0) : 0
  const of = members.length || rows.length
  return (
    <Section id="ad-usage" title="Usage">
      {rows.length === 0 ? <p className="sub ad-pad">No usage yet.</p> : (
        <>
          <div className="ad-row"><span className="ad-grow">Active in the last 7 days</span><strong>{rows.filter((r) => r.active_7).length} of {of}</strong></div>
          <div className="ad-row"><span className="ad-grow">Active in the last 30 days</span><strong>{rows.filter((r) => r.active_30).length} of {of}</strong></div>
          <div className="ad-row"><span className="ad-grow">Alerts on</span><strong>{rows.filter((r) => r.alerts_on).length}</strong></div>
          <div className="ad-row"><span className="ad-grow">Sensors on</span><strong>{rows.filter((r) => r.sensors_on).length}</strong></div>
          {cap > 0 && <div className="ad-row"><span className="ad-grow">Assistant messages this month</span><strong>{used} of {cap}</strong></div>}
          <div className="ad-row"><span className="ad-grow">Top screens</span><span>{top.map(([n, c]) => `${n} ${c}`).join(', ') || 'None yet'}</span></div>
          {rows.map((r) => <div className="ad-row" key={r.user_id}><span className="ad-grow">{who(r.user_id)}</span><span className="sub">last seen {when(r.last_seen)} · {r.events} events</span></div>)}
        </>
      )}
    </Section>
  )
}

// ---------- Safety data ----------
const ENTRIES: { e: Entry; geo: boolean }[] = [
  ...(places as Entry[]).map((e) => ({ e, geo: true })),
  ...(hotlines as Entry[]).map((e) => ({ e, geo: false }))
]

function SafetyData({ ask, say }: { ask: Ask; say: (s: string) => void }) {
  const [id, setId] = useState(ENTRIES[0]?.e.id ?? '')
  const [f, setF] = useState({ lat: '', lon: '', phone: '' })
  const [err, setErr] = useState('')
  const cur = ENTRIES.find((x) => x.e.id === id)
  if (!cur) return null
  return (
    <Section id="ad-safety" title="Safety data">
      <form className="ad-pad" aria-label="Edit a hotline or place" onSubmit={(ev) => {
        ev.preventDefault()
        const r = parseEdit(f, cur.geo)
        if (!r.ok) return setErr(r.error)
        setErr('')
        ask(`Change ${cur.e.name} for every family phone?`, async () => {
          const o = ((await db.kv.get(OVERRIDES_KEY))?.value as Overrides | undefined) ?? {}
          await putKv(OVERRIDES_KEY, { ...o, [id]: { ...o[id], ...r.patch } }) // applies on this phone at once
          await enqueue('safety_overrides', 'upsert', { kind: cur.geo ? 'place' : 'hotline', key: id, data: r.patch, removed: false }) // reaches the others when sync runs
          setF({ lat: '', lon: '', phone: '' })
          say(`Saved ${cur.e.name}. It reaches other phones when they sync.`)
        })
      }}>
        <Field label="Entry"><select className="ad-in" value={id} onChange={(e) => { setId(e.target.value); setErr('') }}>
          {ENTRIES.map(({ e, geo }) => <option key={e.id} value={e.id}>{geo ? 'Place' : 'Hotline'}: {e.name}</option>)}
        </select></Field>
        {cur.geo ? (
          <>
            <Field label="Latitude"><input className="ad-in" inputMode="decimal" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></Field>
            <Field label="Longitude"><input className="ad-in" inputMode="decimal" value={f.lon} onChange={(e) => setF({ ...f, lon: e.target.value })} /></Field>
          </>
        ) : (
          <Field label="Phone number"><input className="ad-in" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        )}
        {err && <p className="ad-err" role="alert">{err}</p>}
        <button className="ad-b go" type="submit">Save</button>
      </form>
    </Section>
  )
}

// ---------- Broadcast ----------
function Broadcast({ ask, say }: { ask: Ask; say: (s: string) => void }) {
  const [id, setId] = useState<TemplateId>(BROADCAST_IDS[0] ?? SAFETY_IDS[0]!)
  return (
    <Section id="ad-broadcast" title="Safety broadcast">
      <div className="ad-pad">
        <span className="sub">Sends one of the fixed safety messages to every family phone. You cannot type your own text.</span>
        <Field label="Message"><select className="ad-in" value={id} onChange={(e) => setId(e.target.value as TemplateId)}>
          {BROADCAST_IDS.map((t) => <option key={t} value={t}>{templateLabel(t)}</option>)}
        </select></Field>
        <button className="ad-b go" onClick={() => ask(`Send "${templateLabel(id)}" to every family phone now?`, async () => {
          const r = await sendBroadcast(id)
          if (!r.ok) throw new Error(r.error)
          say('Broadcast sent.')
        })}>Send broadcast</button>
      </div>
    </Section>
  )
}

// ---------- Import status ----------
function Imports() {
  const [s] = useLoad<ImportRow[]>(() => rpc<ImportRow[]>('admin_import_counts'))
  return (
    <Section id="ad-import" title="Import status">
      {s.state !== 'ok' ? <Msg s={s} /> : s.data.length === 0 ? <p className="sub ad-pad">Nothing imported yet.</p> :
        s.data.map((r) => <div className="ad-row" key={r.person_id}><span className="ad-grow">{r.display_name}</span><span className="sub">{r.readings} readings · {r.consults} visits</span></div>)}
    </Section>
  )
}

// ---------- System health ----------
function System() {
  const [news] = useLoad<string | null>(newsLastAt)
  const [backlog, setBacklog] = useState<number | null>(null)
  useEffect(() => {
    const sub = liveQuery(() => db.outbox.count()).subscribe({ next: setBacklog, error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  return (
    <Section id="ad-system" title="System health">
      <div className="ad-row"><span className="ad-grow">News feed last item</span>
        <span className="sub">{news.state === 'ok' ? (news.data ? when(news.data) : 'No news yet') : news.state === 'loading' ? 'Loading' : why(news.error)}</span></div>
      <div className="ad-row"><span className="ad-grow">Waiting to sync on this phone</span><strong>{backlog ?? '...'}</strong></div>
    </Section>
  )
}

// ---------- Screen ----------
export default function AdminScreen() {
  const [members, reload] = useLoad<Member[]>(async () => {
    const r = await adminMembers<{ members: Member[] }>({ action: 'list' })
    return r.ok ? { ok: true, data: r.data.members ?? [] } : r
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ text: string; run: () => Promise<void>; abort?: () => void } | null>(null)
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const openMember = members.state === 'ok' ? members.data.find((m) => m.userId === openId) : undefined
  const cancelBtn = useRef<HTMLButtonElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => { if (pending) cancelBtn.current?.focus() }, [pending])
  const ask: Ask = (text, run, abort) => { setNote(null); trigger.current = document.activeElement as HTMLElement | null; setPending({ text, run, abort }) }
  const close = (aborted: boolean) => {
    if (aborted) pending?.abort?.()
    setPending(null)
    const t = trigger.current
    if (t?.isConnected) setTimeout(() => t.focus(), 0)
  }
  const say = (text: string) => setNote({ text, bad: false })
  const go = async () => {
    if (!pending) return
    setBusy(true)
    try { await pending.run(); setNote((n) => n ?? { text: 'Done.', bad: false }) } catch (e) { setNote({ text: (e as Error).message || 'Something went wrong. Try again.', bad: true }); pending.abort?.() }
    setBusy(false)
    close(false)
  }
  return (
    <div className="ad">
      {openMember ? <MemberPage key={openMember.userId} m={openMember} ask={ask} reload={reload} back={() => setOpenId(null)} /> : (
        <>
          <div className="hdr"><h1>Admin</h1><span>Family members, usage and safety tools</span></div>
          {!connected() && <p className="ad-note" role="status">{NOT_CONNECTED}</p>}
          <p className="sub" style={{ margin: '0 4px' }}>You see which screens people use and when. You never see health values.</p>
          {note && <p className={note.bad ? 'ad-err' : 'ad-note'} role={note.bad ? 'alert' : 'status'}>{note.text}</p>}
          <PinRequests members={members.state === 'ok' ? members.data : []} ask={ask} />
          <Members s={members} reload={reload} ask={ask} open={setOpenId} />
          <Usage members={members.state === 'ok' ? members.data : []} />
          <SafetyData ask={ask} say={say} />
          <Broadcast ask={ask} say={say} />
          <Imports />
          <System />
        </>
      )}
      {pending && (
        <div className="ad-confirm" role="alertdialog" aria-label="Confirm" aria-describedby="ad-confirm-text" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) close(true) }}>
          <p id="ad-confirm-text">{pending.text}</p>
          <div className="ad-btns">
            <button className="ad-b" ref={cancelBtn} onClick={() => close(true)} disabled={busy}>Cancel</button>
            <button className="ad-b go" onClick={go} disabled={busy}>Confirm</button>
          </div>
        </div>
      )}
    </div>
  )
}
