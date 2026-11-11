import { callFirstContact } from '../sos/call'
import { emergencyTitle, type Emergency } from './gateClient'

// S30 L8 (D1): a crisis line button per number the gate chose for where the phone is. 988 (US, call or text) and 1553 (NCMH, Philippines); 911 is its own button below.
const CRISIS_BUTTON: Record<string, string> = { '988': 'Call 988 (crisis line, free)', '1553': 'Call 1553 (crisis line, free)' }

/** The 911 card (mockup ask-emergency): no answer, big actions. 911 is always the dial screen, never auto-dialled. "Tell my family" starts the SOS flow. */
export function EmergencyCard({ e, onSos }: { e: Emergency; onSos: () => void }) {
  const crisis = e.call.filter((n) => n in CRISIS_BUTTON)
  return (
    <div className="as-card as-emerg" role="alert">
      <span className="as-eyebrow">This may be an emergency</span>
      <strong className="as-emerg-h">{emergencyTitle(e.kind)}</strong>
      <span>{e.text}</span>
      {crisis.map((n, i) => [
        <button key={n} type="button" className={i === 0 ? 'as-911' : 'as-911 as-911-alt'} onClick={() => { window.location.href = `tel:${n}` }}>{CRISIS_BUTTON[n]}</button>,
        n === '988' ? <a key={`${n}-text`} className="as-911 as-911-alt" href="sms:988">Text 988</a> : null // 988 takes texts too; a link so the phone's messages app opens (never auto-sent)
      ])}
      <button type="button" className={crisis.length ? 'as-911 as-911-alt' : 'as-911'} onClick={() => void callFirstContact([], { emergency: true })}>Call 911</button>
      <button type="button" className="as-911 as-911-alt" onClick={onSos}>Tell my family (SOS)</button>
      <span className="as-eyebrow as-foot">Checked on this phone before anything reaches the AI.</span>
    </div>
  )
}
