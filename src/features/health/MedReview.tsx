import { useState } from 'react'
import { db } from '../../db'
import Sheet from '../family/Sheet'
import type { Medication } from '../log/store'
import { rxDate, type MedNote } from './MedEditSheet'
import { confirmStillTaking, setMedStatus } from './medActions'
import { isLive, parseSchedule, reviewAgeDays } from './meds'
import './health.css'
import './medicines.css'

/** Active medicines whose "Still taking it?" is open. A row that only needs its name checked has its own tag but is not counted here. */
export const toCheck = (meds: Medication[]): Medication[] => meds.filter((m) => isLive(m) && parseSchedule(m.schedule).review)

export type ReviewAnswer = 'yes' | 'stopped' | 'doctor'

const QUESTIONS_MAX = 20
const questionKey = (personId: string) => `visits.questions.${personId}` // the list Health > Doctor visits shows under "A question for the doctor"

/** The medicine with who answered and when written into its schedule (answered_by, answered_at), so the family sees "Answered by Lloyd". Nothing is added for the person themself. */
function withAnswer(m: Medication, by?: string): Medication {
  const name = by?.trim().slice(0, 40)
  if (!name) return m
  const o = m.schedule && typeof m.schedule === 'object' && !Array.isArray(m.schedule) ? (m.schedule as Record<string, unknown>) : { v: 1, times: Array.isArray(m.schedule) ? m.schedule : [] }
  return { ...m, schedule: { ...o, answered_by: name, answered_at: new Date().toISOString() } }
}

/** Answer a "Still taking it?" for a medicine. yes: the question closes and the reminders carry on. stopped: the medicine moves to Past and its reminders stop on every phone.
 *  doctor: the question closes, the medicine stays on the list, and "Is X still needed?" is added to the next doctor visit's questions on this phone.
 *  `by` is the carer's name when someone answers for the person; it is recorded in the schedule as "answered by". */
export async function answerReview(med: Medication, answer: ReviewAnswer, by?: string): Promise<void> {
  const m = withAnswer(med, by)
  if (answer === 'stopped') await setMedStatus(m, 'stopped')
  else await confirmStillTaking(m)
  if (answer === 'doctor') {
    const key = questionKey(med.personId)
    const cur = (await db.kv.get(key).catch(() => undefined))?.value
    const list = Array.isArray(cur) ? cur.filter((q): q is string => typeof q === 'string') : []
    const q = `Is ${med.name} still needed?`.slice(0, 120)
    if (!list.includes(q)) await db.kv.put({ key, value: [...list, q].slice(-QUESTIONS_MAX) })
  }
}

const asked = (days: number | null) => (days == null ? '' : days <= 0 ? 'Asked today. ' : days === 1 ? 'Asked yesterday. ' : `Asked ${days} days ago. `)

/** "Still taking it?" line under a medicine: Yes clears the review, Dose changed opens the edit sheet, I stopped it asks first and then moves it to Past.
 *  `by`: the carer's name when someone answers for the person (recorded as "answered by"). */
export function MedReview({ med, onChange, onNote, by }: { med: Medication; onChange: () => void; onNote: (n: MedNote) => void; by?: string }) {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const s = parseSchedule(med.schedule)
  const go = async (fn: () => Promise<unknown>, text: string) => {
    if (busy) return
    setBusy(true)
    try { await fn(); onNote({ text }) } catch { onNote({ text: 'Could not save on this phone. Try again.' }) }
    setBusy(false)
  }
  return (
    <div className="md-review">
      <span>From a prescription{rxDate(med)}. {s.needsTime ? 'No time on it. ' : ''}Still taking it?</span>
      <span className="sub">{asked(reviewAgeDays(med, new Date()))}The reminders keep going until someone answers. Nothing goes quiet by itself.</span>
      <span className="md-rv">
        <button type="button" className="md-pill md-pri" disabled={busy} aria-label={`Yes, still taking ${med.name}`} onClick={() => void go(() => answerReview(med, 'yes', by), `${med.name} checked.`)}>Yes, still taking</button>
        <button type="button" className="md-pill" disabled={busy} aria-label={`Dose changed, ${med.name}`} onClick={onChange}>Dose changed</button>
        <button type="button" className="md-pill" disabled={busy} aria-label={`I stopped ${med.name}`} onClick={() => setConfirm(true)}>I stopped it</button>
      </span>
      {confirm && (
        <Sheet title={`Stop reminders for ${med.name}?`} onClose={() => setConfirm(false)} focusTitle>
          <p className="sub">Alarms stop on every phone. Past doses stay in the history. You can turn it back on any time.</p>
          <button type="button" className="btn" disabled={busy} onClick={() => void go(() => answerReview(med, 'stopped', by), `${med.name} moved to Past.`).then(() => setConfirm(false))}>Stop reminders</button>
          <button type="button" className="btn2" onClick={() => setConfirm(false)}>Cancel</button>
        </Sheet>
      )}
    </div>
  )
}

/** The one card "N medicines to check" (Health and Today). Hidden at 0. */
export function MedsToCheckCard({ count, href = '#health/meds' }: { count: number; href?: string }) {
  if (count <= 0) return null
  return (
    <a className="card md-check" href={href} data-testid="meds-to-check">
      <strong>{count} {count === 1 ? 'medicine' : 'medicines'} to check</strong>
      <span className="sub">Still taking {count === 1 ? 'it' : 'them'}? Tap to answer.</span>
    </a>
  )
}
