import { useState } from 'react'
import '../family/family.css'
import '../setup/setup.css'
import Sheet from '../family/Sheet'
import type { Medication } from '../log/store'
import { addMedication, clock12, DEFAULT_TIME, deleteMedication, editMedication, PRESET_TIMES, restoreMedication, setMedStatus, TIME_CHIPS, type Draft } from './medActions'
import { parseSchedule } from './meds'
import './health.css'
import './medicines.css'

export interface MedNote { text: string; undo?: () => void }

const SAVE_FAIL = 'Could not save on this phone. Try again.'
const fmtMonth = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

/** The "dated MMM YYYY" part of a review line: the prescription date when there is one. */
export const rxDate = (m: Medication): string => (m.startedOn ? ` dated ${fmtMonth(m.startedOn)}` : '')

/** Add or edit one medicine (mockup screen "Edit medicine"). Writes go to the Dexie medications table and the outbox ('medications', merge on client_id).
 *  `med` undefined = a new one. `onNote` shows the toast on the screen behind (with Undo after a delete). */
export default function MedEditSheet({ med, personId, onClose, onNote }: { med?: Medication; personId: string; onClose: () => void; onNote: (n: MedNote) => void }) {
  const sched = parseSchedule(med?.schedule)
  const [d, setD] = useState<Draft>({
    name: med?.name ?? '', strength: med?.strength ?? '', dose: med?.dose ?? '',
    times: sched.times.length || med?.asNeeded || med ? sched.times : [DEFAULT_TIME], asNeeded: !!med?.asNeeded
  })
  const [custom, setCustom] = useState(false)
  const [customTime, setCustomTime] = useState('09:00')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const paused = med?.medStatus === 'paused'

  const toggle = (t: string) => setD({ ...d, times: d.times.includes(t) ? d.times.filter((x) => x !== t) : [...d.times, t].sort() })
  const extra = d.times.filter((t) => !PRESET_TIMES.has(t))
  const addCustom = () => { if (customTime && !d.times.includes(customTime)) setD({ ...d, times: [...d.times, customTime].sort() }); setCustom(false) }
  const valid = (): boolean => {
    if (!d.name.trim()) { setErr('Type the medicine name first.'); return false }
    if (!d.asNeeded && d.times.length === 0) { setErr('Pick a time, or turn on As needed.'); return false }
    setErr('')
    return true
  }
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await fn(); onClose() } catch { setErr(SAVE_FAIL); setBusy(false) }
  }

  const save = () => { if (valid()) void run(async () => { if (med) await editMedication(med, d); else await addMedication(personId, d); onNote({ text: `${d.name.trim()} saved.` }) }) }
  const pause = () => {
    if (!med || !valid()) return
    void run(async () => { await setMedStatus(med, paused ? 'active' : 'paused', d); onNote({ text: paused ? `${d.name.trim()} resumed. Reminders are back on.` : `${d.name.trim()} paused. Reminders are off.` }) })
  }
  const stop = () => { if (med && valid()) void run(async () => { await setMedStatus(med, 'stopped', d); onNote({ text: `${d.name.trim()} moved to Past.` }) }) }
  const del = () => {
    if (!med) return
    void run(async () => {
      const gone = await deleteMedication(med)
      onNote({ text: `${med.name} deleted.`, undo: () => void restoreMedication({ ...gone, id: undefined }) })
    })
  }

  return (
    <Sheet title={med ? 'Edit medicine' : 'Add medicine'} onClose={onClose}>
      <div className="fm-form md-form">
        {med && (sched.review || sched.needsCheck) && (
          <p className="md-note" role="note">{med.origin === 'rx' ? `From a prescription${rxDate(med)}. ` : ''}Saving marks it as checked.</p>
        )}
        <label htmlFor="md-name">Name</label>
        <input id="md-name" value={d.name} maxLength={80} autoComplete="off" onChange={(e) => setD({ ...d, name: e.target.value })} />
        <div className="md-two">
          <div><label htmlFor="md-str">Strength</label><input id="md-str" value={d.strength} maxLength={40} placeholder="500 mg" autoComplete="off" onChange={(e) => setD({ ...d, strength: e.target.value })} /></div>
          <div><label htmlFor="md-dose">Dose</label><input id="md-dose" value={d.dose} maxLength={40} placeholder="1 tablet" autoComplete="off" onChange={(e) => setD({ ...d, dose: e.target.value })} /></div>
        </div>
        <div role="group" aria-label="Times" className="md-times">
          <span className="md-lbl">Times</span>
          <div className="md-chips">
            {TIME_CHIPS.map((c) => (
              <button key={c.time} type="button" className="wz-chip" aria-pressed={d.times.includes(c.time)} disabled={d.asNeeded} onClick={() => toggle(c.time)}>{c.label} {clock12(c.time)}</button>
            ))}
            {extra.map((t) => (
              <button key={t} type="button" className="wz-chip" aria-pressed="true" disabled={d.asNeeded} aria-label={`${clock12(t)}, tap to remove`} onClick={() => toggle(t)}>{clock12(t)}</button>
            ))}
            <button type="button" className="wz-chip" aria-pressed={custom} disabled={d.asNeeded} onClick={() => setCustom(!custom)}>Custom</button>
          </div>
          {custom && !d.asNeeded && (
            <div className="md-custom">
              <input type="time" aria-label="Custom time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
              <button type="button" className="btn2 wz-sm" onClick={addCustom}>Add time</button>
            </div>
          )}
        </div>
        <div className="md-switchrow">
          <span className="grow"><strong id="md-asn">As needed</strong><span className="sub md-sub">No reminders, log when taken</span></span>
          <button type="button" className="switch" role="switch" aria-checked={d.asNeeded} aria-labelledby="md-asn" onClick={() => setD({ ...d, asNeeded: !d.asNeeded })} />
        </div>
        {err && <p className="md-err" role="alert">{err}</p>}
        {med && (
          <>
            <div className="md-acts">
              <button type="button" className="btn2" disabled={busy} onClick={pause}>{paused ? 'Resume' : 'Pause'}</button>
              <button type="button" className="btn2" disabled={busy} onClick={stop}>Stop</button>
              <button type="button" className="btn2 md-del" disabled={busy} onClick={del}>Delete</button>
            </div>
            <p className="sub md-help">Stop: finished this medicine, it moves to Past. Delete: added by mistake.</p>
          </>
        )}
        <button type="button" className="btn" disabled={busy} onClick={save}>Save</button>
      </div>
    </Sheet>
  )
}
