import { useState, type ReactNode } from 'react'
import type { Crisis } from '../readingPreview'
import './bpcheck.css'

/** What to do after a dangerous reading. Symptoms first: the person answers one question, then sees one clear next step. Plain words, no numbers of their own in the copy.
 *  Copy needs clinician sign-off (docs/session-8/CLINICAL-REVIEW.md "Session 10 safety"). 911 opens the phone's dialer with the number typed in; Bantay never places an emergency call itself.
 *  The family row is raised by the server whatever is tapped here (migration 0035), so the line says so and promises nothing about a push (D-78). */
const FAMILY = 'Your family will see this in Bantay.'
const Call911 = () => <a className="pill primary bc-911" href="tel:911">Call 911</a>

/** fresh: false when the reading is older than the 2 hours the server alert covers (0035): the family line is then left out rather than promised. */
export default function CrisisCard({ kind, doctor, fresh = true, onClose }: { kind: Crisis; doctor?: string; fresh?: boolean; onClose: () => void }) {
  const dr = doctor?.trim() || 'your doctor'
  const [ans, setAns] = useState<'yes' | 'no' | null>(null)
  const done = <button type="button" className="pill ghost bc-close" onClick={onClose}>Close</button>
  const body = (title: string, children: ReactNode) => (
    <div className="bc-crisis" role="alert" data-testid="crisis-card" data-kind={kind}>
      <h3 className="bc-ct">{title}</h3>
      {children}
      {fresh && <p className="sub bc-fam">{FAMILY}</p>}
    </div>
  )

  if (kind === 'low_sugar') {
    return body('Your sugar is low', (
      <>
        <ol className="bc-steps">
          <li>Eat or drink 15 g of fast sugar now: half a cup of juice or regular soda, 3 glucose tablets, or 1 tablespoon of sugar or honey.</li>
          <li>Wait 15 minutes, then check your sugar again.</li>
          <li>Still low? Take another 15 g and wait again.</li>
        </ol>
        <p>If you are confused, cannot swallow, or pass out, call 911. Do not put food in the mouth of someone who is not awake.</p>
        <div className="bc-row"><Call911 />{done}</div>
      </>
    ))
  }
  if (kind === 'high_sugar') {
    return body('Your sugar is very high', (
      <>
        <p>Drink water and rest. Call {dr} today.</p>
        <p>If you feel sick, are vomiting, very thirsty, confused or short of breath, call 911.</p>
        <div className="bc-row"><Call911 />{done}</div>
      </>
    ))
  }

  const asked = kind === 'bp'
    ? { q: 'Very high blood pressure. Do you have chest pain, trouble breathing, a bad headache, blurred vision, weakness or numbness, or trouble speaking?', no: <><p>Rest for 5 minutes, sitting, and check again.</p><p>If it is still 180/120 or more, call {dr} today.</p></> }
    : { q: 'Your oxygen is low. Are you short of breath, or are your lips or face blue or gray?', no: <><p>Sit up straight and breathe slowly. Warm your hands, keep still, and check again in a minute.</p><p>If it is still under 90, or you become short of breath, call 911.</p></> }
  if (ans === 'yes') {
    return body('Call 911 now', (
      <>
        <p>Do not drive yourself. Sit down and unlock the door if you can. Say your address and stay on the line.</p>
        <div className="bc-row"><Call911 />{done}</div>
      </>
    ))
  }
  if (ans === 'no') {
    return body('Rest and check again', (
      <>
        {asked.no}
        <div className="bc-row">{done}</div>
      </>
    ))
  }
  return body('Check for warning signs first', (
    <>
      <p>{asked.q}</p>
      <div className="bc-row">
        <button type="button" className="pill primary" onClick={() => setAns('yes')}>Yes</button>
        <button type="button" className="pill ghost" onClick={() => setAns('no')}>No</button>
      </div>
    </>
  ))
}
