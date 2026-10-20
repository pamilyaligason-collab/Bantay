import { liveQuery } from 'dexie'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ldb, logDose, type MedTaken, type Medication } from '../log/store'
import MedEditSheet, { type MedNote } from './MedEditSheet'
import { MedReview, toCheck } from './MedReview'
import { clock12, setMedStatus } from './medActions'
import { dayOf, isLive, matchDoses, parseSchedule, slotsFor, type DoseState } from './meds'
import { useMedicationRows } from './useMedicationRows'
import './health.css'
import './medicines.css'

const NONE: MedTaken[] = []
const TOAST_MS = 3500
const UNDO_MS = 6000

/** Doses logged on `day` for one person, live. Full rows: the medication id, slot and skipped flag decide what is taken. */
function useDayTakes(personId: string, day: string): MedTaken[] {
  const [rows, setRows] = useState<MedTaken[]>(NONE)
  useEffect(() => {
    if (!personId) return setRows(NONE)
    const since = new Date(`${day}T00:00:00`).toISOString()
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(since).filter((m) => m.personId === personId).toArray()).subscribe({ next: setRows, error: () => setRows(NONE) })
    return () => sub.unsubscribe()
  }, [personId, day])
  return rows
}

const timeOf = (iso: string) => { const d = new Date(iso); return clock12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`) }
const label = (m: Pick<Medication, 'name' | 'strength'>) => [m.name, m.strength].filter(Boolean).join(' ')
const byName = (a: Medication, b: Medication) => a.name.localeCompare(b.name)

/** The take (or skip) that settled a dose, for "Taken 8:12 AM". */
function settledBy(d: DoseState, takes: MedTaken[]): MedTaken | undefined {
  const mine = takes.filter((t) => d.medicationId && t.medicationId === d.medicationId && t.slot === d.slot)
  return mine.find((t) => !t.skipped) ?? mine[0]
}

/** Today's doses for one person, shared by the screen and the Health summary. */
function useToday(personId: string) {
  const meds = useMedicationRows(personId)
  const day = dayOf(new Date())
  const takes = useDayTakes(personId, day)
  const doses = useMemo(() => matchDoses(slotsFor(meds ?? [], personId, day), takes, day), [meds, personId, day, takes])
  return { meds, takes, doses, day }
}

/** Health > Medicines for one person: Today (Take / Skip), Active, Paused, Past, and Add.
 *  `canMark`: this person, or a writer carer (the server takes a dose from them). `canEdit`: also an admin (records_editor). */
export function Medicines({ personId, mine, canMark = mine, canEdit = canMark }: { personId: string; mine?: boolean; canMark?: boolean; canEdit?: boolean }) {
  const { meds, takes, doses } = useToday(personId)
  const [sheet, setSheet] = useState<{ med?: Medication } | null>(null)
  const [note, setNote] = useState<MedNote | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const say = (n: MedNote) => {
    window.clearTimeout(timer.current)
    setNote(n)
    timer.current = window.setTimeout(() => setNote(null), n.undo ? UNDO_MS : TOAST_MS)
  }
  const mark = async (d: DoseState, skipped: boolean) => {
    if (busy) return
    setBusy(true)
    try { await logDose({ personId, name: d.name, serverId: d.medicationId ?? undefined }, d.slot, { skipped }) } catch { say({ text: 'Could not save on this phone. Try again.' }) }
    setBusy(false)
  }

  const live = (meds ?? []).filter(isLive).sort(byName)
  const paused = (meds ?? []).filter((m) => m.medStatus === 'paused').sort(byName)
  const past = (meds ?? []).filter((m) => m.medStatus === 'stopped').sort((a, b) => (b.stoppedOn ?? '').localeCompare(a.stoppedOn ?? ''))
  const done = doses.filter((d) => d.state !== 'pending').length
  const open = (med?: Medication) => canEdit && setSheet({ med })
  const empty = meds !== undefined && live.length + paused.length + past.length === 0

  return (
    <section aria-label="Medicines" className="md">
      {canEdit && (
        <div className="md-addrow">
          <button type="button" className="md-add" onClick={() => open()}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>Add</button>
        </div>
      )}
      {empty && (
        <div className="grp"><div className="row"><span className="grow">No medicines yet<span className="sub">{canEdit ? 'Tap Add to put one in, or confirm a prescription in Family > Records.' : 'Nothing has been added for them yet.'}</span></span></div></div>
      )}

      {doses.length > 0 && (
        <>
          <div className="md-sech"><h2 className="hd">Today</h2><span className="sub">{done} of {doses.length} done</span></div>
          <div className="grp" data-testid="meds-today">
            {doses.map((d) => {
              const t = settledBy(d, takes)
              return (
                <div className="row md-dose" key={`${d.key}:${d.slot}`} data-med={d.name} data-state={d.state}>
                  <span className="md-tm">{clock12(d.slot)}</span>
                  <span className="grow md-main">
                    <strong>{label({ name: d.name, strength: meds?.find((m) => (m.serverId ?? m.clientId ?? String(m.id)) === d.key)?.strength })}</strong>
                    <span className="sub">{d.state === 'taken' ? (t ? `Taken ${timeOf(t.takenAt)}` : 'Taken') : d.state === 'skipped' ? 'Skipped' : 'Not yet'}</span>
                  </span>
                  {d.state === 'taken' && <span className="hv-done"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg> Taken</span>}
                  {d.state === 'skipped' && <span className="md-tag">Skipped</span>}
                  {d.state === 'pending' && canMark && (
                    <span className="md-rowacts">
                      <button type="button" className="hv-take" disabled={busy} aria-label={`Take ${d.name} ${clock12(d.slot)}`} onClick={() => void mark(d, false)}>Take</button>
                      <button type="button" className="md-pill" disabled={busy} aria-label={`Skip ${d.name} ${clock12(d.slot)}`} onClick={() => void mark(d, true)}>Skip</button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {live.length > 0 && (
        <>
          <div className="md-sech"><h2 className="hd">Active</h2><span className="sub">{live.length}</span></div>
          <div className="grp" data-testid="meds-active">
            {live.map((m) => {
              const s = parseSchedule(m.schedule)
              const body = (
                <>
                  <strong>{label(m)}</strong>
                  <span className="md-chips">
                    {s.times.map((t) => <span className="md-tag" key={t}>{clock12(t)}</span>)}
                    {m.asNeeded && <span className="md-tag">As needed</span>}
                    {s.needsTime && !m.asNeeded && <span className="md-tag warn">Set a time</span>}
                    {s.needsCheck && <span className="md-tag warn">Check the name</span>}
                  </span>
                </>
              )
              return (
                <div className="md-li" key={m.clientId ?? m.serverId ?? m.id} data-med={m.name}>
                  {canEdit
                    ? <button type="button" className="md-medrow" onClick={() => open(m)}>{body}</button>
                    : <div className="md-medrow">{body}</div>}
                  {canEdit && s.review && <MedReview med={m} onChange={() => open(m)} onNote={say} />}
                </div>
              )
            })}
          </div>
        </>
      )}

      {paused.length > 0 && (
        <>
          <div className="md-sech"><h2 className="hd">Paused</h2><span className="sub">{paused.length}</span></div>
          <div className="grp" data-testid="meds-paused">
            {paused.map((m) => (
              <div className="row" key={m.clientId ?? m.id} data-med={m.name}>
                <span className="grow md-main"><strong>{label(m)}</strong><span className="sub">Paused, no reminders</span></span>
                {canEdit && <button type="button" className="md-pill" aria-label={`Resume ${m.name}`} onClick={() => void setMedStatus(m, 'active').then(() => say({ text: `${m.name} resumed. Reminders are back on.` })).catch(() => say({ text: 'Could not save on this phone. Try again.' }))}>Resume</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="md-sech"><h2 className="hd">Past</h2><span className="sub">{past.length}</span></div>
          <div className="grp" data-testid="meds-past">
            {past.map((m) => (
              <div className="row" key={m.clientId ?? m.id} data-med={m.name}>
                <span className="grow md-main"><strong>{label(m)}</strong><span className="sub">{m.stoppedOn ? `Stopped ${new Date(`${m.stoppedOn}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : 'Stopped'}</span></span>
                {canEdit && <button type="button" className="md-pill" aria-label={`Open ${m.name}`} onClick={() => open(m)}>Open</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {sheet && <MedEditSheet med={sheet.med} personId={personId} onClose={() => setSheet(null)} onNote={say} onOpen={(m) => setSheet({ med: m })} />}
      {note && (
        <div className="toast md-toast" role="status">
          <span>{note.text}</span>
          {note.undo && <button type="button" className="md-undo" onClick={() => { note.undo?.(); say({ text: 'Back again.' }) }}>Undo</button>}
        </div>
      )}
    </section>
  )
}

/** The Health overview line: how many of today's doses are done, and how many medicines still need a check. Opens Health > Medicines. */
export function MedicinesSummary({ personId }: { personId: string }) {
  const { meds, doses } = useToday(personId)
  if (meds === undefined) return null
  const done = doses.filter((d) => d.state !== 'pending').length
  const check = toCheck(meds).length
  const sub = doses.length ? `${done} of ${doses.length} doses today${check ? ` · ${check} to check` : ''}` : meds.some(isLive) ? `Nothing due today${check ? ` · ${check} to check` : ''}` : 'No medicines yet'
  return (
    <a className="card hv-explore md-summary" href="#health/meds" data-testid="meds-summary">
      <span>Medicines<small>{sub}</small></span>
    </a>
  )
}
