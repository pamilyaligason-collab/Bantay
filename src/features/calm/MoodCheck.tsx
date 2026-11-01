import { useState } from 'react'
import { Section } from '../look/Section'
import { feelingToast, FEELINGS, logFeeling, type Feeling } from '../today/actions'

/** The How-are-you faces (today/actions), as text-only buttons: no icon scale fits Great / OK / Not great / Unwell. */
export default function MoodCheck() {
  const [said, setSaid] = useState('')
  const answer = async (f: Feeling) => setSaid(feelingToast(await logFeeling(f)))
  return (
    <Section title="Mood check" testId="calm-mood">
      <div className="card cm-mood">
        <p className="cm-q">How are you?</p>
        <div role="group" aria-label="How are you?" className="cm-faces">
          {FEELINGS.map(([f, label]) => <button type="button" className="cm-face" key={f} onClick={() => void answer(f)}>{label}</button>)}
        </div>
        {said && <p role="status" className="cm-sub">{said}</p>}
        <p className="cm-sub">Choosing Unwell tells your family once a day.</p>
      </div>
    </Section>
  )
}
