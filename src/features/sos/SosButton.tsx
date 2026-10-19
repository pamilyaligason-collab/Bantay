import { useState } from 'react'
import { useHold } from './hold'

const C = 2 * Math.PI * 86 // ring circumference, r=86 in a 180 box

/** The big red SOS circle (mockup safety). Hold 3 seconds to send. Anyone who cannot hold taps "Use a button instead" and confirms. */
export default function SosButton({ onSend }: { onSend: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [hint, setHint] = useState(false)
  const { holding, start, cancel } = useHold(() => { setHint(false); onSend() })
  const release = () => { if (holding) setHint(true); cancel() }
  return (
    <div className="sos-wrap">
      <button type="button" className={`sos-btn${holding ? ' holding' : ''}`} aria-label="SOS. Press and hold 3 seconds to alert your family. Or use the button below."
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setHint(false); start() }}
        onPointerUp={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirm(true) } }}>
        <svg viewBox="0 0 180 180" aria-hidden="true"><circle className="sos-track" cx="90" cy="90" r="86" /><circle className="sos-ring" cx="90" cy="90" r="86" strokeDasharray={C} strokeDashoffset={holding ? 0 : C} /></svg>
        <span>SOS<small>{holding ? 'Keep holding' : 'Hold 3 seconds'}</small></span>
      </button>
      {hint && <p className="sos-hint" role="status">Keep holding for 3 seconds until the ring is full.</p>}
      <p className="sub sos-sub">Opens a text to the people you chose, with your place. Also lets you call 911.</p>
      {confirm
        ? (
          <div className="sos-confirm" role="alertdialog" aria-label="Send SOS now?">
            <b>Send SOS now?</b>
            <div className="sos-confirm-row">
              <button type="button" className="sos-go" autoFocus onClick={() => { setConfirm(false); onSend() }}>Yes, send SOS</button>
              <button type="button" className="sos-no" onClick={() => setConfirm(false)}>No, go back</button>
            </div>
          </div>
        )
        : <button type="button" className="sos-alt" onClick={() => setConfirm(true)}>Cannot hold? Use a button instead</button>}
    </div>
  )
}
