import { useState } from 'react'
import { answerReview, type ReviewAnswer } from '../health/MedReview'
import type { Medication } from '../log/store'
import Sheet from './Sheet'
import './family.css'

/** "Answer for Papa" (mockup family-answer): a writer carer settles a "Still taking it?" the person has not answered. It is saved as answered by the carer
 *  (schedule.answered_by) and the question closes; the medicine's reminders carry on unless the answer is "stopped". "Ask the doctor" closes it too and
 *  adds "Is X still needed?" to the questions for the next doctor visit on this phone. */
export default function FamilyAnswer({ name, med, by, onClose, onDone }: { name: string; med: Medication; by: string; onClose: () => void; onDone: (text: string) => void }) {
  const [pick, setPick] = useState<ReviewAnswer>('yes')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const label = [med.name, med.strength].filter(Boolean).join(' ')
  const send = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await answerReview(med, pick, by)
      onDone(pick === 'stopped' ? `${med.name} stopped. Its reminders are off.` : pick === 'doctor' ? `Added to the questions for ${name}'s next visit.` : `${med.name} checked. Saved as answered by ${by || 'you'}.`)
      onClose()
    } catch { setErr('Could not save on this phone. Try again.'); setBusy(false) }
  }
  const opts: { id: ReviewAnswer; text: string; sub?: string }[] = [
    { id: 'yes', text: 'Yes, still taking it' },
    { id: 'stopped', text: `${name} stopped it`, sub: `Reminders for ${med.name} stop.` },
    { id: 'doctor', text: 'Ask the doctor', sub: 'Adds a question for the next visit.' }
  ]
  return (
    <Sheet title={`Answer for ${name}`} onClose={onClose}>
      <p className="sub fa-q">Still taking {label}?</p>
      <div role="radiogroup" aria-label="Answer" className="fa-opts">
        {opts.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} className="fa-opt" data-on={pick === o.id} onClick={() => setPick(o.id)}>
            <b>{o.text}</b>{o.sub && <span className="sub">{o.sub}</span>}
          </button>
        ))}
      </div>
      <p className="sub">Saved as answered by {by || 'you'} for {name}. The question closes; their medicine reminders carry on{pick === 'stopped' ? ' except this one' : ''}.</p>
      {err && <p className="fm-err" role="alert">{err}</p>}
      <button type="button" className="btn" disabled={busy} onClick={() => void send()}>Send answer</button>
    </Sheet>
  )
}
