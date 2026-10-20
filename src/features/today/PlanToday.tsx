import { useEffect, useState } from 'react'
import { dayKey, eventDay } from '../family/events'
import { toggleTask } from '../family/tasks'
import { usePlan } from '../family/usePlan'
import type { FamilyEvent, FamilyTask } from '../family/store'
import { Icon } from '../shell/Icon'

const SHOW = 4
export type PlanRow = { key: string; title: string; time: string; task?: FamilyTask; event?: FamilyEvent; sort: string }

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** Today's tasks (including overdue ones still open) and events, soonest first. Ticked tasks stay in the list so "N of M done" holds. */
export function todayRows(tasks: FamilyTask[], events: FamilyEvent[], now: Date): { rows: PlanRow[]; done: number; total: number } {
  const today = dayKey(now)
  const t = tasks.filter((x) => x.due === today || (!x.done && x.due != null && x.due < today))
  const rows: PlanRow[] = [
    ...t.map((task) => ({ key: task.clientId, title: task.title, time: task.due! < today ? 'Overdue' : '', task, sort: `${task.due! < today ? '0' : '1'} ${task.title}` })),
    ...events.filter((e) => eventDay(e) === today).map((event) => ({ key: event.clientId, title: event.title, time: event.allDay ? 'All day' : hhmm(event.startsAt), event, sort: `2 ${event.allDay ? '00:00' : new Date(event.startsAt).toTimeString().slice(0, 5)} ${event.title}` }))
  ].sort((a, b) => a.sort.localeCompare(b.sort))
  return { rows, done: t.filter((x) => x.done).length, total: t.length }
}

/** "Today's plan": a small checklist from the family plan, tick tasks off in place. Progress counts tasks; events show their time. */
export default function PlanToday() {
  const { tasks, events } = usePlan()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])
  const { rows, done, total } = todayRows(tasks, events, now)
  const [err, setErr] = useState('')
  const tick = (t: FamilyTask) => { setErr(''); void toggleTask(t).catch(() => setErr('Could not save that. Try again.')) }
  return (
    <section className="card td-plan" aria-labelledby="t-plan" data-reveal>
      <div className="td-row between">
        <h2 id="t-plan" className="td-sech">Today&apos;s plan</h2>
        <a className="td-link" href="#family/plan">{rows.length ? 'Open plan' : 'Add to plan'}</a>
      </div>
      {rows.length === 0 ? <p className="td-sub td-plan-empty">Nothing planned for today.</p> : (
        <>
          {total > 0 && (
            <>
              <p className="td-plan-n"><b>{done} of {total}</b> tasks done</p>
              <div className="td-bar" role="progressbar" aria-label="Tasks done today" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><i style={{ transform: `scaleX(${done / total})` }} /></div>
            </>
          )}
          <ul className="td-checklist">
            {rows.slice(0, SHOW).map((r) => (
              <li key={r.key} className={r.task?.done ? 'done' : ''}>
                {r.task ? (
                  <button type="button" className="td-chk" role="checkbox" aria-checked={r.task.done} aria-label={r.title} onClick={() => tick(r.task!)}>
                    <Icon name="check" size={16} stroke={3} />
                  </button>
                ) : <span className="td-dot" aria-hidden="true" />}
                <span className="td-grow"><span className="td-ttl">{r.title}</span></span>
                {r.time && <span className={`td-time${r.time === 'Overdue' ? ' late' : ''}`}>{r.time}</span>}
              </li>
            ))}
          </ul>
          {rows.length > SHOW && <a className="td-link" href="#family/plan">{rows.length - SHOW} more in the plan</a>}
        </>
      )}
      {err && <p className="td-err" role="alert">{err}</p>}
    </section>
  )
}
