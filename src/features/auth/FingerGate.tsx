import { useEffect, useRef, useState } from 'react'
import { openFingerprintEnrol, promptFingerprint, unlockMode, type UnlockMode } from './biometric'
import { setPasskeyFlag } from './family'
import { Icon } from '../shell/Icon'
import { firstName } from '../shell/names'
import { LockMedicalId } from '../medid/LockMedicalId'
import { useLockGlance } from '../privacy/lockWeather'
import '../privacy/privacy.css'
import './lock.css'

const hello = (h: number) => (h < 12 ? 'umaga' : h < 18 ? 'hapon' : 'gabi')
const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '')
const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

/** APK only. A signed-in phone asks for the fingerprint before showing the app (D-32, A-15/A-16; mockup start-finger).
 *  The session never leaves WebView storage; "Use PIN" signs out so the remembered person types their PIN again.
 *  Before unlocking it shows only weather (cached, no private data), Call 911 (the dial screen) and the lock Medical ID (allergies, conditions, who to call). */
export function LockScreen({ name, personId, onUnlocked, onUsePin, onNotYou }: { name: string; personId?: string; onUnlocked: () => void; onUsePin: () => void; onNotYou: () => void }) {
  const shown = firstName(name) // the family list may hold 'rey'; same rule as the Today greeting
  const [tried, setTried] = useState(false)
  const [medid, setMedid] = useState(false)
  const glance = useLockGlance()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t) }, [])
  const alive = useRef(true)
  const ask = async () => {
    setTried(false)
    const ok = await promptFingerprint('Open Bantay')
    if (!alive.current) return
    if (ok === true) onUnlocked(); else if (ok === 'use_pin') onUsePin(); else setTried(true)
  }
  useEffect(() => { alive.current = true; void ask(); return () => { alive.current = false } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (medid) return <LockMedicalId personId={personId} onClose={() => setMedid(false)} />
  const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <main className={`lk2 si-ret${still ? ' lk2-still' : ''}`}>
      <svg className="lk2-mt" viewBox="0 0 390 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <polygon points="0,126 60 56 110 86 170 6 230 76 290 26 390 96 390 520 0,520" fill="var(--lk-r1)" opacity=".7" />
        <polygon points="0,196 50 156 120 176 200 106 260 166 330 126 390 176 390 520 0,520" fill="var(--lk-r2)" opacity=".85" />
        <polygon points="0,276 80 226 150 256 230 196 300 246 390 216 390 520 0,520" fill="var(--lk-r3)" />
        <polygon points="0,376 90 336 180 356 270 316 390 346 390 520 0,520" fill="var(--lk-r4)" />
      </svg>
      <div className="lk2-fog" style={{ top: '52%' }} />
      <div className="lk2-fog" data-b="" style={{ top: '66%' }} />
      <div className="lk2-time">
        <div className="lk2-date">{today()}</div>
        <p className="lk2-clock" aria-label="Time now">{clock(now)}</p>
        <h1 className="lk2-hi">Magandang {hello(now.getHours())}{shown ? `, ${shown}` : ''}</h1>
      </div>
      {glance && (
        <div className="lk2-wx">
          <Icon name={glance.kind} size={28} />
          <div><b>{glance.temp}° {glance.words}</b>{glance.place && <div>{glance.place}</div>}{glance.rain && <div>{glance.rain}</div>}</div>
        </div>
      )}
      <div className="lk2-mid">
        <div className="lk2-fpw">
          {!still && <span className="lk2-halo" aria-hidden="true" />}
          <button type="button" className="lk2-fp" aria-label="Unlock with fingerprint" onClick={() => void ask()}><Icon name="fp" size={40} /></button>
        </div>
        <div className="lk2-say">
          <b>Touch the fingerprint sensor</b>
          {tried ? <span role="alert">That did not work. Touch the sensor again, or use your PIN.</span> : <span>to open Bantay</span>}
        </div>
        <button type="button" className="lk2-lnk" onClick={onUsePin}>Use PIN instead</button>
        <button type="button" className="lk2-lnk" onClick={onNotYou}>{shown ? `Not ${shown}?` : 'Not you?'}</button>
      </div>
      <div className="lk2-sos">
        <a className="lk2-lnk lk2-red" href="tel:911">Call 911</a>
        <button type="button" className="lk2-lnk lk2-out" onClick={() => setMedid(true)}>Medical ID</button>
      </div>
    </main>
  )
}

const askedKey = (personId: string) => `bantay.fp.asked.${personId}`
export const fingerAsked = (personId: string) => { try { return localStorage.getItem(askedKey(personId)) === '1' } catch { return false } }
const markAsked = (personId: string) => { try { localStorage.setItem(askedKey(personId), '1') } catch { /* private mode */ } }

/** "Use your fingerprint next time?" once, right after the first sign-in on this phone. Skips itself when the phone has no sensor. */
export function FingerOffer({ personId, onDone }: { personId: string; onDone: () => void }) {
  const [mode, setMode] = useState<UnlockMode | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    void unlockMode({ passkeyFlag: false }).then((m) => { if (m === 'pin' || m === 'passkey') { markAsked(personId); onDone() } else setMode(m) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => { markAsked(personId); onDone() }
  const turnOn = async () => {
    setBusy(true)
    const ok = await promptFingerprint('Turn on fingerprint for Bantay')
    setBusy(false)
    if (ok === true) { setPasskeyFlag(personId); finish() } else setNote('That did not work. Try again, or use your PIN each time.')
  }
  if (!mode) return null
  const first = mode === 'enrol-first'
  return (
    <main className="scroll si-ret">
      <h1 className="h-display">Use your fingerprint next time?</h1>
      <p className="si-hint">Then opening Bantay is one touch. Your PIN still works as a backup.</p>
      {first
        ? <>
            <p className="si-hint" role="status">Set up a fingerprint in Settings first.</p>
            <button className="btn" onClick={() => void openFingerprintEnrol()}>Open Settings</button>
            <button className="btn2" onClick={finish}>Use PIN each time</button>
          </>
        : <>
            <button className="btn" disabled={busy} onClick={() => void turnOn()}>Turn on fingerprint</button>
            <button className="btn2" onClick={finish}>Not now</button>
          </>}
      {note && <p className="si-hint" role="status">{note}</p>}
    </main>
  )
}
