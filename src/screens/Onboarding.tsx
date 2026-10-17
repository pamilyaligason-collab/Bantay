import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db'
import { DAMPAS } from '../features/location/geo'
import { resolveLocation, saveHome } from '../features/location/useLocation'
import { enableAlerts, ensureSubscribed, isIosNeedsInstall, markAsked } from '../features/notify/alerts'

type Step = 'ios' | 'alerts' | 'where' | 'home'

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

function Card({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="bt">
      <div className="topbar" />
      <main className="scroll">
        <div className="hdr">
          <h1>{title}</h1>
          <span>{lead}</span>
        </div>
        {children}
      </main>
    </div>
  )
}

const flagged = () => { try { return localStorage.getItem('bantay.onboarded') === '1' } catch { return false } }

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>(() => (isIosNeedsInstall(navigator.userAgent, standalone(), navigator.maxTouchPoints) ? 'ios' : 'alerts'))
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [home, setHome] = useState({ name: DAMPAS.name, lat: String(DAMPAS.lat), lon: String(DAMPAS.lon) })

  const finish = async () => {
    await db.kv.put({ key: 'onboarded', value: true })
    try { localStorage.setItem('bantay.onboarded', '1') } catch { /* private mode */ }
    onDone()
  }

  if (step === 'ios') {
    return (
      <Card title="Add Bantay to your Home Screen" lead="iPhone only allows alerts for apps on the Home Screen.">
        <ol className="grp" style={{ margin: 0, padding: '8px 16px 8px 36px' }}>
          <li style={{ padding: '8px 0' }}>Tap the Share button, then Add to Home Screen.</li>
          <li style={{ padding: '8px 0' }}>Tap Add.</li>
          <li style={{ padding: '8px 0' }}>Open Bantay from your Home Screen to keep going.</li>
        </ol>
        <button className="btn2" onClick={async () => { await markAsked(); setDenied(true); setStep('where') }}>Continue without alerts</button>
      </Card>
    )
  }

  if (step === 'alerts') {
    return (
      <Card title="Turn on alerts" lead="Your phone asks once. Storm and medicine alerts then just work.">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setDenied((await enableAlerts()) !== 'granted')
            setBusy(false)
            setStep('where')
          }}
        >
          Turn on alerts
        </button>
        <p className="sub" style={{ margin: 0, textAlign: 'center' }}>Change this any time in your phone settings.</p>
      </Card>
    )
  }

  if (step === 'where') {
    return (
      <Card title="Where are you?" lead="Bantay uses your location to show the weather and help that is closest to you.">
        {denied && (
          <div className="grp" style={{ padding: 16 }}>
            <strong>Alerts are off on this phone</strong>
            <span className="sub"> You won’t hear about storms or missed medicines until you open Bantay. We’ll remind you in a few days.</span>
          </div>
        )}
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const l = await resolveLocation(true)
            setBusy(false)
            if (l.source === 'gps') await finish()
            else setStep('home')
          }}
        >
          Use my location
        </button>
        <button className="btn2" onClick={() => setStep('home')}>Choose my barangay instead</button>
        <p className="sub" style={{ margin: 0, textAlign: 'center' }}>Your location stays on this phone unless you share it with family.</p>
      </Card>
    )
  }

  const lat = Number(home.lat), lon = Number(home.lon)
  const valid = home.name.trim() !== '' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && home.lat !== '' && home.lon !== ''
  const field = (k: 'name' | 'lat' | 'lon', label: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 16px' }}>
      <span className="sub">{label}</span>
      <input
        value={home[k]}
        inputMode={k === 'name' ? 'text' : 'decimal'}
        onChange={(e) => setHome({ ...home, [k]: e.target.value })}
        style={{ font: 'inherit', minHeight: 44, border: '1px solid var(--sep)', borderRadius: 10, padding: '0 12px', background: 'var(--cell)', color: 'var(--ink)', minWidth: 0 }}
      />
    </label>
  )
  return (
    <Card title="Your home barangay" lead="We start with Dampas, Tagbilaran. Change it if you live elsewhere.">
      <div className="grp">
        {field('name', 'Barangay')}
        {field('lat', 'Latitude')}
        {field('lon', 'Longitude')}
      </div>
      <button
        className="btn"
        disabled={!valid}
        onClick={async () => {
          await saveHome({ name: home.name.trim(), lat, lon })
          await finish()
        }}
      >
        Save and start
      </button>
    </Card>
  )
}

/** Shows onboarding on first launch. A deep link to a tab (notification tap, shared link) skips it. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'show' | 'done'>('loading')
  useEffect(() => {
    ensureSubscribed()
    db.kv.get('onboarded').then((r) => setState(r?.value || flagged() || (location.hash !== '' && location.hash !== '#welcome') ? 'done' : 'show'))
  }, [])
  if (state === 'loading') return null
  return state === 'show' ? <Onboarding onDone={() => setState('done')} /> : <>{children}</>
}
