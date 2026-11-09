import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { slotsFor } from '../health/meds'
import { vdb, type Appointment } from '../health/visitsStore'
import { ldb, type Medication } from '../log/store'
import { Icon } from '../shell/Icon'
import { useActing, useActingCan, useViewedVisibleIds } from '../viewas/viewAs'
import { KIND, kindsOn, monthCells, monthName, otherRows, rowsOn, weekSun, type CalRow, type CalSource } from './calendarLogic'
import { dayKey } from './events'
import { addDay, dayLabel, emptyHint } from './planList'
import { ItemSheet, NoteSheet } from './PlanSheets'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'
import { toggleTask } from './tasks'
import { useLinkedPeople } from './useFamilyScope'
import { usePlan } from './usePlan'
import './family.css'
import './plan.css'

type Open = { t: 'item'; item: { kind: 'task'; item?: FamilyTask } | { kind: 'event'; item?: FamilyEvent } } | { t: 'note'; note?: FamilyNote }

const NO_MEDS: Medication[] = []
const NO_APPTS: Appointment[] = []

/** Live rows from one Dexie query (the reads here are small, local copies). */
function useRows<T>(query: () => Promise<T[]>, none: T[], key: string): T[] {
  const [rows, setRows] = useState<T[]>(none)
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setRows, error: () => setRows(none) })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return rows
}

/** Calendar on the Family tab (P-4, F-12): the week strip is the default at every width, the month grid sits behind a Month toggle. The picked day lists doses, visits, events, tasks and notes, each tagged with an icon and a word.
 *  Readable members only (D-82): while acting as someone, only who they may see. */
