import { useMemo, useState } from 'react'
import { dayKey, isMine, timeLabel } from './events'
import { NoteSheet, ItemSheet } from './PlanSheets'
import { addDay, dayLabel, midSentence, dayRows, dayStrip, emptyHint, groupPlan, progressOf, type PlanRow } from './planList'
import { useFamilyPeople } from './roster'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'
import { toggleTask } from './tasks'
import { Icon } from '../shell/Icon'
import { EmptyState } from '../look'
import { usePlan } from './usePlan'
import './family.css'
import './plan.css'

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n
type View = string // a yyyy-mm-dd day, or 'later' / 'done'
const EMPTY = { later: 'Nothing planned for later.', done: 'Nothing done yet.' }

type Open = { t: 'item'; item: { kind: 'task'; item?: FamilyTask } | { kind: 'event'; item?: FamilyEvent } } | { t: 'note'; note?: FamilyNote }

/** Family > Plan: a Mon to Sun day strip, an "N of M completed" card and one list. Reminders, events and notes sit together; one floating Add. Written on this phone first, synced later. */
export default function Plan() {
  const { tasks, events, notes } = usePlan()
  const { people, selfId } = useFamilyPeople()
  const now = new Date()
  const today = dayKey(now)
  const [mine, setMine] = useState(false)
  const [view, setView] = useState<View>(today)
  const [open, setOpen] = useState<Open | null>(null)

  const groups = useMemo(() => groupPlan(
    tasks.filter((t) => !mine || isMine(t.assigneePersonId, selfId)),
    events.filter((e) => !mine || isMine(e.personId, selfId)),
    notes,
    new Date()
  ), [tasks, events, notes, mine, selfId])
  const strip = dayStrip(groups, now)
  const byDay = view !== 'later' && view !== 'done'
  const rows = view === 'later' ? groups.later : view === 'done' ? groups.done : dayRows(groups, view, now)
  const prog = byDay ? progressOf(rows) : { done: 0, total: 0 }
  const personOf = (id: string | null) => people.find((x) => x.id === id) ?? null
  const add = () => setOpen({ t: 'item', item: { kind: 'task' } })

  const line = (r: PlanRow) => {
    if (r.kind === 'note') return r.note.pinned ? 'Pinned note' : 'Note'
    const p = personOf(r.kind === 'task' ? r.task.assigneePersonId : r.event.personId)
    const who = p ? first(p.name) : r.kind === 'task' ? 'Everyone' : 'Whole family'
    const when = r.kind === 'task' && r.overdue ? `Overdue, ${dayLabel(r.day!, now)}` : !byDay && r.day ? dayLabel(r.day, now) : r.kind === 'task' && !r.day ? 'No date' : ''
    return when ? `${who} · ${when}` : who
  }
  const openRow = (r: PlanRow) => setOpen(r.kind === 'note' ? { t: 'note', note: r.note } : { t: 'item', item: r.kind === 'task' ? { kind: 'task', item: r.task } : { kind: 'event', item: r.event } })
  const heading = view === 'later' ? 'Later' : view === 'done' ? 'Done' : dayLabel(view, now)

  return (
    <>
      <div className="fm-days" role="group" aria-label="Day of this week">
        {strip.map((d) => (
          <button type="button" key={d.day} aria-pressed={view === d.day} onClick={() => setView(d.day)}>
            <small>{d.dow}</small>{' '}
            <b>{d.num}</b>
            <span className="fm-sr">{`${d.today ? ', today' : ''}, ${d.open === 0 ? 'nothing open' : `${d.open} open`}`}</span>
            {d.open > 0 && <i aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="fm-layer" role="group" aria-label="Filters">
        <button type="button" aria-pressed={mine} onClick={() => setMine((m) => !m)}>Mine only</button>
        <button type="button" aria-pressed={view === 'later'} onClick={() => setView(view === 'later' ? today : 'later')}>Later{groups.later.length > 0 && <small className="fm-n"> {groups.later.length}</small>}</button>
        <button type="button" aria-pressed={view === 'done'} onClick={() => setView(view === 'done' ? today : 'done')}>Done</button>
      </div>

      {prog.total > 0 && (
        <div className="card fm-prog">
          <b>{prog.done} of {prog.total} completed</b>
          <div className="fm-bar" role="progressbar" aria-label="Reminders completed" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done}><i style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="fm-empty-wrap">
          {view === 'done'
            ? <EmptyState icon="check" title={EMPTY.done} body="Ticked reminders and past events show up here." />
            : byDay && view < today
              ? <EmptyState icon="calendar" title={`Nothing for ${midSentence(heading)}.`} body="This day has passed. Overdue reminders show under Today." />
              : <EmptyState icon="calendar" title={byDay ? `Nothing for ${midSentence(heading)}.` : EMPTY.later} action={{ label: byDay ? emptyHint(people) : 'Add something to look forward to.', onClick: add }} />}
        </div>
      ) : (
        <ul className="card fm-list fm-rows" aria-label={heading}>
          {rows.map((r) => {
            const title = r.kind === 'task' ? r.task.title : r.kind === 'event' ? r.event.title : r.note.body.split('\n')[0]!
            const done = r.kind === 'task' && r.task.done
            return (
              <li key={r.key} className="fm-row">
                {r.kind === 'task'
                  ? <button type="button" className="fm-chk" role="checkbox" aria-checked={r.task.done} aria-label={r.task.title} onClick={() => void toggleTask(r.task)} />
                  : <Icon name={r.kind === 'event' ? 'calendar' : 'file'} tone={r.kind === 'event' ? 'family' : undefined} boxed size={18} />}
                <button type="button" className="fm-item press" onClick={() => openRow(r)}>
                  <span className="grow"><b className={done ? 'done' : ''}>{title}</b><span className={`sub${r.overdue ? ' fm-warn' : ''}`}>{line(r)}</span></span>
                  {r.kind === 'event' && <span className="fm-tm">{timeLabel(r.event)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="fm-fab-wrap">
        <button type="button" className="fm-fab" onClick={add}>
          <Icon name="plus" />
          Add
        </button>
      </div>

      {open?.t === 'item' && <ItemSheet start={open.item} day={byDay ? addDay(view, today) : today} people={people} onClose={() => setOpen(null)} onNote={() => setOpen({ t: 'note' })} />}
      {open?.t === 'note' && <NoteSheet note={open.note} onClose={() => setOpen(null)} />}
    </>
  )
}
