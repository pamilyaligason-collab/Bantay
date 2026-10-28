import { liveQuery } from 'dexie'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ldb, type MedTaken, type Medication } from '../log/store'
import { useAlertRows } from '../notify/useAlerts'
import { useHealthData } from '../records/useHealthData'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { lastDays } from '../today/myWeekLogic'
import MedEditSheet, { type MedNote } from './MedEditSheet'
import { clock12, setMedStatus } from './medActions'
import { missNote, stockInfo, weekStrip, type CellState } from './medDetailLogic'
import { givenName } from './medName'
import { parseSchedule } from './meds'
import { CARER_AFTER_MIN } from './reminders'
import { canMarkFor, useWritableIds } from './useCanMark'
import './health.css'
import './medicines.css'

const NONE: MedTaken[] = []
const TOAST_MS = 3500
const UNDO_MS = 6000
const label = (m: Pick<Medication, 'name' | 'strength'>) => [m.name, m.strength].filter(Boolean).join(' ')
const GLYPH: Record<CellState, string> = { taken: '✓', missed: '×', 'not-due': '–', pending: '…' }
const SAYS: Record<CellState, string> = { taken: 'taken', missed: 'missed', 'not-due': 'not due', pending: 'not yet' }

/** The medications row for a route id (server id, else client id, else local id). undefined while loading, null when there is none (deleted or never here). */
function useMedById(id: string): Medication | null | undefined {
  const [med, setMed] = useState<Medication | null | undefined>(undefined)
  useEffect(() => {
    setMed(undefined)
    const sub = liveQuery(async () => (await ldb.medications.filter((m) => m.serverId === id || m.clientId === id || String(m.id) === id).first()) ?? null).subscribe({ next: setMed, error: () => setMed(null) })
    return () => sub.unsubscribe()
  }, [id])
  return med
}

/** Doses this person logged in the last 7 days, live. undefined until the first read, so the week never shows "0 taken" before the doses are in. */
function useWeekTakes(personId: string | undefined): MedTaken[] | undefined {
  const [got, setGot] = useState<{ id: string; rows: MedTaken[] } | undefined>(undefined)
  useEffect(() => {
    if (!personId) return
    const since = new Date(`${lastDays(new Date())[0]}T00:00:00`).toISOString()
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(since).filter((m) => m.personId === personId).toArray()).subscribe({ next: (rows) => setGot({ id: personId, rows }), error: () => setGot({ id: personId, rows: NONE }) })
    return () => sub.unsubscribe()
  }, [personId])
  return got && got.id === personId ? got.rows : undefined // rows read for another person never pass as this one's
}

const startedText = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : null)

/** One medicine (#health/med/<id>, mockup v8 health-meddetail): dose and times, who is alarmed, stock, the last 7 days, and the only door to the edit sheet.
 *  Edit and Pause follow the list's rule: the person, a writer carer or an admin. Anyone who can open the medicine can read it. */
