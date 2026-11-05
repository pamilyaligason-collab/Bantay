import { useState } from 'react'
import { Section } from '../look/Section'
import { feelingToast, FEELINGS, logFeeling, moodLine, useHasWriterCarer, type Feeling } from '../today/actions'
import { useActingCan, useActingPersonId } from '../viewas/viewAs'

/** The one promise line under the faces: only true when a carer who can read it is linked (D-109 may change the rule; this is the one string site). */
/** The board's four faces (Mindful.dc.html): one SVG path per feeling. */
const FACE: Record<Feeling, string> = {
  great: 'M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  ok: 'M9 15h6M9 9.5h.01M15 9.5h.01',
  notgreat: 'M8.5 16a4.5 4.5 0 0 1 7 0M9 9.5h.01M15 9.5h.01',
  unwell: 'M8.5 16.5a4.5 4.5 0 0 1 7 0M8 9l2 1M16 9l-2 1M9 12.5h.01M15 12.5h.01'
}

/** The board's words (Mindful): Good, Okay, Low, Unwell. */
const WORD: Record<Feeling, string> = { great: 'Good', ok: 'Okay', notgreat: 'Low', unwell: 'Unwell' }

export const moodPromise = (linked: boolean) => (linked ? 'Unwell tells your family' : 'Only the family owner and family linked to you can see this. If you feel unwell, call your family.')

/** The How-are-you faces (today/actions), as four 76 px tiles with the board's faces.
 *  Same rules as today/QuickLog: writes for the viewed person while an admin is acting, locked in View only, one write at a time. */
export default function MoodCheck() {
  const [said, setSaid] = useState('')
  const [busy, setBusy] = useState(false)
  const self = useActingPersonId()
  const can = useActingCan() // null when not acting
  const lockMood = !!can && !can.mood
  const writer = useHasWriterCarer(self)
  const answer = async (f: Feeling) => {
    if (busy || lockMood) return
    setBusy(true)
    try {
      const r = await logFeeling(f, self ?? undefined)
      setSaid(r === 'told' && f !== 'unwell' && !writer ? moodLine(writer) : feelingToast(r)) // 'told' promises the family sees it; without a writer carer they do not
    } finally { setBusy(false) }
  }
  return (
    <Section title="Mood check" testId="calm-mood">
      <div className="card cm-mood">
        <p className="cm-q">How are you?</p>
        <div role="group" aria-label="How are you?" className="cm-faces">
          {FEELINGS.map(([f]) => <button type="button" className="cm-face" key={f} aria-label={WORD[f]} disabled={busy || lockMood} onClick={() => void answer(f)}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d={FACE[f]} /></svg>{WORD[f]}</button>)}
        </div>
        {lockMood && can?.reason && <p className="cm-sub">View only. {can.reason}</p>}
        {said && <p role="status" className="cm-sub">{said}</p>}
        {!said && <p className="cm-sub">{moodPromise(writer === true)}</p>}
      </div>
    </Section>
  )
}
