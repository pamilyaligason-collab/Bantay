import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { db } from '../../db'
import { isIosNeedsInstall } from '../notify/alerts'
import { resolveLocation, saveHome } from '../location/useLocation'
import { hdb } from '../records/store'
import { isNativeAndroid, requestBatteryExemption } from '../safety/settingsOpener'
import { currentPersonId } from '../sensors/health'
import SensorSettings from '../sensors/SensorSettings'
import { callPermission, requestCallPermission, type CallPermission } from '../sos/call'
import SosContactsPicker from '../sos/SosContactsPicker'
import { saveAbout, savePhoto } from '../sync/profile'
import ChipField from './ChipField'
import WarningsStep from './WarningsStep'
import { ALLERGIES, BLOOD_TYPES, CONDITIONS, JOIN, splitItems } from './lists'
import MedicineEditor, { useSelfId } from './MedicineEditor'
import { useSelfPersonId } from './useProfile'
import { ABOUT_FIELDS, TITLES, UNKNOWN, currentPlatform, notifyDone, notifyState, onResume, probe, put, remaining, scheduleTest, turnOnReminders, type About, type NotifyState, type StepId } from './steps'
import '../safety/safety.css'
import './setup.css'
import { Icon } from '../shell/Icon'

const HOME_NAMES = ['Home', 'Dampas', 'Conel', 'Work', 'School', "Parents' house"]
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const kvGet = async <T,>(k: string): Promise<T | undefined> => (await db.kv.get(k).catch(() => undefined))?.value as T | undefined

const useOnResume = (fn: () => void) => useEffect(() => onResume(fn), [fn])

function Row({ label, on, children }: { label: string; on: boolean; children?: ReactNode }) {
  return (
    <div className="wz-row">
      <div className="grow"><strong>{label}</strong><span className="sub">{on ? 'On' : 'Not on yet'}</span></div>
      {!on && children}
    </div>
  )
}

/** Square 512px jpeg, cropped from the middle. */
const PHOTO_PX = 512

function Photo() {
  const [src, setSrc] = useState<string>()
  const pid = useSelfPersonId()
  useEffect(() => { void kvGet<string>('profile.photo').then(setSrc) }, [])
  const pick = (f?: File) => {
    if (!f) return
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const side = Math.max(1, Math.min(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = c.height = Math.min(PHOTO_PX, side)
      c.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height)
      const d = c.toDataURL('image/jpeg', 0.85)
      URL.revokeObjectURL(url)
      setSrc(d)
      void savePhoto(pid, d)
    }
    img.src = url
  }
  return (
    <div className="wz-body">
      {src ? <img className="wz-photo" src={src} alt="Your photo" /> : <div className="wz-photo" aria-hidden />}
      <label className="btn2 wz-file">
        {src ? 'Change photo' : 'Add a photo'}
        <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
    </div>
  )
}

const ABOUT_LABEL: Record<(typeof ABOUT_FIELDS)[number], string> = { bloodType: 'Blood type', allergies: 'Allergies', conditions: 'Health conditions' }
const ABOUT_OPTIONS: Record<(typeof ABOUT_FIELDS)[number], string[]> = { bloodType: BLOOD_TYPES, allergies: ALLERGIES, conditions: CONDITIONS }
const NOT_SURE = { bloodType: "Don't know", allergies: 'Not sure', conditions: 'Not sure' } as const
const EXCLUSIVE = { bloodType: [], allergies: ['None'], conditions: ['None'] } as const

function About() {
  const [v, setV] = useState<About>({})
  const pid = useSelfPersonId()
  useEffect(() => { void kvGet<About>('profile.about').then((a) => a && setV(a)) }, [])
  const set = (k: keyof About, items: string[]) => {
    const n = { ...v, [k]: items.includes(NOT_SURE[k]) ? UNKNOWN : items.join(JOIN) }
    setV(n); void put('profile.about', n); if (pid) void saveAbout(pid, n)
  }
  return (
    <div className="grp wz-body">
      {ABOUT_FIELDS.map((k) => (
        <ChipField key={k} label={ABOUT_LABEL[k]} multi={k !== 'bloodType'} allowOther={k !== 'bloodType'} options={[...ABOUT_OPTIONS[k], NOT_SURE[k]]} exclusive={[...EXCLUSIVE[k], NOT_SURE[k]]}
          value={v[k] === UNKNOWN ? [NOT_SURE[k]] : splitItems(v[k])} onChange={(items) => set(k, items)} />
      ))}
    </div>
  )
}

