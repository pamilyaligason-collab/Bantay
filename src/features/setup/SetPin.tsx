import { useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import PinPad from './PinPad'

/** Two-entry PIN screen: `start-pin` at setup and "Choose a new PIN" after a reset. The second entry reuses the pad (title says "Type it again").
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
      {step && (
        <>
          <span className="si-eyebrow">Step {step.n} of {step.of} · then Today</span>
          <div className="si-steps" aria-hidden="true">{Array.from({ length: step.of }, (_, i) => <i key={i} className={i < step.n ? 'on' : ''} />)}</div>
        </>
      )}
      <div className="si-c">
        {name && <span className="avatar big" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
        <h1 className="pname" tabIndex={-1}>{again ? 'Type it again' : title ?? (name ? `Hi ${name}, choose a 6-digit PIN` : 'Choose a 6-digit PIN')}</h1>
        <p className="si-hint">{again ? 'The same 6 numbers, one more time.' : 'You type it twice. Pick numbers you remember.'}</p>
      </div>
      <PinPad busy={busy || wait} shake={shake} onDone={(p) => void done(p)} />
      {err && <p className="si-bad" role="alert">{err}</p>}
      {canFinger && (
        <div className="grp si-opt si-switchrow">
          <span className="si-tile" aria-hidden="true"><Icon name="fp" size={22} /></span>
          <div className="grow"><b>Open with my fingerprint too</b><span className="si-hint">So you rarely type the PIN</span></div>
          <button type="button" role="switch" className="sh-switch" aria-label="Open with my fingerprint too" aria-checked={finger} onClick={() => setFinger(!finger)} />
        </div>
      )}
      {onBack && <button type="button" className="btn2" onClick={onBack}>Back</button>}
    </div>
  )
}
