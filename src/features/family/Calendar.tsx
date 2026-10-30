import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { slotsFor } from '../health/meds'
import { vdb, type Appointment } from '../health/visitsStore'
import { ldb, type Medication } from '../log/store'
import { Icon } from '../shell/Icon'
import { useActing, useActingCan, useViewedVisibleIds } from '../viewas/viewAs'
import { KIND, kindsOn, monthCells, monthName, rowsOn, weekSun, type CalSource } from './calendarLogic'
import { dayKey } from './events'
import { addDay, dayLabel, emptyHint } from './planList'
import { ItemSheet, NoteSheet } from './PlanSheets'
import { useFamilyPeople } from './roster'
import { usePlan } from './usePlan'
import './family.css'

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
  const { people } = useFamilyPeople()
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
  const [open, setOpen] = useState<'item' | 'note' | null>(null)
  const ok = (id: string | null) => !visible || !id || visible.has(id)
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
  const locked = acting && !can?.edit
  const dots = (day: string) => kindsOn(day, src, today)
  const cell = (day: string, num: number, label: string, extra?: string) => {
    const k = dots(day)
    return (
      <button type="button" key={day} className={`fm2-d${extra ? ' ' + extra : ''}`} aria-pressed={sel === day} data-today={day === today || undefined} onClick={() => setSel(day)}>
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
        {rows.map((r) => (
          <li key={r.key} data-kind={r.kind}>
            <span className="grow"><b className={r.done ? 'done' : ''}>{r.title}</b><span className="sub">{r.sub}</span></span>
            <span className="fm2-tag" data-hue={KIND[r.kind].hue}><Icon name={KIND[r.kind].icon} size={16} />{KIND[r.kind].label}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="fm2-none sub">{sel < today ? `Nothing on ${dayLabel(sel, now)}.` : emptyHint(readable)}</li>}
      </ul>
      <div className="fm2-two">
        {locked
          ? <button type="button" className="btn2" disabled aria-label="Add, view only"><Icon name="lock" size={20} />View only</button>
          : <button type="button" className="btn2" onClick={() => setOpen('item')}><Icon name="plus" size={20} />Add</button>}
        <a className="btn2" href="#family/plan">Full plan</a>
      </div>
      {open === 'item' && <ItemSheet start={{ kind: 'task' }} day={addDay(sel, today)} people={readable} onClose={() => setOpen(null)} onNote={() => setOpen('note')} />}
      {open === 'note' && <NoteSheet onClose={() => setOpen(null)} />}
    </section>
  )
}
