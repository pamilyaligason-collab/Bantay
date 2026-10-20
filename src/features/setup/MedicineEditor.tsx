import { useEffect, useRef, useState } from 'react'
import { isLive, parseSchedule } from '../health/meds'
import MedEditSheet, { DuplicateNotice, type MedNote } from '../health/MedEditSheet'
import { addMedication, clock12, DEFAULT_TIME, deleteMedication, DuplicateMedication, editMedication, restoreMedication, setMedStatus, TIME_CHIPS } from '../health/medActions'
import { useMedicationRows } from '../health/useMedicationRows'
import type { Medication } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import ChipField from './ChipField'
import { MEDICINES, cleanItem } from './lists'
import '../health/medicines.css'
import './setup.css'

const UNDO_MS = 6000

/** This phone's person id: undefined while it is being read, null when nobody is signed in. */
export function useSelfId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void selfIdOrCached().then((v) => { if (live) setId(v) }, () => { if (live) setId(null) })
    return () => { live = false }
  }, [])
  return id
}

/** Medicines for one person, written to the medications table (not the profile text). Every medicine has a time chip: a new one starts at Morning
 *  and a time can be changed or added, never emptied. A drug already on the list is never added twice. Taking a chip off deletes with a 6 s Undo;
 *  a medicine that came from a prescription opens its sheet instead. */
export default function MedicineEditor({ personId, label = 'Medicines you take every day' }: { personId: string | null | undefined; label?: string }) {
  const rows = useMedicationRows(personId)
  const [open, setOpen] = useState<Medication | null>(null)
  const [dup, setDup] = useState<Medication | null>(null)
  const [note, setNote] = useState<MedNote | null>(null)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const say = (n: MedNote) => { window.clearTimeout(timer.current); setNote(n); timer.current = window.setTimeout(() => setNote(null), n.undo ? UNDO_MS : 3500) }

  const live = (rows ?? []).filter(isLive).sort((a, b) => a.name.localeCompare(b.name))
  const draftOf = (m: Medication, times: string[]) => ({ name: m.name, strength: m.strength ?? '', dose: m.dose ?? '', times, asNeeded: !!m.asNeeded })
  if (personId === undefined) return null
  if (!personId) return <p className="sf-note" role="note" style={{ background: 'var(--cell)' }}>Sign in to add medicines, each with a time.</p>

  const names = live.map((m) => m.name)
  const onNames = (next: string[]) => {
    setDup(null)
    for (const n of next.filter((x) => !names.includes(x))) {
      const name = cleanItem(n)
      if (!name) continue
      void addMedication(personId, { name, strength: '', dose: '', times: [DEFAULT_TIME], asNeeded: false }).catch((e) => { if (e instanceof DuplicateMedication) setDup(e.existing) })
    }
    for (const m of live.filter((x) => !next.includes(x.name))) {
      if (m.origin === 'rx') { setOpen(m); continue } // converted from a prescription: look at it before it goes
      void deleteMedication(m).then((gone) => say({ text: `${m.name} deleted.`, undo: () => void restoreMedication({ ...gone, id: undefined }) }))
    }
  }
  const toggle = (m: Medication, t: string) => {
    const times = parseSchedule(m.schedule).times
    const next = times.includes(t) ? times.filter((x) => x !== t) : [...times, t]
    if (next.length === 0) return // never leave a medicine without a time
    void editMedication(m, draftOf(m, next))
  }
  return (
    <>
      <div className="grp"><ChipField label={label} multi options={MEDICINES} value={names} onChange={onNames} /></div>
      {dup && <DuplicateNotice existing={dup} onOpen={() => { setOpen(dup); setDup(null) }} onStart={() => { void setMedStatus(dup, 'active').then(() => say({ text: `${dup.name} started again.` })); setDup(null) }} />}
      {live.map((m) => {
        const s = parseSchedule(m.schedule)
        const odd = s.times.filter((t) => !TIME_CHIPS.some((c) => c.time === t))
        return (
          <div className="grp" key={m.clientId ?? m.id} role="group" aria-label={`When you take ${m.name}`}>
            <div className="wz-chipfield">
              <span className="sub">{m.name}: when?</span>
              <div className="wz-chips">
                {TIME_CHIPS.map((c) => <button key={c.time} type="button" className="wz-chip" aria-pressed={s.times.includes(c.time)} onClick={() => toggle(m, c.time)}>{c.label} {clock12(c.time)}</button>)}
                {odd.map((t) => <button key={t} type="button" className="wz-chip" aria-pressed="true" onClick={() => toggle(m, t)}>{clock12(t)}</button>)}
              </div>
            </div>
          </div>
        )
      })}
      {open && <MedEditSheet med={open} personId={personId} onClose={() => setOpen(null)} onNote={say} onOpen={setOpen} />}
      {note && (
        <div className="toast md-toast md-ed-toast" role="status">
          <span>{note.text}</span>
          {note.undo && <button type="button" className="md-undo" onClick={() => { note.undo?.(); say({ text: 'Back again.' }) }}>Undo</button>}
        </div>
      )}
    </>
  )
}
