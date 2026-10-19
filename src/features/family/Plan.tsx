import { useMemo, useState } from 'react'
import { dayKey, eventsOn, isMine, nextEvent, timeLabel, weekOf } from './events'
import FmAvatar from './FmAvatar'
import { NoteSheet, ItemSheet } from './PlanSheets'
import { useFamilyPeople } from './roster'
import { sortNotes } from './notes'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'
import { sortTasks, toggleTask } from './tasks'
import { usePlan } from './usePlan'
import './family.css'

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n
const longDay = (d: Date) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })

type Open = { t: 'item'; item: { kind: 'task'; item?: FamilyTask } | { kind: 'event'; item?: FamilyEvent } } | { t: 'note'; note?: FamilyNote }

/** Family > Plan (mockup v6): calendar week strip and agenda, tasks, notes. Everything is written on this phone first and synced later. */
export default function Plan() {
  const { tasks, events, notes } = usePlan()
  const { people, selfId } = useFamilyPeople()
  const [layer, setLayer] = useState<'family' | 'mine'>('family')
  const [day, setDay] = useState(() => dayKey(new Date()))
  const [open, setOpen] = useState<Open | null>(null)

  const mine = layer === 'mine'
  const evs = useMemo(() => events.filter((e) => !mine || isMine(e.personId, selfId)), [events, mine, selfId])
  const tks = useMemo(() => sortTasks(tasks.filter((t) => !mine || isMine(t.assigneePersonId, selfId))), [tasks, mine, selfId])
  const who = (id: string | null, all: string) => { const p = people.find((x) => x.id === id); return p ? first(p.name) : all }

  const selected = new Date(`${day}T00:00:00`)
  const week = weekOf(selected)
  const shift = (days: number) => setDay(dayKey(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + days)))
  const agenda = eventsOn(evs, day)
  const upcoming = nextEvent(evs, new Date())
  const done = tks.filter((t) => t.done).length

  return (
    <>
      <div className="fm-top">
        <div className="seg" role="group" aria-label="Calendar layer">
          <button type="button" aria-pressed={!mine} onClick={() => setLayer('family')}>Family</button>
          <button type="button" aria-pressed={mine} onClick={() => setLayer('mine')}>Mine</button>
        </div>
        <button type="button" className="pill primary" onClick={() => setOpen({ t: 'item', item: { kind: 'event' } })}>+ Add</button>
      </div>

      <section className="fm-cal" aria-label="Calendar">
        <div className="fm-cal-h">
          <button type="button" className="fm-nav" aria-label="Previous week" onClick={() => shift(-7)}>‹</button>
          <b>{selected.toLocaleDateString([], { month: 'long', year: 'numeric' })}</b>
          <button type="button" className="fm-nav" aria-label="Next week" onClick={() => shift(7)}>›</button>
        </div>
        <div className="fm-week" role="group" aria-label="This week">
          {week.map((d) => {
            const k = dayKey(d)
            return (
              <button type="button" key={k} aria-pressed={k === day} aria-label={`${longDay(d)}${eventsOn(evs, k).length ? ', has plans' : ''}`} onClick={() => setDay(k)}>
                <small>{d.toLocaleDateString([], { weekday: 'short' })}</small>
                <b>{d.getDate()}</b>
                {eventsOn(evs, k).length > 0 && <i />}
              </button>
            )
          })}
        </div>
      </section>

      <div className="card fm-list" aria-label={`Plans for ${longDay(selected)}`}>
        {agenda.length === 0 && <p className="sub fm-empty">Nothing planned on {longDay(selected)}.</p>}
        {agenda.map((e) => (
          <button type="button" key={e.clientId} className="fm-item" onClick={() => setOpen({ t: 'item', item: { kind: 'event', item: e } })}>
            <span className="fm-tm">{timeLabel(e)}</span>
            <span className="grow"><b>{e.title}</b><span className="sub">{who(e.personId, 'Whole family')}</span></span>
          </button>
        ))}
      </div>
      {upcoming && <p className="sub fm-coming">Coming up: {longDay(new Date(upcoming.startsAt))}{upcoming.allDay ? '' : ` ${timeLabel(upcoming)}`}, {upcoming.title}</p>}

      <div className="sec-h"><b>Tasks</b><span className="sub">{tks.length ? `${done} of ${tks.length} done` : 'None yet'}</span></div>
      <div className="card fm-list">
        {tks.length === 0 && <p className="sub fm-empty">Nothing to do. Tap Add to make a task.</p>}
        {tks.map((t) => {
          const p = people.find((x) => x.id === t.assigneePersonId)
          const due = t.due ? longDay(new Date(`${t.due}T00:00:00`)) : null
          return (
            <div key={t.clientId} className="fm-task">
              <button type="button" className="chk" role="checkbox" aria-checked={t.done} aria-label={t.title} onClick={() => void toggleTask(t)} />
              <button type="button" className="fm-item grow" onClick={() => setOpen({ t: 'item', item: { kind: 'task', item: t } })}>
                <span className="grow"><b className={t.done ? 'done' : ''}>{t.title}</b><span className="sub">{[p ? first(p.name) : 'Everyone', due].filter(Boolean).join(' · ')}</span></span>
              </button>
              {p && <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={28} />}
            </div>
          )
        })}
      </div>

      <div className="sec-h"><b>Notes</b><button type="button" className="link" onClick={() => setOpen({ t: 'note' })}>New note</button></div>
      {notes.length === 0 ? (
        <div className="card"><p className="sub fm-empty">No notes. Keep the Wi-Fi password or the gate code here.</p></div>
      ) : (
        <div className="fm-notes">
          {sortNotes(notes).map((n) => {
            const [head, ...rest] = n.body.split('\n')
            return (
              <button type="button" key={n.clientId} className={`fm-note${n.pinned ? ' pinned' : ''}`} onClick={() => setOpen({ t: 'note', note: n })}>
                <span className="sub">{n.pinned ? 'Pinned' : 'Note'}</span>
                <b>{head}</b>
                {rest.join(' ').trim() && <span className="sub fm-clip">{rest.join(' ')}</span>}
              </button>
            )
          })}
        </div>
      )}

      {open?.t === 'item' && <ItemSheet start={open.item} day={day} people={people} onClose={() => setOpen(null)} />}
      {open?.t === 'note' && <NoteSheet note={open.note} onClose={() => setOpen(null)} />}
    </>
  )
}