function Medicines() {
  const [line, setLine] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    void (async () => {
      const id = await currentPersonId().catch(() => null)
      const rows = id ? (await hdb.consults.where('personId').equals(id).toArray()).filter((c) => c.medicines?.length) : []
      rows.sort((a, b) => b.takenAt.localeCompare(a.takenAt))
      setLine(rows[0] ? `From your prescription of ${new Date(rows[0].takenAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}: ${rows[0].medicines!.join(', ')}.` : null)
    })()
  }, [])
  const pid = useSelfId()
  return (
    <div className="wz-body">
      {line && <p className="sf-note" style={{ background: 'var(--cell)' }}>{line}</p>}
      <MedicineEditor personId={pid} />
    </div>
  )
}

function Notifications() {
  const [n, setN] = useState<NotifyState>({ display: false, exact: false, battery: false })
  const [msg, setMsg] = useState('')
  const native = isNativeAndroid()
  const refresh = useCallback(() => { void notifyState().then(setN) }, [])
  useEffect(refresh, [refresh])
  useOnResume(refresh)
  const ios = isIosNeedsInstall(navigator.userAgent, standalone(), navigator.maxTouchPoints)
  const turnOn = async () => { await turnOnReminders(); refresh() }
  const test = async () => {
    setMsg('')
    try { await scheduleTest(); setMsg('A test reminder will show in a few seconds.') } catch { setMsg('The test reminder could not be set. Check the switches above.') }
  }
  return (
    <div className="wz-body">
      {ios && <p className="sf-note">Add Bantay to your Home Screen first: tap Share, then Add to Home Screen, then open Bantay from there.</p>}
      <div className="grp">
        <Row label="Allow notifications" on={n.display} />
        {native && <Row label="Allow alarms and reminders" on={n.exact} />}
        {native && <Row label="Don't let Android pause Bantay" on={n.battery}><button type="button" className="btn2 wz-sm" onClick={() => void requestBatteryExemption().then(refresh)}>Allow</button></Row>}
      </div>
      {!notifyDone(n) && <button type="button" className="btn" onClick={turnOn}>Turn on</button>}
      {notifyDone(n) && <p className="sf-note" role="status" style={{ background: 'var(--cell)' }}>Reminders and alerts are on.</p>}
      <button type="button" className="btn2" onClick={test} disabled={!n.display}>Send a test reminder</button>
      {msg && <p className="sub" role="status" style={{ margin: 0 }}>{msg}</p>}
      {!native && <p className="sub" style={{ margin: 0 }}>iPhone: reminders come from the family server, keep notifications on.</p>}
    </div>
  )
}

