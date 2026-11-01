import { useState } from 'react'
import { Section } from '../look/Section'
import { feelingToast, FEELINGS, logFeeling, moodLine, useHasWriterCarer, type Feeling } from '../today/actions'
import { useActingCan, useActingPersonId } from '../viewas/viewAs'

/** The How-are-you faces (today/actions), as text-only buttons: no icon scale fits Great / OK / Not great / Unwell.
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
          {FEELINGS.map(([f, label]) => <button type="button" className="cm-face" key={f} disabled={busy || lockMood} onClick={() => void answer(f)}>{label}</button>)}
        </div>
        {lockMood && can?.reason && <p className="cm-sub">View only. {can.reason}</p>}
        {said && <p role="status" className="cm-sub">{said}</p>}
        {!said && <p className="cm-sub">{moodLine(writer)}</p>}
      </div>
    </Section>
  )
}