export default function Calendar() {
  const { tasks, events, notes } = usePlan()
  const people = useLinkedPeople() // you and the people you are linked to (D-109), or while viewing as someone, who they can see
  const visible = useViewedVisibleIds()
  const { acting } = useActing()
  const can = useActingCan()
  const readable = useMemo(() => (visible ? people.filter((p) => visible.has(p.id)) : people), [people, visible])
  const ids = readable.map((p) => p.id)
  const key = ids.join(',')
  const meds = useRows(() => (ids.length ? ldb.medications.where('personId').anyOf(ids).toArray() : Promise.resolve(NO_MEDS)), NO_MEDS, key)
  const appts = useRows(() => (ids.length ? vdb.appointments.where('personId').anyOf(ids).toArray() : Promise.resolve(NO_APPTS)), NO_APPTS, key)
  const now = new Date()
  const today = dayKey(now)
  const [sel, setSel] = useState(today)
  const [month, setMonth] = useState(false)
  const [open, setOpen] = useState<Open | null>(null)
  const ok = (id: string | null) => !id || ids.includes(id) // a row tied to someone outside you and your links is hidden; family-wide rows (no person) stay
  const src: CalSource = useMemo(() => ({
    events: events.filter((e) => ok(e.personId)),
    tasks: tasks.filter((t) => ok(t.assigneePersonId)),
    notes,
    appts,
    doses: (day) => ids.flatMap((id) => slotsFor(meds, id, day).map((s) => ({ personId: id, name: s.name, dose: s.dose, slot: s.slot }))),
    nameOf: (id) => people.find((p) => p.id === id)?.name ?? 'Family'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [events, tasks, notes, appts, meds, people, key, visible])
  const selDate = new Date(`${sel}T00:00:00`)
  const rows = rowsOn(sel, src, today)
  const other = otherRows(src)
  const locked = acting && !can?.edit
  const openRow = (r: CalRow) => { // the same sheets the old Plan list opened: edit a task, event or note in place
    const id = r.key.slice(r.key.indexOf('|') + 1)
    if (r.kind === 'task') { const t = tasks.find((x) => x.clientId === id); if (t) setOpen({ t: 'item', item: { kind: 'task', item: t } }) }
    else if (r.kind === 'event') { const e = events.find((x) => x.clientId === id); if (e) setOpen({ t: 'item', item: { kind: 'event', item: e } }) }
    else if (r.kind === 'note') { const n = notes.find((x) => x.clientId === id); if (n) setOpen({ t: 'note', note: n }) }
  }
  const editable = (r: CalRow) => !locked && (r.kind === 'task' || r.kind === 'event' || r.kind === 'note')
  const line = (r: CalRow) => (
    <li key={r.key} data-kind={r.kind}>
      {r.kind === 'task' && !locked && <button type="button" className="fm-chk" role="checkbox" aria-checked={r.done} aria-label={r.title} onClick={() => { const t = tasks.find((x) => `task|${x.clientId}` === r.key); if (t) void toggleTask(t) }} />}
      {editable(r)
        ? <button type="button" className="fm-item press" onClick={() => openRow(r)}><span className="grow"><b className={r.done ? 'done' : ''}>{r.title}</b><span className="sub">{r.sub}</span></span></button>
        : <span className="grow"><b className={r.done ? 'done' : ''}>{r.title}</b><span className="sub">{r.sub}</span></span>}
      <span className="fm2-tag" data-hue={KIND[r.kind].hue}><Icon name={KIND[r.kind].icon} size={16} />{KIND[r.kind].label}</span>
    </li>
  )
  const dots = (day: string) => kindsOn(day, src, today)
  const cell = (day: string, num: number, label: string, extra?: string) => {
    const k = dots(day)
    return (
      <button type="button" key={day} className={`fm2-d${extra ? ' ' + extra : ''}`} aria-pressed={sel === day} aria-current={day === today ? 'date' : undefined} data-today={day === today || undefined} onClick={() => setSel(day)}>
        {label && <small>{label}</small>}
        <span>{num}</span>
        <i aria-hidden="true">{k.map((x) => <b key={x} data-hue={KIND[x].hue} />)}</i>
        <span className="fm-sr">{`${day === today ? ', today' : ''}, ${k.length ? `${rowsOn(day, src, today).length} things` : 'nothing planned'}`}</span>
      </button>
    )
  }
  return (
    <section className="card fm2-cal" data-testid="calendar" aria-label="Calendar">
      <div className="fm2-cal-h">
        <h2 className="fm2-h">Calendar · {monthName(selDate)}</h2>
        <button type="button" className="btn2 fm2-mon" aria-pressed={month} onClick={() => setMonth((m) => !m)}>{month ? 'Week' : 'Month'}</button>
      </div>
      {month ? (
        <div className="fm2-month" role="group" aria-label={`${monthName(selDate)} days`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <small key={d} className="fm2-dow">{d}</small>)}
          {monthCells(selDate).map((c) => cell(c.day, c.num, '', c.inMonth ? undefined : 'out'))}
        </div>
      ) : (
        <div className="fm2-week" role="group" aria-label="Days of this week">
          {weekSun(selDate).map((d) => cell(dayKey(d), d.getDate(), d.toLocaleDateString('en', { weekday: 'short' })))}
        </div>
      )}
      <ul className="fm2-day" aria-label={dayLabel(sel, now)}>
        {rows.map(line)}
        {rows.length === 0 && <li className="fm2-none sub">{sel < today ? `Nothing on ${dayLabel(sel, now)}.` : emptyHint(readable)}</li>}
      </ul>
      {other.length > 0 && (
        <>
          <h3 className="fm2-sub">No date</h3>
          <ul className="fm2-day" aria-label="Notes and reminders with no date" data-testid="cal-nodate">{other.map(line)}</ul>
        </>
      )}
      {locked
        ? <button type="button" className="btn2 fm2-add" disabled aria-label="Add, view only"><Icon name="lock" size={20} />View only</button>
        : <button type="button" className="btn2 fm2-add" onClick={() => setOpen({ t: 'item', item: { kind: 'task' } })}><Icon name="plus" size={20} />Add event, reminder or note</button>}
      {open?.t === 'item' && <ItemSheet start={open.item} day={addDay(sel, today)} people={readable} onClose={() => setOpen(null)} onNote={() => setOpen({ t: 'note' })} />}
      {open?.t === 'note' && <NoteSheet note={open.note} onClose={() => setOpen(null)} />}
    </section>
  )
}
