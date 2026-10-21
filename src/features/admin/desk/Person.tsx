import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { supabase } from '../../auth/client'
import { uploadAvatar } from '../api'
import Avatar from '../Avatar'
import { toAvatarJpeg } from '../photo'
import { NOT_CONNECTED, why } from '../shared'
import Carers from './Carers'
import { selfId } from './Members'
import { useDeskPeople } from './people'
import { deskHref, type PageProps } from './types'
import { Empty, Filters, PageHead, Panel, Tag, useConfirm, useToast } from './ui'
import './members.css'

/** Allowed values from 0010 (blood type check) and 0013 (sex check). */
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
/** The only people columns an admin may update (column grants in 0010 and 0013). Anything else is never sent. */
export const GRANTED = ['display_name', 'photo_path', 'phone', 'birthdate', 'blood_type', 'allergies', 'conditions', 'medicines', 'aliases', 'sex', 'address'] as const

export type Detail = { id: string; phone: string | null; birthdate: string | null; sex: string | null; blood_type: string | null; address: string | null; aliases: string[]; allergies: string[]; conditions: string[] }
export type Form = { name: string; phone: string; birthdate: string; sex: string; bloodType: string; address: string; aliases: string; allergies: string; conditions: string }
export type Patch = { display_name: string; phone: string | null; birthdate: string | null; sex: string | null; blood_type: string | null; address: string | null; aliases: string[]; allergies: string[]; conditions: string[] }

const COLS = 'id, phone, birthdate, sex, blood_type, address, aliases, allergies, conditions'
const toLines = (s: string) => {
  const out: string[] = []
  for (const l of s.split('\n')) { const t = l.replace(/\s+/g, ' ').trim(); if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t) }
  return out
}
export const formOf = (name: string, d: Detail | undefined): Form => ({
  name, phone: d?.phone ?? '', birthdate: d?.birthdate ?? '', sex: d?.sex ?? '', bloodType: d?.blood_type ?? '', address: d?.address ?? '',
  aliases: (d?.aliases ?? []).join('\n'), allergies: (d?.allergies ?? []).join('\n'), conditions: (d?.conditions ?? []).join('\n')
})

/** Checks the form and builds the update payload (granted columns only). Unknown stays null, never a made-up value. */
export function profilePatch(f: Form, today = new Date().toISOString().slice(0, 10)): { patch: Patch } | { error: string } {
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

async function loadDetails(): Promise<Map<string, Detail>> {
  if (!supabase) return new Map()
  const { data, error } = await supabase.from('people').select(COLS)
  if (error) throw new Error('not_connected')
  return new Map(((data ?? []) as Detail[]).map((d) => [d.id, d]))
}

function ProfileForm({ id, name, photoPath, detail, say, saved }: { id: string; name: string; photoPath: string | null; detail: Detail | undefined; say: (t: string) => void; saved: () => void }) {
  const [f, setF] = useState(() => formOf(name, detail))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [rev, setRev] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

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
    if (ok) { say('Profile saved.'); saved() }
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
    <form className="mb-form" aria-label="Profile" onSubmit={save}>
      <div className="mb-who">
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
      <label className="dk-field">Conditions (one per line)<textarea className="dk-in mb-ta" value={f.conditions} onChange={set('conditions')} /></label>
      {err && <p className="mb-err" role="alert">{err}</p>}
      <button className="dk-b go" type="submit" disabled={busy}>Save profile</button>
    </form>
  )
}

export default function People({ id }: PageProps) {
  const { people, error, reload } = useDeskPeople()
  const [details, setDetails] = useState<Map<string, Detail>>(new Map())
  const [carerCount, setCarerCount] = useState<Map<string, number>>(new Map())
  const [me, setMe] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const confirm = useConfirm()
  const toast = useToast()

  const loadExtra = () => {
    void loadDetails().then(setDetails, () => undefined)
    if (!supabase) return
    void supabase.from('carers').select('person_id').then(({ data }) => {
      const m = new Map<string, number>()
      for (const c of (data ?? []) as { person_id: string }[]) m.set(c.person_id, (m.get(c.person_id) ?? 0) + 1)
      setCarerCount(m)
    })
  }
  useEffect(() => { loadExtra(); void selfId().then(setMe) }, [])
  const shown = useMemo(() => (people ?? []).filter((p) => !q.trim() || p.display_name.toLowerCase().includes(q.trim().toLowerCase())), [people, q])
  const sel = id ? people?.find((p) => p.id === id) : undefined
  const open = (pid: string) => { location.hash = deskHref('members', pid) }
  const close = () => { location.hash = deskHref('members') }

  return (
    <>
      <PageHead title="People" sub="Everyone in the family, with or without a phone." />
      <Filters>
        <input className="dk-in" type="search" aria-label="Search people" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
      </Filters>
      {error ? <Empty>{NOT_CONNECTED}</Empty> : people === null ? <Empty>Loading people.</Empty> : shown.length === 0 ? <Empty>No people match.</Empty> : (
        <div className="dk-scrollx">
          <table className="dk-table">
            <caption className="mb-cap">People</caption>
            <thead><tr>
              <th scope="col">Name</th><th scope="col">Has sign-in</th><th scope="col" className="num">Age</th><th scope="col">Blood type</th><th scope="col" className="num">Carers</th>
            </tr></thead>
            <tbody>
              {shown.map((p) => {
                const d = details.get(p.id)
                const age = ageOf(d?.birthdate)
                return (
                  <tr key={p.id} aria-selected={p.id === id}>
                    <th scope="row"><button className="mb-sel" onClick={() => open(p.id)} aria-label={`Open ${p.display_name}`}>{p.display_name}</button></th>
                    <td>{p.auth_user_id ? 'Yes' : 'No'}</td>
                    <td className="num">{age ?? 'Unknown'}</td>
                    <td>{d?.blood_type ?? 'Unknown'}</td>
                    <td className="num">{carerCount.get(p.id) ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {sel && (
        <Panel title={sel.display_name} onClose={close}>
          <div className="dk-acts"><Tag>{sel.auth_user_id ? 'Has sign-in' : 'No sign-in'}</Tag></div>
          <ProfileForm key={sel.id + (details.has(sel.id) ? 'd' : '')} id={sel.id} name={sel.display_name} photoPath={sel.photo_path} detail={details.get(sel.id)} say={(t) => toast.show(t)} saved={() => { reload(); loadExtra() }} />
          <Carers personId={sel.id} people={people ?? []} me={me} ask={confirm.ask} say={(t) => toast.show(t)} onChange={loadExtra} />
        </Panel>
      )}
      {confirm.node}
      {toast.node}
    </>
  )
}
