import { liveQuery } from 'dexie'
import { clockIn } from '../weather/forecast'
import { useEffect, useState } from 'react'
import { dayKey, eventDay } from '../family/events'
import { MASKED_APPT } from '../family/calendarLogic'
import { groupPlan } from '../family/planList'
import { fdb } from '../family/store'
import { useActingPersonId } from '../viewas/viewAs'
import type { HeroCard } from './heroCards'

/** The first open plan item for today (overdue tasks, today's tasks and events) as a Next up card, or null. Notes are not "next".
 *  Another person's event shows only as "Doctors & Lab Appointments" (D-109, Lloyd 2026-11-09); 'self' is the person on show (View-as follows the acting person); while unknown every personal event is masked. */
export async function planCard(now: Date, selfId: string | null = null): Promise<HeroCard | null> {
  const [tasks, events] = await Promise.all([fdb.tasks.toArray(), fdb.events.toArray()])
  const today = dayKey(now)
  // a timed event that started over an hour ago is no longer "next"
  const row = groupPlan(tasks, events, [], now).today.find((r) => r.kind === 'task' || (r.kind === 'event' && (r.event.allDay || eventDay(r.event) !== today || new Date(r.event.startsAt).getTime() > now.getTime() - 3_600_000)))
  if (!row || row.kind === 'note') return null
  if (row.kind === 'task') {
    return { key: `plan:${row.key}`, kind: 'plan', kicker: row.overdue ? 'Plan · overdue' : 'Plan · today', title: `Next: ${row.task.title}`, body: row.overdue ? 'This was due earlier' : 'Due today', actions: [{ id: 'plan', label: 'Open plan' }] }
  }
  const e = row.event
  const at = e.allDay || eventDay(e) !== today ? 'today' : clockIn(e.startsAt)
  return { key: `plan:${row.key}`, kind: 'plan', kicker: 'Plan · today', title: `Next: ${e.personId && e.personId !== selfId ? MASKED_APPT : e.title}`, body: at === 'today' ? 'On the calendar today' : `At ${at}`, actions: [{ id: 'plan', label: 'Open plan' }] }
}

export function usePlanCard(now: Date): HeroCard | null {
  const selfId = useActingPersonId()
  const [card, setCard] = useState<HeroCard | null>(null)
  const minute = Math.floor(now.getTime() / 60_000)
  useEffect(() => {
    const sub = liveQuery(() => planCard(new Date(minute * 60_000), selfId)).subscribe({ next: setCard, error: () => undefined })
    return () => sub.unsubscribe()
  }, [minute, selfId])
  return card
}
