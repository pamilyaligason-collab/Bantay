import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../features/auth/client'
import { clearLastPerson, enablePasskey, forgetPhone, hasPasskeyFlag, loadFamily, passkeySupported } from '../features/auth/family'
import { getMember, signOut, type Member } from '../features/auth/session'
import { Icon } from '../features/shell/Icon'
import { SubHeader } from '../features/shell/SubHeader'
import { applyTheme, THEME_KEY, type ThemePref } from '../features/shell/theme'
import { applyTextSize, isTextSize, TEXT_SIZE_KEY, TEXT_SIZES, type TextSize } from '../features/shell/textSize'
import { Capacitor } from '@capacitor/core'
import { useKv } from '../features/shell/useKv'
import { isLang, LANG_KEY, LANGS, setLang, type Lang } from '../lib/i18n'
import { AlarmHealthRow } from '../features/phonecheck/AlarmHealthRow'
import { KEY_PHONE_CHECK } from '../features/phonecheck/keys'
import { useKvValue } from '../features/phonecheck/useKvValue'
import { ConsentNotice } from '../features/privacy/ConsentNotice'
import { callPermission, requestCallPermission, type CallPermission } from '../features/sos/call'
import SosContactsPicker from '../features/sos/SosContactsPicker'
import { normalizeContacts, type SosContact } from '../features/sos/contacts'
import DetailsSheet from '../features/setup/DetailsSheet'
import { useOwnAvatar } from '../features/setup/useProfile'
import SensorSettings from '../features/sensors/SensorSettings'
import SetupCard from '../features/today/SetupCard'
import { UpdateRow, VersionRow } from '../features/update/UpdateRow'
import { loadCarerOf } from '../features/family/reportData'
import { useFamilyPeople } from '../features/family/roster'
import DigestToggle from '../features/notify/DigestToggle'
import { PushPermissionRow } from '../features/notify/PushPermissionRow'
import '../features/shell/shell.css'

