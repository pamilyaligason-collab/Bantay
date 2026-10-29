import { useState } from 'react'
import { startSos } from './active'
import { useHold } from './hold'

/** Simple mode "hold for help" (mockup simple-hold): one big red button, 3-second hold, "Holding... N second(s) to go".
 *  Letting go cancels and nothing is sent. Keyboard and screen-reader users confirm instead of holding. S7 mounts it in SimpleToday. */
export default function SosHold({ onSend }: { onSend: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const go = () => { startSos(); onSend() }
  const { holding, left, start, cancel } = useHold(go)
  return (
    <div className="sos-simple">
      <button type="button" className={`sos-simple-btn${holding ? ' holding' : ''}`} aria-label="Hold to call and text your family"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start() }}
        onPointerUp={cancel} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirm(true) } }}>
        <span>{holding ? `Holding... ${left} ${left === 1 ? 'second' : 'seconds'} to go` : 'Hold for help'}</span>
      </button>
      <p className="sub sos-simple-sub">{holding ? 'Let go to cancel. Nothing is sent yet.' : 'Hold 3 seconds. Calls your family and opens a text.'}</p>
      {confirm && (
        <div className="sos-confirm" role="alertdialog" aria-label="Send SOS now?">
          <b>Send SOS now?</b>
          <div className="sos-confirm-row">
            <button type="button" className="sos-go" autoFocus onClick={() => { setConfirm(false); go() }}>Yes, send SOS</button>
            <button type="button" className="sos-no" onClick={() => setConfirm(false)}>No, go back</button>
          </div>
        </div>
      )}
    </div>
  )
}