function Location() {
  const [state, setState] = useState<'ask' | 'home' | 'done'>('ask')
  const [home, setHome] = useState({ name: '', lat: '', lon: '' })
  const lat = Number(home.lat), lon = Number(home.lon)
  const valid = home.name.trim() !== '' && home.lat !== '' && home.lon !== '' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  if (state === 'done') return <p className="sf-note" role="status" style={{ background: 'var(--cell)' }}>Location saved.</p>
  if (state === 'home') {
    const field = (k: 'name' | 'lat' | 'lon', label: string) => (
      <label className="wz-field" key={k}><span className="sub">{label}</span><input value={home[k]} inputMode={k === 'name' ? 'text' : 'decimal'} list={k === 'name' ? 'wz-home-names' : undefined} onChange={(e) => setHome({ ...home, [k]: e.target.value })} /></label>
    )
    return (
      <div className="wz-body">
        <datalist id="wz-home-names">{HOME_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
        <div className="grp">{field('name', 'Barangay')}{field('lat', 'Latitude')}{field('lon', 'Longitude')}</div>
        <button type="button" className="btn" disabled={!valid} onClick={async () => { await saveHome({ name: home.name.trim(), lat, lon }); setState('done') }}>Save my barangay</button>
      </div>
    )
  }
  return (
    <div className="wz-body">
      <p className="sub" style={{ margin: 0 }}>Updates when you open Bantay. Your location stays on this phone unless you share it with family.</p>
      <button type="button" className="btn" onClick={async () => { const l = await resolveLocation(true); setState(l.source === 'gps' ? 'done' : 'home') }}>Use my location</button>
      <button type="button" className="btn2" onClick={() => setState('home')}>Choose my barangay instead</button>
    </div>
  )
}

/** The one place setup asks for CALL_PHONE (never the SOS flow itself). Hidden on the web, an old app or when it is already allowed. */
function CallAsk() {
  const [state, setState] = useState<CallPermission>('unavailable')
  const refresh = useCallback(() => { void callPermission().then(setState) }, [])
  useEffect(refresh, [refresh])
  useOnResume(refresh)
  if (state !== 'denied') return null
  return (
    <div className="grp wz-body" style={{ padding: 16 }}>
      <b>Let Hold for help call for you</b>
      <span className="sub">Android asks once. Without it, Hold for help opens the phone app with the number ready and you press call.</span>
      <button type="button" className="btn2" onClick={() => void requestCallPermission().then(setState)}>Allow calling</button>
    </div>
  )
}

const Sos = () => <div className="wz-body"><SosContactsPicker /><CallAsk /></div>

const BODY: Record<StepId, () => ReactNode> = {
  photo: () => <Photo />,
  about: () => <About />,
  medicines: () => <Medicines />,
  notifications: () => <Notifications />,
  location: () => <Location />,
  health: () => <SensorSettings />,
  warnings: () => <WarningsStep />,
  sos: () => <Sos />,
  sharing: () => (
    <div className="wz-body">
      <p className="sub" style={{ margin: 0 }}>Sharing is off until you turn it on. Admins never see your health numbers.</p>
    </div>
  )
}

/** One step per screen. Satisfied steps are skipped (the probe decides); skipped ones stay on the Today checklist. */
export default function Wizard({ start, onDone }: { start?: StepId; onDone: () => void }) {
  const [queue, setQueue] = useState<StepId[] | null>(null)
  const [i, setI] = useState(0)
  useEffect(() => {
    let live = true
    void probe().then((p) => {
      if (!live) return
      const q = remaining(p, currentPlatform())
      if (q.length === 0) return onDone()
      setQueue(q)
      const at = start ? q.indexOf(start) : 0
      if (at < 0) return onDone() // the tapped step got satisfied meanwhile
      setI(at)
    })
    return () => { live = false }
  }, [start]) // eslint-disable-line react-hooks/exhaustive-deps -- probe once per open; onDone may change identity
  if (!queue) return null
  const step = queue[i]!
  const last = i === queue.length - 1
  const next = () => (last ? onDone() : setI(i + 1))
  const cont = async () => {
    if (step === 'medicines') await put('setup.medicines', true)
    if (step === 'warnings' && !isNativeAndroid()) await put('setup.warnings', true) // Android asks the one question instead
    if (step === 'sharing') await put('setup.sharing', true)
    next()
  }
  return (
    <div className="bt">
      <div className="topbar wz-top">
        <button type="button" className="wz-back" aria-label="Back" disabled={i === 0} onClick={() => setI(i - 1)}><Icon name="back" /></button>
        <span className="sub grow" style={{ textAlign: 'center' }}>Step {i + 1} of {queue.length}</span>
        <button type="button" className="wz-skip" onClick={next}>Skip</button>
      </div>
      <main className="scroll">
        <div className="wz-dots" role="group" aria-label="Setup steps">
          {queue.map((s, k) => (
            <button key={s} type="button" className="wz-dot" aria-label={`Step ${k + 1}: ${TITLES[s]}`} aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)} />
          ))}
        </div>
        <div className="hdr"><h1>{TITLES[step]}</h1></div>
        {BODY[step]()}
        <button type="button" className="btn" onClick={cont}>{last ? 'Finish' : 'Continue'}</button>
      </main>
    </div>
  )
}