export default function MedDetail({ medicationId }: { medicationId: string }) {
  const med = useMedById(medicationId)
  const { people, member, ownId } = useHealthData()
  const writable = useWritableIds(member?.userId)
  const takes = useWeekTakes(med?.personId)
  const alerts = useAlertRows()
  const [sheet, setSheet] = useState(false)
  const [note, setNote] = useState<MedNote | null>(null)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const say = (n: MedNote) => {
    window.clearTimeout(timer.current)
    setNote(n)
    timer.current = window.setTimeout(() => setNote(null), n.undo ? UNDO_MS : TOAST_MS)
  }
  const now = new Date()
  const week = useMemo(() => (med && takes ? weekStrip(med, takes, new Date()) : null), [med, takes])
  const toast = note && (
    <div className="toast md-toast" role="status">
      <span>{note.text}</span>
      {note.undo && <button type="button" className="md-undo" onClick={() => { note.undo?.(); say({ text: 'Back again.' }) }}>Undo</button>}
    </div>
  )

  if (med === undefined) return <SubHeader title="Medicine" backHref="#health/meds" backLabel="Back to Medicines" />
  if (med === null) {
    return (
      <>
        <SubHeader title="Medicine" backHref="#health/meds" backLabel="Back to Medicines" />
        <div className="card md-gone" data-testid="med-gone"><p className="hd">This medicine is not on the list</p><p className="sub">It may have been deleted. Go back to see the medicines that are here.</p></div>
        {toast}
      </>
    )
  }

  const canMark = canMarkFor(med.personId, ownId, writable)
  const canEdit = canMark || member?.role === 'admin'
  const person = people.find((p) => p.id === med.personId)
  const who = med.personId === ownId ? 'Your' : person ? `${givenName(person.name)}'s` : 'Their'
  const s = parseSchedule(med.schedule)
  const status = med.medStatus ?? 'active'
  const stock = stockInfo(med, now)
  const times = s.times.map(clock12)
  const when = med.asNeeded ? 'As needed, when you need it' : times.length ? `Every day at ${times.join(', ')}` : 'No time set yet'
  const miss = week ? missNote(week.cells, alerts, med) : null
  const resume = () => void setMedStatus(med, 'active').then(() => say({ text: `${med.name} resumed. Reminders are back on.` })).catch(() => say({ text: 'Could not save on this phone. Try again.' }))
  const pause = () => void setMedStatus(med, 'paused').then(() => say({ text: `${med.name} paused. Reminders are off.` })).catch(() => say({ text: 'Could not save on this phone. Try again.' }))
  const started = startedText(med.startedOn)

  return (
    <section aria-label={label(med)} className="md md-detail">
      <SubHeader title={label(med)} backHref="#health/meds" backLabel="Back to Medicines" />
      <p className="sub md-eyebrow">{who} medicine{med.origin === 'rx' ? ' · from a prescription' : ''}</p>

      <div className="card md-facts" data-testid="med-facts">
        <div className="md-dl"><span>Dose</span><b>{med.dose || 'Not set'}</b></div>
        <div className="md-dl"><span>When</span><b>{when}</b></div>
        {started && <div className="md-dl"><span>Started</span><b>{started}</b></div>}
        {status === 'stopped' && <div className="md-dl"><span>Status</span><b>Stopped{med.stoppedOn ? ` ${startedText(med.stoppedOn)}` : ''}</b></div>}
        {canEdit && <div><button type="button" className="md-pill" onClick={() => setSheet(true)}>Edit</button></div>}
      </div>

      {status === 'paused' && (
        <div className="card md-paused" role="note">
          <span className="grow"><b>Reminders are paused</b><span className="sub md-sub">No alarms until you resume.</span></span>
          {canEdit && <button type="button" className="md-pill" onClick={resume}>Resume</button>}
        </div>
      )}

      {status === 'active' && !med.asNeeded && times.length > 0 && (
        <>
          <div className="md-sech"><h2 className="hd">Reminders</h2></div>
          <div className="card md-rem" data-testid="med-reminders">
            <div className="md-phone"><Icon name="phone" size={22} /><span className="grow"><b>{who} phone</b><span className="sub md-sub">Rings at {times.join(', ')}, with Taken and Snooze</span></span></div>
            <div className="md-phone"><Icon name="bell" size={22} /><span className="grow"><b>The family</b><span className="sub md-sub">Told in the app after about {CARER_AFTER_MIN} minutes with no answer</span></span></div>
          </div>
          <p className="sub md-help">Dose alarms ring in the Android app. On an iPhone or the web version, only the in-app alert to the carer works.</p>
          {canEdit && <button type="button" className="md-pill md-block" onClick={pause}>Pause reminders</button>}
        </>
      )}

      <div className="card md-stock" data-testid="med-stock">
        <span className="grow">
          <span className="sub md-sub">Stock</span>
          <b className="md-big">{stock.kind === 'counted' ? `${stock.left} ${stock.unit} · ${stock.days === 0 ? 'runs out today' : `${stock.days} ${stock.days === 1 ? 'day' : 'days'} left`}` : stock.line}</b>
        </span>
        {stock.kind !== 'as-needed' && (
          <a className={`md-pill md-link${stock.low ? ' md-amber' : ''}`} href="#health/refill">{stock.kind === 'counted' ? 'Refill' : 'Set the count'}</a>
        )}
      </div>

      {week && status !== 'stopped' && !med.asNeeded && week.cells.some((c) => c.state !== 'not-due') && (
        <>
          <div className="md-sech"><h2 className="hd">Last 7 days</h2><span className="sub">{week.taken} of {week.due} taken</span></div>
          <div className="card md-week" data-testid="med-week">
            <ol className="md-strip">
              {week.cells.map((c) => (
                <li key={c.day} data-state={c.state} aria-label={`${c.label}: ${SAYS[c.state]}`}><span className="md-dn">{c.label}</span><i aria-hidden="true">{GLYPH[c.state]}</i></li>
              ))}
            </ol>
            <p className="sub md-legend">{'✓'} taken &nbsp; {'×'} missed &nbsp; {'–'} not due</p>
            {miss && <p className="sub md-miss" data-testid="med-miss">{miss}</p>}
          </div>
        </>
      )}

      {sheet && <MedEditSheet med={med} personId={med.personId} onClose={() => setSheet(false)} onNote={say} onOpen={(m) => { location.hash = `#health/med/${m.serverId ?? m.clientId ?? m.id}` }} />}
      {toast}
    </section>
  )
}
