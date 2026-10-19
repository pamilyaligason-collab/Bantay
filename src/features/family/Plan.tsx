import { useMemo, useState, type ReactNode } from 'react'
import { dayKey, isMine, timeLabel } from './events'
import FmAvatar from './FmAvatar'
import { NoteSheet, ItemSheet } from './PlanSheets'
import { dayLabel, groupPlan, type PlanRow, type PlanTab } from './planList'
import { useFamilyPeople } from './roster'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'
import { toggleTask } from './tasks'
import { usePlan } from './usePlan'
import './family.css'
import './plan.css'

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n
const TABS: [PlanTab, string][] = [['today', 'Today'], ['week', 'This week'], ['later', 'Later'], ['done', 'Done']]
const EMPTY: Record<PlanTab, [string, string]> = {
  today: ['Nothing for today.', "Add a reminder for Lola's check-up."],
  week: ['Nothing else this week.', 'Add a family dinner or a pill refill.'],
  later: ['Nothing planned for later.', 'Add something to look forward to.'],
  done: ['Nothing done yet.', 'Ticked reminders and past events show up here.']
}

type Open = { t: 'item'; item: { kind: 'task'; item?: FamilyTask } | { kind: 'event'; item?: FamilyEvent } } | { t: 'note'; note?: FamilyNote }

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const EventIcon = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></Icon>
const NoteIcon = () => <Icon><path d="M6 3.5h9l3.5 3.5v13H6z" /><path d="M9 11h6M9 15h6" /></Icon>

/** Family > Plan: one list split into Today / This week / Later / Done. Reminders, events and notes sit together; one Add button. Written on this phone first, synced later. */
export default function Plan() {
  const { tasks, events, notes } = usePlan()
  const { people, selfId } = useFamilyPeople()
  const [layer, setLayer] = useState<'family' | 'mine'>('family')
  const [tab, setTab] = useState<PlanTab>('today')
  const [open, setOpen] = useState<Open | null>(null)

  const mine = layer === 'mine'
  const groups = useMemo(() => groupPlan(
    tasks.filter((t) => !mine || isMine(t.assigneePersonId, selfId)),
    events.filter((e) => !mine || isMine(e.personId, selfId)),
    notes,
    new Date()
  ), [tasks, events, notes, mine, selfId])
  const now = new Date()
  const rows = groups[tab]
  const personOf = (id: string | null) => people.find((x) => x.id === id) ?? null

  const line = (r: PlanRow) => {
    if (r.kind === 'note') return { sub: r.note.pinned ? 'Pinned note' : 'Note', p: null }
    const id = r.kind === 'task' ? r.task.assigneePersonId : r.event.personId
    const p = personOf(id)
    const whoTxt = p ? first(p.name) : r.kind === 'task' ? 'Everyone' : 'Whole family'
    const when = r.kind === 'event'
      ? `${dayLabel(r.day, now)}${r.event.allDay ? ', all day' : `, ${timeLabel(r.event)}`}`
      : r.day ? `${r.overdue ? 'Overdue, ' : ''}${dayLabel(r.day, now)}` : 'No date'
    return { sub: `${whoTxt} · ${when}`, p }
  }
  const openRow = (r: PlanRow) => setOpen(r.kind === 'note' ? { t: 'note', note: r.note } : { t: 'item', item: r.kind === 'task' ? { kind: 'task', item: r.task } : { kind: 'event', item: r.event } })

  return (
    <>
      <div className="seg fm-tabs" role="group" aria-label="Plan view">
        {TABS.map(([k, label]) => (
          <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}{k !== 'done' && groups[k].length > 0 && <small className="fm-n"> {groups[k].length}</small>}
          </button>
        ))}
      </div>
      <div className="fm-layer" role="group" aria-label="Whose plan">
        <button type="button" aria-pressed={!mine} onClick={() => setLayer('family')}>Family</button>
        <button type="button" aria-pressed={mine} onClick={() => setLayer('mine')}>Mine</button>
      </div>

      {rows.length === 0 ? (
        <div className="card fm-teach">
          <b>{EMPTY[tab][0]}</b>
          <span className="sub">{EMPTY[tab][1]}</span>
          {tab !== 'done' && <button type="button" className="pill primary" onClick={() => setOpen({ t: 'item', item: { kind: 'task' } })}>Add a reminder</button>}
        </div>
      ) : (
        <ul className="card fm-list fm-rows" aria-label={TABS.find(([k]) => k === tab)![1]}>
          {rows.map((r) => {
            const { sub, p } = line(r)
            const title = r.kind === 'task' ? r.task.title : r.kind === 'event' ? r.event.title : r.note.body.split('\n')[0]!
            const done = r.kind === 'task' && r.task.done
            return (
              <li key={r.key} className="fm-row">
                {r.kind === 'task'
                  ? <button type="button" className="fm-chk" role="checkbox" aria-checked={r.task.done} aria-label={r.task.title} onClick={() => void toggleTask(r.task)} />
                  : <span className={`fm-ico ${r.kind}`}>{r.kind === 'event' ? <EventIcon /> : <NoteIcon />}</span>}
                <button type="button" className="fm-item" onClick={() => openRow(r)}>
                  <span className="grow"><b className={done ? 'done' : ''}>{title}</b><span className={`sub${r.overdue ? ' fm-warn' : ''}`}>{sub}</span></span>
                </button>
                {p && <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={32} />}
              </li>
            )
          })}
        </ul>
      )}

      <div className="fm-fab-wrap">
        <button type="button" className="fm-fab" onClick={() => setOpen({ t: 'item', item: { kind: 'task' } })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add
        </button>
      </div>

      {open?.t === 'item' && <ItemSheet start={open.item} day={dayKey(new Date())} people={people} onClose={() => setOpen(null)} onNote={() => setOpen({ t: 'note' })} />}
      {open?.t === 'note' && <NoteSheet note={open.note} onClose={() => setOpen(null)} />}
    </>
  )
}