// Me and settings (mockup data-id="me"). What the family can see is the server list at #sharing (lane A, D-80); the old local share.* switches are gone.
const THEMES: { id: ThemePref; label: string }[] = [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="sh-switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
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

/** "Hold for help can call for you": the one place besides setup that asks for the Phone permission (never the SOS flow). Android app only.
 *  Hidden when Android already took the permission back and the Alarms rows below say so (AlarmHealthRow), so the same warning never shows twice. */
function CallRow() {
  const [perm, setPerm] = useState<CallPermission>('unavailable')
  const check = useKvValue<{ call_ok?: boolean | null }>(KEY_PHONE_CHECK)
  useEffect(() => { let live = true; void callPermission().then((p) => { if (live) setPerm(p) }); return () => { live = false } }, [])
  if (perm === 'unavailable' || (perm === 'denied' && check?.call_ok === false)) return null
  return (
    <div>
      <div className="sh-grow">
        <b>Hold for help can call for you</b>
        <div className="sh-sub">{perm === 'granted' ? 'On. Hold for help calls your first contact for you. 911 always opens the dial screen.' : 'Off. Hold for help opens the dial screen and you press call.'}</div>
      </div>
      {perm === 'denied' && <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void requestCallPermission().then(setPerm)}>Allow</button>}
    </div>
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
  const [textSize, setTextSize] = useKv<TextSize>(TEXT_SIZE_KEY, 'normal')
  const [lang, setLangKv] = useKv<Lang>(LANG_KEY, 'en')
  const photo = useOwnAvatar()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [carerOf, setCarerOf] = useState<string[]>([])
  const { people: roster } = useFamilyPeople()

  useEffect(() => {
    let live = true
    void getMember().then(async (m) => {
      if (!live || !m) return
      setMember(m)
      void loadCarerOf(supabase, m.userId).then((ids) => { if (live) setCarerOf(ids) })
      if (!m.personId) return
      if (hasPasskeyFlag(m.personId)) setPasskey(true)
      const row = await supabase?.from('people').select('display_name').eq('id', m.personId).maybeSingle()
      if (live) setWho(row?.data?.display_name ?? loadFamily().find((f) => f.personId === m.personId)?.displayName ?? '')
    })
    return () => { live = false }
  }, [])

  const pickTheme = (t: ThemePref) => { setTheme(t); applyTheme(t) }
  const pickText = (t: TextSize) => { setTextSize(t); applyTextSize(t) }
  const pickLang = (l: Lang) => { setLangKv(l); void setLang(l) }
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
      <SubHeader title="Me" backHref="#today" backLabel="Back to Today" />
      <ConsentNotice />

      <div className="sh-card sh-row">
        <span className="sh-av sh-av-lg">{photo ? <img src={photo} alt="" /> : (who || '?').charAt(0).toUpperCase()}</span>
        <div className="sh-grow">
          <b>{who || 'You'}</b>
          <div className="sh-sub">This phone · fingerprint {passkey ? 'on' : 'off'}</div>
        </div>
        {member?.personId && <button type="button" className="sh-edit" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog">Edit</button>}
      </div>

      <div className="sh-card sh-list">
        <div><div className="sh-grow"><b>Simple mode</b><div className="sh-sub">Big buttons: I took it, How are you?, Hold for help, Call 911</div></div><Switch label="Simple mode" on={simple} onChange={setSimple} /></div>
      </div>

      <div className="sh-card sh-list">
        {carerOf.filter((id) => id !== member?.personId).map((id) => {
          const p = roster.find((x) => x.id === id)
          return (
            <a key={id} className="sh-navrow" href={`#family/people/${id}`}>
              <Icon name="users" boxed size={20} />
              <span className="sh-grow"><b>{p?.name ?? 'Family member'}</b><span className="sh-sub sh-blk">You are their carer. Open their page.</span></span>
              <Icon name="chev" />
            </a>
          )
        })}
        <a className="sh-navrow" href="#sharing">
          <Icon name="lock" boxed size={20} />
          <span className="sh-grow"><b>Who can see my records</b><span className="sh-sub sh-blk">Pick who sees your records</span></span>
          <Icon name="chev" />
        </a>
        <button type="button" className="sh-navrow" onClick={() => setSosOpen(true)} aria-haspopup="dialog">
          <Icon name="phone" boxed size={20} />
          <span className="sh-grow"><b>Who gets your SOS text</b><span className="sh-sub sh-blk">{names || 'Nobody picked yet'}</span></span>
          <Icon name="chev" />
        </button>
        <a className="sh-navrow" href="#medid">
          <Icon name="cross" boxed size={20} />
          <span className="sh-grow"><b>Medical ID</b><span className="sh-sub sh-blk">Blood type, allergies, medicines, who to call</span></span>
          <Icon name="chev" />
        </a>
        <a className="sh-navrow" href="#notif">
          <Icon name="bell" boxed size={20} />
          <span className="sh-grow"><b>Alerts</b><span className="sh-sub sh-blk">Alert list and history</span></span>
          <Icon name="chev" />
        </a>
        <DigestToggle />
        <PushPermissionRow />
        <a className="sh-navrow" href="#privacy">
          <Icon name="file" boxed size={20} />
          <span className="sh-grow"><b>Privacy</b><span className="sh-sub sh-blk">Agreement, AI, my data</span></span>
          <Icon name="chev" />
        </a>
        <CallRow />
        <AlarmHealthRow />
      </div>

      <div className="sh-card sh-list">
        <div><div className="sh-grow"><b>Quiet hours</b><div className="sh-sub">10 PM to 6 AM. SOS and storm alerts still ring; other family updates are silent</div></div><Switch label="Quiet hours" on={quiet} onChange={setQuiet} /></div>
        <div className="sh-stack">
          <div className="sh-grow"><b>Text size</b><div className="sh-sub">Makes words and buttons bigger</div></div>
          <div className="sh-seg" role="group" aria-label="Text size">
            {TEXT_SIZES.map((t) => <button key={t.id} type="button" aria-pressed={(isTextSize(textSize) ? textSize : 'normal') === t.id} onClick={() => pickText(t.id)}>{t.label}</button>)}
          </div>
        </div>
        <div className="sh-stack">
          <div className="sh-grow"><b>Theme</b></div>
          <div className="sh-seg" role="group" aria-label="Theme">
            {THEMES.map((t) => <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => pickTheme(t.id)}>{t.label}</button>)}
          </div>
        </div>
        <div className="sh-stack">
          <div className="sh-grow"><b>Language</b><div className="sh-sub">Reminders and safety lines on this phone{Capacitor.isNativePlatform() ? '' : '. Reminders are on the Android app.'}</div></div>
          <div className="sh-seg" role="group" aria-label="Language">
            {LANGS.map((l) => <button key={l.id} type="button" aria-pressed={(isLang(lang) ? lang : 'en') === l.id} onClick={() => pickLang(l.id)}>{l.label}</button>)}
          </div>
        </div>
      </div>

      <div className="sh-me-setup">
        <div className="sh-sech"><b>Setup checklist</b></div>
        <SetupCard />
      </div>

      <div className="sh-me-sensors"><SensorSettings /></div>

      <div className="sh-card sh-list">
        {member?.role === 'admin' ? <UpdateRow /> : <VersionRow />}
        {member?.role === 'admin' && (
          <a className="sh-navrow" href="#admin">
            <Icon name="gear" boxed size={20} />
            <span className="sh-grow"><b>Family admin tools</b><span className="sh-sub sh-blk">Admins only</span></span>
            <Icon name="chev" />
          </a>
        )}
        {supabase && (
          <>
            {passkeySupported() && !passkey && (
              <button type="button" className="sh-navrow" disabled={busy} onClick={turnOnPasskey}>
                <Icon name="check" boxed size={20} />
                <span className="sh-grow"><b>Turn on fingerprint or face sign-in</b></span>
                <Icon name="chev" />
              </button>
            )}
            {passkey && <div><Icon name="check" /><div className="sh-grow"><b>Fingerprint or face sign-in is on</b></div></div>}
            <button type="button" className="sh-navrow" onClick={() => { clearLastPerson(); void signOut() }}>
              <Icon name="users" boxed size={20} /><span className="sh-grow"><b>Not you? Switch person</b></span><Icon name="chev" />
            </button>
            <button type="button" className="sh-navrow" onClick={() => { forgetPhone(); void signOut() }}>
              <Icon name="shield" boxed size={20} /><span className="sh-grow"><b>Forget this phone</b></span><Icon name="chev" />
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
