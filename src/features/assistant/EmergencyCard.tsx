import { callFirstContact } from '../sos/call'
import { emergencyTitle, type Emergency } from './gateClient'

/** The 911 card (mockup ask-emergency): no answer, big actions. 911 is always the dial screen, never auto-dialled. "Tell my family" starts the SOS flow. */
export function EmergencyCard({ e, onSos }: { e: Emergency; onSos: () => void }) {
  const crisis = e.call.includes('1553')
  return (
    <div className="as-card as-emerg" role="alert">
      <span className="as-eyebrow">This may be an emergency</span>
      <strong className="as-emerg-h">{emergencyTitle(e.kind)}</strong>
      <span>{e.text}</span>
      <button type="button" className="as-911" onClick={() => void callFirstContact([], { emergency: true })}>Call 911</button>
      {crisis && <button type="button" className="as-911 as-911-alt" onClick={() => { window.location.href = 'tel:1553' }}>Call 1553 (crisis line, free)</button>}
      <button type="button" className="as-911 as-911-alt" onClick={onSos}>Tell my family (SOS)</button>
      <span className="as-eyebrow as-foot">Checked on this phone before anything reaches the AI.</span>
    </div>
  )
}
