import { useMemo, useState, type ReactNode } from 'react'
import { dayKey, isMine, timeLabel } from './events'
import { NoteSheet, ItemSheet } from './PlanSheets'
import { addDay, dayLabel, midSentence, dayRows, dayStrip, emptyHint, groupPlan, progressOf, type PlanRow } from './planList'
import { useFamilyPeople } from './roster'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'
import { toggleTask } from './tasks'
import { usePlan } from './usePlan'
import './family.css'
import './plan.css'

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n
type View = string // a yyyy-mm-dd day, or 'later' / 'done'
const EMPTY = { later: 'Nothing planned for later.', done: 'Nothing done yet.' }

type Open = { t: 'item'; item: { kind: 'task'; item?: FamilyTask } | { kind: 'event'; item?: FamilyEvent } } | { t: 'note'; note?: FamilyNote }

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const EventIcon = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></Icon>
const NoteIcon = () => <Icon><path d="M6 3.5h9l3.5 3.5v13H6z" /><path d="M9 11h6M9 15h6" /></Icon>

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
          <button type="button" key={d.day} aria-pressed={view === d.day} aria-label={`${d.dow} ${d.num}${d.today ? ', today' : ''}, ${d.open === 0 ? 'nothing open' : `${d.open} open`}`} onClick={() => setView(d.day)}>
            <small aria-hidden="true">{d.dow}</small>
            <b aria-hidden="true">{d.num}</b>
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
        <div className="card fm-teach">
          <b>{byDay ? `Nothing for ${midSentence(heading)}.` : EMPTY[view as 'later' | 'done']}</b>
          {view === 'done'
            ? <span className="sub">Ticked reminders and past events show up here.</span>
            : byDay && view < today
              ? <span className="sub">This day has passed. Overdue reminders show under Today.</span>
              : <button type="button" className="fm-linkbtn" onClick={add}>{byDay ? emptyHint(people) : 'Add something to look forward to.'}</button>}
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
                  : <span className={`fm-ico ${r.kind}`}>{r.kind === 'event' ? <EventIcon /> : <NoteIcon />}</span>}
                <button type="button" className="fm-item" onClick={() => openRow(r)}>
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add
        </button>
      </div>

      {open?.t === 'item' && <ItemSheet start={open.item} day={byDay ? addDay(view, today) : today} people={people} onClose={() => setOpen(null)} onNote={() => setOpen({ t: 'note' })} />}
      {open?.t === 'note' && <NoteSheet note={open.note} onClose={() => setOpen(null)} />}
    </>
  )
}
