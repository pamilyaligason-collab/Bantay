import { useEffect, useRef, useState } from 'react'
import { JackArt } from '../look/JackArt'
import { openFingerprintEnrol, promptFingerprint, unlockMode, type UnlockMode } from './biometric'
import { setPasskeyFlag } from './family'
import { Icon } from '../shell/Icon'
import { LockMedicalId } from '../medid/LockMedicalId'
import { useLockGlance } from '../privacy/lockWeather'
import '../privacy/privacy.css'

const hello = (h: number) => (h < 12 ? 'umaga' : h < 18 ? 'hapon' : 'gabi')
const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

/** APK only. A signed-in phone asks for the fingerprint before showing the app (D-32, A-15/A-16; mockup start-finger).
 *  The session never leaves WebView storage; "Use PIN" signs out so the remembered person types their PIN again.
 *  Before unlocking it shows only weather (cached, no private data), Call 911 (the dial screen) and the lock Medical ID (allergies, conditions, who to call). */
export function LockScreen({ name, personId, onUnlocked, onUsePin, onNotYou }: { name: string; personId?: string; onUnlocked: () => void; onUsePin: () => void; onNotYou: () => void }) {
  const [tried, setTried] = useState(false)
  const [medid, setMedid] = useState(false)
  const glance = useLockGlance()
  const alive = useRef(true)
  const ask = async () => {
    setTried(false)
    const ok = await promptFingerprint('Open Bantay')
    if (!alive.current) return
    if (ok === true) onUnlocked(); else if (ok === 'use_pin') onUsePin(); else setTried(true)
  }
  useEffect(() => { alive.current = true; void ask(); return () => { alive.current = false } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (medid) return <LockMedicalId personId={personId} onClose={() => setMedid(false)} />
  return (
    <main className="lk si-ret">
      <div className="lk-hello">
        <JackArt name="head" size={56} />
        <div><div className="lk-eyebrow">{today()}</div><h1>Magandang {hello(new Date().getHours())}{name ? `, ${name}` : ''}</h1></div>
      </div>
      {glance && (
        <div className="lk-wx">
          <Icon name={glance.kind} size={24} />
          <div><b>{glance.temp}° {glance.words}</b>{glance.place && <div className="lk-sub">{glance.place}</div>}{glance.rain && <div className="lk-sub">{glance.rain}</div>}</div>
        </div>
      )}
      <div className="lk-fpwrap">
        <i /><i />
        <button type="button" className="lk-fp" aria-label="Use fingerprint" onClick={() => void ask()}><Icon name="fp" size={92} stroke={1.4} /><span className="lk-scan" /></button>
      </div>
      <div className="lk-say">
        <b>Touch the fingerprint sensor</b>
        {tried ? <span role="status">That did not work. Touch the sensor again, or use your PIN.</span> : <span>to open Bantay</span>}
      </div>
      <div className="lk-two">
        <button type="button" className="lk-btn" onClick={onUsePin}>Use PIN</button>
        <button type="button" className="lk-btn" onClick={onNotYou}>{name ? `Not ${name}?` : 'Not you?'}</button>
      </div>
      <div className="lk-sos">
        <a className="lk-btn lk-red" href="tel:911">Call 911</a>
        <button type="button" className="lk-btn lk-out" onClick={() => setMedid(true)}>Medical ID</button>
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
