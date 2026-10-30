import { useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import PinPad from './PinPad'
import './onboarding.css'

/** Dots only, no words (W-49, O-5): the one progress cue of the five onboarding screens. */
export const OnbDots = ({ n, of = 5 }: { n: number; of?: number }) => (
  <div className="ob-dots" role="img" aria-label={`Step ${n} of ${of}`}>{Array.from({ length: of }, (_, i) => <i key={i} className={i + 1 === n ? 'on' : ''} />)}</div>
)

/** Two-entry PIN screen: onboarding screen 2 of 5 (dots only) at setup and "Choose a new PIN" after a reset. The second entry reuses the pad (title says "Type it again").
 *  A mismatch shows a red line, clears the dots and starts over. The fingerprint switch is on by default and hidden on a phone without a sensor.
 *  onSubmit gets the PIN and the switch value; it returns an error line or null. */
export default function SetPin({ name, title, step, canFinger, busy, onSubmit, onBack }: {
  name?: string; title?: string; step?: { n: number; of: number }; canFinger: boolean; busy?: boolean
  onSubmit: (pin: string, finger: boolean) => Promise<string | null> | string | null; onBack?: () => void
}) {
  const first = useRef<string | null>(null)
  const [again, setAgain] = useState(false)
  const [finger, setFinger] = useState(true)
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(0)
  const [wait, setWait] = useState(false)
  const done = async (pin: string) => {
    if (first.current === null) { first.current = pin; setAgain(true); setErr(''); return }
    if (pin !== first.current) { first.current = null; setAgain(false); setErr('Those two did not match. Start again.'); setShake((n) => n + 1); return }
    setWait(true)
    const e = await onSubmit(pin, canFinger && finger)
    setWait(false)
    if (e) { first.current = null; setAgain(false); setErr(e); setShake((n) => n + 1) }
  }
  return (
    <div className="si-set">
      {step && <OnbDots n={step.n} of={step.of} />}
      <div className="si-c">
        {name && !step && <span className="avatar big" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
        <h1 className="pname" tabIndex={-1}>{again ? 'Type it again' : title ?? 'Choose a 6-digit PIN'}</h1>
        <p className="si-hint">{again ? 'The same 6 numbers, one more time.' : 'Numbers you will remember.'}</p>
      </div>
      <PinPad busy={busy || wait} shake={shake} onDone={(p) => void done(p)} />
      {err && <p className="si-bad" role="alert">{err}</p>}
      {canFinger && (
        <div className="grp si-opt si-switchrow">
          <span className="si-tile" aria-hidden="true"><Icon name="fp" size={22} /></span>
          <div className="grow"><b>Open with fingerprint</b></div>
          <button type="button" role="switch" className="sh-switch" aria-label="Open with fingerprint" aria-checked={finger} onClick={() => setFinger(!finger)} />
        </div>
      )}
      {onBack && <button type="button" className="btn2" onClick={onBack}>Back</button>}
    </div>
  )
}
