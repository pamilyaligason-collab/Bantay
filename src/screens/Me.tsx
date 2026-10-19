import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../features/auth/client'
import { clearLastPerson, enablePasskey, forgetPhone, hasPasskeyFlag, loadFamily, passkeySupported } from '../features/auth/family'
import { getMember, signOut, type Member } from '../features/auth/session'
import { Icon } from '../features/shell/Icon'
import { applyTheme, THEME_KEY, type ThemePref } from '../features/shell/theme'
import { useKv } from '../features/shell/useKv'
import SosContactsPicker from '../features/sos/SosContactsPicker'
import { normalizeContacts, type SosContact } from '../features/sos/contacts'
import DetailsSheet from '../features/setup/DetailsSheet'
import { useOwnAvatar } from '../features/setup/useProfile'
import SensorSettings from '../features/sensors/SensorSettings'
import SetupCard from '../features/today/SetupCard'
import { UpdateRow } from '../features/update/UpdateRow'
import '../features/shell/shell.css'

// Me and settings (mockup data-id="me"). Sharing defaults to OFF for everything (D-34); stored on this phone as kv share.<key>, synced in P5.
const SHARE = [
  { key: 'readings', label: 'Readings', sub: 'BP, sugar, weight' },
  { key: 'medicines', label: 'Medicines', sub: '' },
  { key: 'records', label: 'Records', sub: '' },
  { key: 'mood', label: 'Mood', sub: '' },
  { key: 'location', label: 'Live location', sub: 'Off shows your last known place' }
] as const
const THEMES: { id: ThemePref; label: string }[] = [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="sh-switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

function ShareRow({ k, label, sub }: { k: string; label: string; sub: string }) {
  const [on, set] = useKv<boolean>(`share.${k}`, false)
  return (
    <div>
      <div className="sh-grow"><b>{label}</b>{sub && <div className="sh-sub">{sub}</div>}</div>
      <Switch label={`Share ${label.toLowerCase()}`} on={on} onChange={set} />
    </div>
  )
}

function SosSheet({ onClose, selfId, onSaved }: { onClose: () => void; selfId: string | null; onSaved: (c: SosContact[]) => void }) {
  return createPortal(
    <div className="sh sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label="Who gets your SOS text" onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        <h2 className="sh-h2">Who gets your SOS text</h2>
        <SosContactsPicker excludePersonId={selfId} onSaved={onSaved} />
        <button type="button" className="sh-pill sh-primary sh-block" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

export default function Me() {
  const [member, setMember] = useState<Member | null>(null)
  const [who, setWho] = useState('')
  const [passkey, setPasskey] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sosOpen, setSosOpen] = useState(false)
  const [sosRaw, setSosRaw] = useKv<unknown>('sos.contacts', [])
  const [simple, setSimple] = useKv<boolean>('mode.simple', false)
  const [quiet, setQuiet] = useKv<boolean>('quiet.on', true)
  const [theme, setTheme] = useKv<ThemePref>(THEME_KEY, 'system')
  const photo = useOwnAvatar()
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    let live = true
    void getMember().then(async (m) => {
      if (!live || !m) return
      setMember(m)
      if (!m.personId) return
      if (hasPasskeyFlag(m.personId)) setPasskey(true)
      const row = await supabase?.from('people').select('display_name').eq('id', m.personId).maybeSingle()
      if (live) setWho(row?.data?.display_name ?? loadFamily().find((f) => f.personId === m.personId)?.displayName ?? '')
    })
    return () => { live = false }
  }, [])

  const pickTheme = (t: ThemePref) => { setTheme(t); applyTheme(t) }
  const turnOnPasskey = async () => {
    setBusy(true)
    const e = member?.personId ? await enablePasskey(member.personId) : 'Not available on this phone yet'
    setNote(e ?? 'Fingerprint or face sign-in is on for this phone.')
    if (!e) setPasskey(true)
    setBusy(false)
  }
  const names = normalizeContacts(sosRaw, loadFamily()).map((c) => c.name).filter(Boolean).join(' and ')

  return (
    <div className="sh sh-me">
      <div className="sh-row">
        <a className="sh-iconbtn" href="#today" aria-label="Back to Today"><Icon name="back" /></a>
        <h1 className="sh-h2">Me</h1>
      </div>

      <div className="sh-card sh-row">
        <span className="sh-av sh-av-lg">{photo ? <img src={photo} alt="" /> : (who || '?').charAt(0).toUpperCase()}</span>
        <div className="sh-grow">
          <b>{who || 'You'}</b>
          <div className="sh-sub">This phone · fingerprint {passkey ? 'on' : 'off'}</div>
        </div>
        {member?.personId && <button type="button" className="sh-edit" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog">Edit</button>}
      </div>

      <div className="sh-sech"><b>Family can see my</b></div>
      <div className="sh-card sh-list">{SHARE.map((s) => <ShareRow key={s.key} k={s.key} label={s.label} sub={s.sub} />)}</div>
      <p className="sh-sub sh-note">Everything starts off. You choose what the family sees. Admins can see everything.</p>

      <div className="sh-card sh-list">
        <button type="button" className="sh-navrow" onClick={() => setSosOpen(true)} aria-haspopup="dialog">
          <Icon name="phone" />
          <span className="sh-grow"><b>Who gets your SOS text</b><span className="sh-sub sh-blk">{names || 'Nobody picked yet'}</span></span>
          <Icon name="chev" />
        </button>
        <a className="sh-navrow" href="#medid">
          <Icon name="cross" />
          <span className="sh-grow"><b>Medical ID</b><span className="sh-sub sh-blk">Blood type, allergies, medicines, who to call</span></span>
          <Icon name="chev" />
        </a>
        <a className="sh-navrow" href="#notif">
          <Icon name="bell" />
          <span className="sh-grow"><b>Notifications</b><span className="sh-sub sh-blk">Inbox, and what each one says</span></span>
          <Icon name="chev" />
        </a>
      </div>

      <div className="sh-card sh-list">
        <div><div className="sh-grow"><b>Simple mode</b><div className="sh-sub">Big buttons: I&apos;m OK, Call family, SOS</div></div><Switch label="Simple mode" on={simple} onChange={setSimple} /></div>
        <div><div className="sh-grow"><b>Quiet hours</b><div className="sh-sub">10 PM to 6 AM, alerts still ring</div></div><Switch label="Quiet hours" on={quiet} onChange={setQuiet} /></div>
        <div>
          <div className="sh-grow"><b>Theme</b></div>
          <div className="sh-seg" role="group" aria-label="Theme">
            {THEMES.map((t) => <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => pickTheme(t.id)}>{t.label}</button>)}
          </div>
        </div>
      </div>

      <div className="sh-me-setup">
        <div className="sh-sech"><b>Setup checklist</b></div>
        <SetupCard />
      </div>

      <div className="sh-me-sensors"><SensorSettings /></div>

      <div className="sh-card sh-list">
        <UpdateRow />
        {member?.role === 'admin' && (
          <a className="sh-navrow" href="#admin">
            <Icon name="gear" />
            <span className="sh-grow"><b>Admin</b><span className="sh-sub sh-blk">Admins only</span></span>
            <Icon name="chev" />
          </a>
        )}
        {supabase && (
          <>
            {passkeySupported() && !passkey && (
              <button type="button" className="sh-navrow" disabled={busy} onClick={turnOnPasskey}>
                <Icon name="check" />
                <span className="sh-grow"><b>Turn on fingerprint or face sign-in</b></span>
                <Icon name="chev" />
              </button>
            )}
            {passkey && <div><Icon name="check" /><div className="sh-grow"><b>Fingerprint or face sign-in is on</b></div></div>}
            <button type="button" className="sh-navrow" onClick={() => { clearLastPerson(); void signOut() }}>
              <Icon name="users" /><span className="sh-grow"><b>Not you? Switch person</b></span><Icon name="chev" />
            </button>
            <button type="button" className="sh-navrow" onClick={() => { forgetPhone(); void signOut() }}>
              <Icon name="shield" /><span className="sh-grow"><b>Forget this phone</b></span><Icon name="chev" />
            </button>
          </>
        )}
      </div>
      {who && supabase && <p className="sh-sub sh-note">Signed in as {who}</p>}
      {note && <p className="sh-sub sh-note" role="status">{note}</p>}

      {detailsOpen && member?.personId && <DetailsSheet personId={member.personId} name={who} onClose={() => setDetailsOpen(false)} />}
      {sosOpen && <SosSheet onSaved={setSosRaw} onClose={() => setSosOpen(false)} selfId={member?.personId ?? null} />}
    </div>
  )
}
