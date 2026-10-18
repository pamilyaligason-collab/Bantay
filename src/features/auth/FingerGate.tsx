import { useEffect, useRef, useState } from 'react'
import { MASCOT_ALT, MASCOT_SRC } from '../../assets/mascot'
import { openFingerprintEnrol, promptFingerprint, unlockMode, type UnlockMode } from './biometric'
import { setPasskeyFlag } from './family'

/** APK only. A signed-in phone asks for the fingerprint before showing the app (D-32, A-15/A-16).
 *  The session never leaves WebView storage; "Use PIN" signs out so the remembered person types their PIN again. */
export function LockScreen({ name, onUnlocked, onUsePin, onNotYou }: { name: string; onUnlocked: () => void; onUsePin: () => void; onNotYou: () => void }) {
  const [tried, setTried] = useState(false)
  const alive = useRef(true)
  const ask = async () => {
    setTried(false)
    const ok = await promptFingerprint('Open Bantay')
    if (!alive.current) return
    if (ok === true) onUnlocked(); else if (ok === 'use_pin') onUsePin(); else setTried(true)
  }
  useEffect(() => { alive.current = true; void ask(); return () => { alive.current = false } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="scroll si-ret">
      <img className="avatar mascot" src={MASCOT_SRC} alt={MASCOT_ALT} width={150} height={150} />
      <h1 className="h-display">Welcome back{name ? `, ${name}` : ''}</h1>
      <p className="si-hint" role="status">{tried ? 'That did not work. Touch the sensor again, or use your PIN.' : 'Touch the sensor to open Bantay.'}</p>
      <button className="btn" onClick={() => void ask()}>Use fingerprint</button>
      <button className="si-link" onClick={onUsePin}>Use PIN</button>
      <button className="si-link" onClick={onNotYou}>Not you?</button>
      <a className="si-link si-911" href="tel:911">Emergency call 911</a>
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
