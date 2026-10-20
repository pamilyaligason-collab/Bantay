import { useState } from 'react'
import type { Medication } from '../log/store'
import { rxDate, type MedNote } from './MedEditSheet'
import { confirmStillTaking, setMedStatus } from './medActions'
import { isLive, parseSchedule } from './meds'
import './health.css'
import './medicines.css'

/** Active medicines whose "Still taking it?" or name check is open. */
export const toCheck = (meds: Medication[]): Medication[] => meds.filter((m) => isLive(m) && (parseSchedule(m.schedule).review || parseSchedule(m.schedule).needsCheck))

/** "Still taking it?" line under a medicine: Yes clears the review, Stopped moves it to Past, Change opens the edit sheet. */
export function MedReview({ med, onChange, onNote }: { med: Medication; onChange: () => void; onNote: (n: MedNote) => void }) {
  const [busy, setBusy] = useState(false)
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
      <span className="md-rv">
        <button type="button" className="md-pill md-pri" disabled={busy} aria-label={`Yes, still taking ${med.name}`} onClick={() => void go(() => confirmStillTaking(med), `${med.name} checked.`)}>Yes</button>
        <button type="button" className="md-pill" disabled={busy} aria-label={`Change ${med.name}`} onClick={onChange}>Change</button>
        <button type="button" className="md-pill" disabled={busy} aria-label={`${med.name} stopped`} onClick={() => void go(() => setMedStatus(med, 'stopped'), `${med.name} moved to Past.`)}>Stopped</button>
      </span>
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
