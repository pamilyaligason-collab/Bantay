import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { enableAlerts, isIosNeedsInstall } from '../notify/alerts'
import { resolveLocation, saveHome } from '../location/useLocation'
import { hdb } from '../records/store'
import PhoneWarnings from '../safety/PhoneWarnings'
import { isNativeAndroid, openBattery } from '../safety/settingsOpener'
import { currentPersonId } from '../sensors/health'
import SensorSettings from '../sensors/SensorSettings'
import { ABOUT_FIELDS, TITLES, UNKNOWN, currentPlatform, notifyState, probe, put, remaining, scheduleTest, type About, type NotifyState, type StepId } from './steps'
import '../safety/safety.css'
import './setup.css'

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const kvGet = async <T,>(k: string): Promise<T | undefined> => (await db.kv.get(k).catch(() => undefined))?.value as T | undefined

/** Re-runs `fn` when the app comes back to the front, e.g. after the member flipped a switch in Android Settings. */
function useOnResume(fn: () => void) {
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') fn() }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [fn])
}

function Row({ label, on, children }: { label: string; on: boolean; children?: ReactNode }) {
  return (
    <div className="wz-row">
      <div className="grow"><strong>{label}</strong><span className="sub">{on ? 'On' : 'Not on yet'}</span></div>
      {!on && children}
    </div>
  )
}

function Photo() {
  const [src, setSrc] = useState<string>()
  useEffect(() => { void kvGet<string>('profile.photo').then(setSrc) }, [])
  const pick = (f?: File) => {
    if (!f) return
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const k = 256 / Math.max(img.width, img.height, 1)
      c.width = Math.round(img.width * Math.min(k, 1)); c.height = Math.round(img.height * Math.min(k, 1))
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
      const d = c.toDataURL('image/jpeg', 0.8)
      URL.revokeObjectURL(url)
      setSrc(d)
      void put('profile.photo', d)
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

function About() {
  const [v, setV] = useState<About>({})
  useEffect(() => { void kvGet<About>('profile.about').then((a) => a && setV(a)) }, [])
  const set = (k: keyof About, val: string) => { const n = { ...v, [k]: val }; setV(n); void put('profile.about', n) }
  return (
    <div className="grp wz-body">
      {ABOUT_FIELDS.map((k) => (
        <div key={k} className="wz-field">
          <label>
            <span className="sub">{ABOUT_LABEL[k]}</span>
            <input value={v[k] === UNKNOWN ? '' : v[k] ?? ''} placeholder={v[k] === UNKNOWN ? 'Not sure' : ''} onChange={(e) => set(k, e.target.value.trim() === '' ? '' : e.target.value)} />
          </label>
          <button type="button" className="btn2 wz-sm" aria-pressed={v[k] === UNKNOWN} onClick={() => set(k, UNKNOWN)}>Not sure</button>
        </div>
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
  if (line === undefined) return null
  return <p className="sf-note" style={{ background: 'var(--cell)' }}>{line ?? 'No medicines yet. Ask an admin to add them.'}</p>
}

function Notifications() {
  const [n, setN] = useState<NotifyState>({ display: false, exact: false, battery: false })
  const [msg, setMsg] = useState('')
  const native = isNativeAndroid()
  const refresh = useCallback(() => { void notifyState().then(setN) }, [])
  useEffect(refresh, [refresh])
  useOnResume(refresh)
  const ios = isIosNeedsInstall(navigator.userAgent, standalone(), navigator.maxTouchPoints)
  const allow = async () => {
    if (native) await LocalNotifications.requestPermissions().catch(() => undefined)
    else await enableAlerts()
    refresh()
  }
  const test = async () => {
    setMsg('')
    try { await scheduleTest(); setMsg('A test reminder will show in a few seconds.') } catch { setMsg('The test reminder could not be set. Check the switches above.') }
  }
  return (
    <div className="wz-body">
      {ios && <p className="sf-note">Add Bantay to your Home Screen first: tap Share, then Add to Home Screen, then open Bantay from there.</p>}
      <div className="grp">
        <Row label="Allow notifications" on={n.display}><button type="button" className="btn2 wz-sm" onClick={allow}>Allow</button></Row>
        {native && <Row label="Allow alarms and reminders" on={n.exact}><button type="button" className="btn2 wz-sm" onClick={() => void LocalNotifications.changeExactNotificationSetting().then(refresh, refresh)}>Open Settings</button></Row>}
        {native && <Row label="Don't let Android pause Bantay" on={n.battery}><button type="button" className="btn2 wz-sm" onClick={() => void openBattery()}>Open Settings</button></Row>}
      </div>
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
      <label className="wz-field" key={k}><span className="sub">{label}</span><input value={home[k]} inputMode={k === 'name' ? 'text' : 'decimal'} onChange={(e) => setHome({ ...home, [k]: e.target.value })} /></label>
    )
    return (
      <div className="wz-body">
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

function Sos() {
  const [c, setC] = useState(['', ''])
  useEffect(() => { void kvGet<string[]>('sos.contacts').then((a) => a && setC([a[0] ?? '', a[1] ?? ''])) }, [])
  const set = (i: number, val: string) => { const n = [...c]; n[i] = val; setC(n); void put('sos.contacts', n.filter((x) => x.trim() !== '')) }
  return (
    <div className="wz-body">
      <p className="sub" style={{ margin: 0 }}>If you press SOS, Bantay opens a text to these two people. Add both.</p>
      <div className="grp">
        {c.map((v, i) => (
          <label className="wz-field" key={i}><span className="sub">{`Contact ${i + 1} phone number`}</span><input type="tel" inputMode="tel" value={v} onChange={(e) => set(i, e.target.value)} /></label>
        ))}
      </div>
    </div>
  )
}

const BODY: Record<StepId, () => ReactNode> = {
  photo: () => <Photo />,
  about: () => <About />,
  medicines: () => <Medicines />,
  notifications: () => <Notifications />,
  location: () => <Location />,
  health: () => <SensorSettings />,
  warnings: () => <PhoneWarnings level={2} />,
  sos: () => <Sos />,
  sharing: () => (
    <div className="wz-body">
      <p className="sub" style={{ margin: 0 }}>Everything you share with family is off until you turn it on in Me. Your admin can see which screens you use, never your health values.</p>
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
      setI(Math.max(0, start ? q.indexOf(start) : 0))
    })
    return () => { live = false }
  }, [start]) // eslint-disable-line react-hooks/exhaustive-deps -- probe once per open; onDone may change identity
  if (!queue) return null
  const step = queue[i]!
  const last = i === queue.length - 1
  const next = () => (last ? onDone() : setI(i + 1))
  const cont = async () => {
    if (step === 'medicines') await put('setup.medicines', true)
    if (step === 'sharing') await put('share.reviewed', true)
    next()
  }
  return (
    <div className="bt">
      <div className="topbar wz-top">
        <button type="button" className="wz-back" aria-label="Back" disabled={i === 0} onClick={() => setI(i - 1)}>←</button>
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
