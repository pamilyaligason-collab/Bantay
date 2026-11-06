import { useId, useRef, useState } from 'react'
import { Ring } from '../look/Ring'
import { startSos } from './active'
import { useHold } from './hold'

export const TAP_MS = 400 // a press shorter than this is a tap (D-137); the 3 s hold in hold.ts is unchanged

/** Simple mode "hold for help" (mockup simple-hold): one big red button, 3-second hold, "Holding... N second(s) to go".
 *  Letting go cancels and nothing is sent. A quick tap (under 0.4 s) calls onTap: the family sheet. Keyboard and screen-reader users confirm instead of holding. S7 mounts it in SimpleToday. */
export default function SosHold({ onSend, onTap, ring = false, subBg }: { onSend: () => void; onTap?: () => void; ring?: boolean; subBg?: string }) {
  const [confirm, setConfirm] = useState(false)
  const downAt = useRef(0)
  const subId = useId()
  const go = () => { startSos(); onSend() }
  const { holding, left, start, cancel } = useHold(go)
  const subText = holding ? 'Let go to cancel. Nothing is sent yet.' : 'Hold 3 seconds. Calls your family and opens a text.' // inside the red block in the Jack sheet (board JackSheet)
  const subNode = <>{subText}{!holding && onTap && <span className="sos-tap-line">Tap to call or message family</span>}</>
  return (
    <div className="sos-simple">
      <button type="button" className={`sos-simple-btn${holding ? ' holding' : ''}`} aria-label="Hold to call and text your family" aria-describedby={ring ? subId : undefined}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); downAt.current = Date.now(); start() }}
        onPointerUp={() => { const tap = downAt.current > 0 && Date.now() - downAt.current < TAP_MS; downAt.current = 0; cancel(); if (tap) onTap?.() }} onPointerCancel={() => { downAt.current = 0; cancel() }} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirm(true) } }}>
        <span className="sos-simple-tx"><span>{holding ? `Holding... ${left} ${left === 1 ? 'second' : 'seconds'} to go` : 'Hold for help'}</span>{ring && <span id={subId} className="sos-simple-sub">{subNode}</span>}</span>
        {ring && holding && <span className="sos-ring" data-testid="jack-sos-ring"><Ring value={(3 - left) / 3} size={40} hue="none" stroke={4} /></span>}
      </button>
      {!ring && <p className="sub sos-simple-sub" data-contrast-bg={subBg}>{subNode}</p>}
      {onTap && <button type="button" className="sos-reach" onClick={onTap}>Reach family</button>}
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
