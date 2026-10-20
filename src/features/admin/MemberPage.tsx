import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Icon } from '../shell/Icon'
import ChipField from '../setup/ChipField'
import { ALLERGIES, BLOOD_TYPES, CONDITIONS } from '../setup/lists'
import MedicineEditor from '../setup/MedicineEditor'
import '../setup/setup.css'
import { adminMembers, type Member, updatePerson, uploadAvatar } from './api'
import Avatar from './Avatar'
import { toAvatarJpeg } from './photo'
import { pinError } from './pin'
import { type Ask, Field, when, why } from './shared'

/** One family member: photo, details, and the account tools (PIN, unlock, role, disable). Opened from the Members list. */
export default function MemberPage({ m, ask, reload, back }: { m: Member; ask: Ask; reload: () => void; back: () => void }) {
  const pr = m.profile
  const [f, setF] = useState({ displayName: m.displayName, phone: pr?.phone ?? '', birthdate: pr?.birthdate ?? '', bloodType: pr?.bloodType ? [pr.bloodType] : [] as string[], allergies: pr?.allergies ?? [], conditions: pr?.conditions ?? [] })
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [rev, setRev] = useState(0)
  const [pin, setPin] = useState<string | null>(null)
  const [pinErr, setPinErr] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const pid = m.personId
  const say = (text: string, bad = false) => setStatus({ text, bad })

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!pid) return
    if (!f.displayName.trim()) return say('Enter a name.', true)
    setBusy(true)
    const r = await updatePerson(pid, {
      displayName: f.displayName.trim(), phone: f.phone.trim() || null, birthdate: f.birthdate || null, bloodType: f.bloodType[0] ?? null,
      allergies: f.allergies, conditions: f.conditions
    })
    setBusy(false)
    if (!r.ok) return say(why(r.error), true)
    say('Saved.')
    reload()
  }

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // the same picture can be chosen again
    if (!file || !pid) return
    setBusy(true)
    const jpeg = await toAvatarJpeg(file)
    if (!jpeg) { setBusy(false); return say('That file is not a picture Bantay can read.', true) }
    const up = await uploadAvatar(pid, jpeg)
    const r = up.ok ? await updatePerson(pid, { photoPath: up.data }) : up
    setBusy(false)
    if (!r.ok) return say(why(r.error), true)
    setRev((n) => n + 1)
    say('Photo saved.')
    reload()
  }

  const act = (text: string, body: Record<string, unknown>) =>
    ask(text, async () => { const r = await adminMembers({ ...body, userId: m.userId }); if (!r.ok) throw new Error(why(r.error)); reload() })
  const set = (k: 'displayName' | 'phone' | 'birthdate') => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return (
    <>
      <div className="ad-top">
        <button className="sh-iconbtn" onClick={back} aria-label="Back to Members"><Icon name="back" /></button>
        <div className="ad-grow"><h1 className="ad-h1">{m.displayName}</h1><div className="sub">{m.role === 'admin' ? 'Admin' : 'Member'}{m.disabled ? ' · disabled' : ''}</div></div>
      </div>
      {status && <p className={status.bad ? 'ad-err' : 'ad-note'} role={status.bad ? 'alert' : 'status'}>{status.text}</p>}

      <div className="grp ad-card ad-photo">
        <Avatar name={m.displayName} photoPath={pr?.photoPath} size={96} rev={rev} />
        <div className="ad-btns">
          <button className="ad-b" type="button" disabled={!pid || busy} onClick={() => camera.current?.click()}>Take photo</button>
          <button className="ad-b" type="button" disabled={!pid || busy} onClick={() => gallery.current?.click()}>Choose photo</button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={pick} aria-label="Photo from camera" />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} aria-label="Photo from gallery" />
      </div>

      <form aria-label="Member details" onSubmit={save}>
        <h2 className="hd">Details</h2>
        <div className="grp ad-card">
          <div className="ad-pad">
            <Field label="Name"><input className="ad-in" value={f.displayName} onChange={set('displayName')} autoComplete="off" maxLength={80} /></Field>
            <Field label="Phone"><input className="ad-in" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="off" maxLength={30} /></Field>
            <Field label="Birthday"><input className="ad-in" type="date" value={f.birthdate} onChange={set('birthdate')} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} /></Field>
          </div>
          <ChipField label="Blood type" options={BLOOD_TYPES} value={f.bloodType} onChange={(v) => setF({ ...f, bloodType: v })} allowOther={false} />
          <ChipField label="Allergies" options={ALLERGIES} value={f.allergies} onChange={(v) => setF({ ...f, allergies: v })} multi exclusive={['None']} />
          <ChipField label="Conditions" options={CONDITIONS} value={f.conditions} onChange={(v) => setF({ ...f, conditions: v })} multi exclusive={['None']} />
        </div>
        <h2 className="hd">Medicines</h2>
        {pid ? <MedicineEditor personId={pid} label="Medicines" /> : <p className="sub ad-pad">Medicines can be added once this member has a profile.</p>}
        {!pid && <p className="sub ad-pad">This member has no profile yet, so details cannot be saved.</p>}
        <button className="ad-b go ad-wide" type="submit" disabled={!pid || busy}>Save details</button>
      </form>

      <h2 className="hd">Sign-in</h2>
      <div className="grp ad-card">
        <div className="ad-row"><span className="ad-grow">Sign-in name</span><strong>{m.handle ?? 'Google account'}</strong></div>
        <div className="ad-row"><span className="ad-grow">Last sign-in</span><span className="sub">{when(m.lastSignInAt)}</span></div>
        <div className="ad-row">
          <span className="ad-grow">Role: {m.role === 'admin' ? 'Admin' : 'Member'}</span>
          <button className="ad-b" onClick={() => act(`Make ${m.displayName} ${m.role === 'admin' ? 'a member' : 'an admin'}?`, { action: 'set_role', role: m.role === 'admin' ? 'member' : 'admin' })} aria-label={`Change role of ${m.displayName}`}>
            {m.role === 'admin' ? 'Make member' : 'Make admin'}
          </button>
        </div>
        {m.handle && (
          <div className="ad-row">
            <span className="ad-grow">PIN</span>
            <button className="ad-b" onClick={() => setPin(pin === null ? '' : null)} aria-label={`Reset PIN for ${m.displayName}`}>Reset PIN</button>
            <button className="ad-b" onClick={() => act(`Unlock ${m.displayName} so they can try their PIN again?`, { action: 'unlock' })} aria-label={`Unlock ${m.displayName}`}>Unlock</button>
          </div>
        )}
        {pin !== null && (
          <form className="ad-pad" aria-label={`New PIN for ${m.displayName}`} onSubmit={(e) => {
            e.preventDefault()
            const bad = pinError(pin)
            if (bad) return setPinErr(bad)
            setPinErr('')
            act(`Set a new PIN for ${m.displayName}?`, { action: 'set_pin', pin })
            setPin(null)
          }}>
            <Field label="New PIN (6 digits)"><input className="ad-in" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" /></Field>
            {pinErr && <p className="ad-err" role="alert">{pinErr}</p>}
            <button className="ad-b go" type="submit">Set PIN</button>
          </form>
        )}
        <div className="ad-row">
          <span className="ad-grow">{m.disabled ? 'This member is disabled' : 'Can sign in'}</span>
          <button className="ad-b bad" onClick={() => act(`${m.disabled ? 'Enable' : 'Disable'} ${m.displayName}?`, { action: 'disable', disabled: !m.disabled })} aria-label={`${m.disabled ? 'Enable' : 'Disable'} ${m.displayName}`}>
            {m.disabled ? 'Enable' : 'Disable'}
          </button>
        </div>
      </div>
    </>
  )
}
