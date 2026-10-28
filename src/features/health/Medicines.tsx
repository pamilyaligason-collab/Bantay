import { liveQuery } from 'dexie'
import { useEffect, useMemo, useRef, useState } from 'react'
import { shortMedName } from './medName'
import { ldb, logDose, type MedTaken, type Medication } from '../log/store'
import MedEditSheet, { type MedNote } from './MedEditSheet'
import { MedReview, toCheck } from './MedReview'
import { clock12, setMedStatus } from './medActions'
import { useSelf } from '../sos/useSelf'
import { JackArt } from '../look'
import { lastDays } from '../today/myWeekLogic'
import { stockInfo, weekCounter } from './medDetailLogic'
import { answeredBy, dayOf, isLive, matchDoses, parseSchedule, slotsFor, type DoseState } from './meds'
import { QueuedBadge } from '../sync/OfflineBar'
import { useQueuedDoseIds } from '../sync/useOffline'
import { useMedicationRows } from './useMedicationRows'
import './health.css'
import './medicines.css'
import { Icon } from '../shell/Icon'

const NONE: MedTaken[] = []
const TOAST_MS = 3500
const UNDO_MS = 6000

/** Doses logged since `day` (the start of the 7-day window) for one person, live. Full rows: the medication id, slot and skipped flag decide what is taken. */
function useTakesSince(personId: string, day: string): MedTaken[] {
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
/** "Taken 8:12 AM", or "Taken 8:12 AM · marked by Joy" when someone else marked it (the server stamps their first name; nothing is shown for the owner). */
const takenText = (t: MedTaken) => `Taken ${timeOf(t.takenAt)}${t.markedByName ? ` · marked by ${t.markedByName}` : ''}`
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
  const week = useTakesSince(personId, lastDays(new Date())[0]!)
  const takes = useMemo(() => week.filter((t) => dayOf(t.takenAt) === day), [week, day])
  const doses = useMemo(() => matchDoses(slotsFor(meds ?? [], personId, day), takes, day), [meds, personId, day, takes])
  return { meds, takes, week, doses, day }
}

/** Health > Medicines for one person: Today (Take / Skip), Active, Paused, Past, and Add.
 *  `canMark`: this person, or a writer carer (the server takes a dose from them). `canEdit`: also an admin (records_editor). */
export function Medicines({ personId, mine, canMark = mine, canEdit = canMark }: { personId: string; mine?: boolean; canMark?: boolean; canEdit?: boolean }) {
  const { meds, takes, week, doses } = useToday(personId)
  const self = useSelf() // a carer answering for someone else is recorded by name ("Answered by Lloyd")
  const queued = useQueuedDoseIds()
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
  const weekLine = meds ? weekCounter({ meds, takes: week, personId, now: new Date() }) : null
  const idOf = (m: Medication) => m.serverId ?? m.clientId ?? String(m.id)
  const empty = meds !== undefined && live.length + paused.length + past.length === 0

  return (
    <section aria-label="Medicines" className="md">
      {canEdit && (
        <div className="md-addrow">
          <button type="button" className="md-add" onClick={() => open()}><Icon name="plus" size={18} />Add</button>
        </div>
      )}
      {empty && (
        <div className="grp"><div className="row md-empty"><JackArt name="medicine" size={88} className="md-jack" /><span className="grow">No medicines yet<span className="sub">{canEdit ? 'Tap Add to put one in, or confirm a prescription in Health > Papers.' : 'Nothing has been added for them yet.'}</span></span></div></div>
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
                    <strong>{label({ name: shortMedName(d.name), strength: meds?.find((m) => (m.serverId ?? m.clientId ?? String(m.id)) === d.key)?.strength })}</strong>
                    <span className="sub">{d.state === 'taken' ? (t ? takenText(t) : 'Taken') : d.state === 'skipped' ? 'Skipped' : 'Not yet'}</span>
                  </span>
                  {t?.id != null && queued.has(t.id) && <QueuedBadge />}
                  {d.state === 'taken' && <span className="hv-done"><Icon name="check" size={18} /> Taken</span>}
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

      {weekLine && <p className="sub md-weekline" data-testid="meds-week">{weekLine}</p>}

      {live.length > 0 && (
        <>
          <div className="md-sech"><h2 className="hd">Active</h2><span className="sub">{live.length}</span></div>
          <div className="grp" data-testid="meds-active">
            {live.map((m) => {
              const s = parseSchedule(m.schedule)
              const answered = answeredBy(m)
              const stock = stockInfo(m, new Date())
              return (
                <div className="md-li" key={m.clientId ?? m.serverId ?? m.id} data-med={m.name}>
                  <a className="md-medrow md-link" href={`#health/med/${idOf(m)}`}>
                    <span className="md-lmain">
                      <strong>{label(m)}</strong>
                      <span className="md-chips">
                        {s.times.map((t) => <span className="md-tag" key={t}>{clock12(t)}</span>)}
                        {m.asNeeded && <span className="md-tag">As needed</span>}
                        {s.needsTime && !m.asNeeded && <span className="md-tag warn">Set a time</span>}
                        {s.needsCheck && <span className="md-tag warn">Check the name</span>}
                      </span>
                      {stock.kind !== 'as-needed' && <span className="md-sub" data-testid="med-stock-line">{stock.line}</span>}
                      {answered && <span className="md-sub" data-testid="answered-by">Answered by {answered}</span>}
                    </span>
                    {stock.chip && <span className={`md-tag${stock.low ? ' warn' : ''}`} data-testid="med-days">{stock.chip}</span>}
                    <Icon name="chev" size={20} />
                  </a>
                  {canEdit && s.review && <MedReview med={m} onChange={() => open(m)} onNote={say} by={mine ? undefined : self.name} />}
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
                <a className="grow md-main md-plink" href={`#health/med/${idOf(m)}`}><strong>{label(m)}</strong><span className="sub">Paused, no reminders</span></a>
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
                <a className="grow md-main md-plink" href={`#health/med/${idOf(m)}`}><strong>{label(m)}</strong><span className="sub">{m.stoppedOn ? `Stopped ${new Date(`${m.stoppedOn}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : 'Stopped'}</span></a>
                <a className="md-pill md-link" aria-label={`Open ${m.name}`} href={`#health/med/${idOf(m)}`}>Open</a>
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
      <Icon name="pill" tone="medicine" boxed />
      <span className="grow">Medicines<small>{sub}</small></span>
      <Icon name="chev" size={20} />
    </a>
  )
}
