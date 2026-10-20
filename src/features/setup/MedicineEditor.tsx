import { useEffect, useState } from 'react'
import { isLive, parseSchedule } from '../health/meds'
import { addMedication, DEFAULT_TIME, deleteMedication, TIME_CHIPS, clock12, editMedication } from '../health/medActions'
import { useMedicationRows } from '../health/useMedicationRows'
import type { Medication } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import ChipField from './ChipField'
import { MEDICINES, cleanItem } from './lists'
import './setup.css'

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
 *  and a time can be changed or added, never emptied. */
export default function MedicineEditor({ personId, label = 'Medicines you take every day' }: { personId: string | null | undefined; label?: string }) {
  const rows = useMedicationRows(personId)
  const live = (rows ?? []).filter(isLive).sort((a, b) => a.name.localeCompare(b.name))
  const draftOf = (m: Medication, times: string[]) => ({ name: m.name, strength: m.strength ?? '', dose: m.dose ?? '', times, asNeeded: !!m.asNeeded })
  if (personId === undefined) return null
  if (!personId) return <p className="sf-note" role="note" style={{ background: 'var(--cell)' }}>Sign in to add medicines, each with a time.</p>

  const names = live.map((m) => m.name)
  const onNames = (next: string[]) => {
    for (const n of next.filter((x) => !names.includes(x))) { const name = cleanItem(n); if (name) void addMedication(personId, { name, strength: '', dose: '', times: [DEFAULT_TIME], asNeeded: false }) }
    for (const m of live.filter((x) => !next.includes(x.name))) void deleteMedication(m)
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
    </>
  )
}
