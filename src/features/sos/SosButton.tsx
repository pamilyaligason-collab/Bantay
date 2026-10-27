import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadActive, startSos } from './active'
import { useHold } from './hold'

const C = 2 * Math.PI * 86 // ring circumference, r=86 in a 180 box

/** The big red SOS circle (mockup safety). Hold 3 seconds: the SOS is saved for the family, the phone calls the first contact and a text opens.
 *  Anyone who cannot hold taps "Use a button instead" and confirms. A still-open SOS (the app was closed mid-call) shows an "Open it" button. */
export default function SosButton({ onSend }: { onSend: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [hint, setHint] = useState(false)
  const [open, setOpen] = useState(false)
  const go = () => { startSos(); onSend() }
  const { holding, left, start, cancel } = useHold(() => { setHint(false); go() })
  const release = () => { if (holding) setHint(true); cancel() }
  useEffect(() => {
    let live = true
    void loadActive().then((a) => { if (live && a) setOpen(true) })
    return () => { live = false }
  }, [])
  return (
    <div className="sos-wrap">
      {open && <button type="button" className="sos-go sos-resume" onClick={onSend}>Your SOS is still open. Open it</button>}
      <button type="button" className={`sos-btn${holding ? ' holding' : ''}`} aria-label={`SOS. ${holding ? 'Keep holding' : 'Hold 3 seconds'}. Hold to call and text your family. Or use the button below.`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setHint(false); start() }}
        onPointerUp={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirm(true) } }}>
        <svg viewBox="0 0 180 180" aria-hidden="true"><circle className="sos-track" cx="90" cy="90" r="86" /><circle className="sos-ring" cx="90" cy="90" r="86" strokeDasharray={C} strokeDashoffset={holding ? 0 : C} /></svg>
        <span>SOS{' '}<small>{holding ? 'Keep holding' : 'Hold 3 seconds'}</small></span>
      </button>
      {holding && createPortal(( // in the body, above the tab bar: the hold screen is a bare full red screen
        <div className="sos-full" aria-hidden="true" data-testid="sos-hold-screen">
          <div className="sos-full-n">{left}<small>{left === 1 ? 'second' : 'seconds'}</small></div>
          <b>Keep holding</b>
          <p>Let go to stop. Nothing is saved or dialled until the ring is full.</p>
        </div>
      ), document.body)}
      {hint && <p className="sos-hint" role="status">Keep holding for 3 seconds until the ring is full.</p>}
      <p className="sub sos-sub">Calls your first family contact and opens a text with your place. Your family will see it in Bantay.</p>
      {confirm
        ? (
          <div className="sos-confirm" role="alertdialog" aria-label="Send SOS now?">
            <b>Send SOS now?</b>
            <div className="sos-confirm-row">
              <button type="button" className="sos-go" autoFocus onClick={() => { setConfirm(false); go() }}>Yes, send SOS</button>
              <button type="button" className="sos-no" onClick={() => setConfirm(false)}>No, go back</button>
            </div>
          </div>
        )
        : <button type="button" className="sos-alt" onClick={() => setConfirm(true)}>Cannot hold? Use a button instead</button>}
    </div>
  )
}
