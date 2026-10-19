import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { dayKey, eventDay } from '../family/events'
import { groupPlan } from '../family/planList'
import { fdb } from '../family/store'
import type { HeroCard } from './heroCards'

/** The first open plan item for today (overdue tasks, today's tasks and events) as a Next up card, or null. Notes are not "next". */
export async function planCard(now: Date): Promise<HeroCard | null> {
  const [tasks, events] = await Promise.all([fdb.tasks.toArray(), fdb.events.toArray()])
  const today = dayKey(now)
  // a timed event that started over an hour ago is no longer "next"
  const row = groupPlan(tasks, events, [], now).today.find((r) => r.kind === 'task' || (r.kind === 'event' && (r.event.allDay || eventDay(r.event) !== today || new Date(r.event.startsAt).getTime() > now.getTime() - 3_600_000)))
  if (!row || row.kind === 'note') return null
  if (row.kind === 'task') {
    return { key: `plan:${row.key}`, kind: 'plan', kicker: row.overdue ? 'Plan · overdue' : 'Plan · today', title: `Next: ${row.task.title}`, body: row.overdue ? 'This was due earlier' : 'Due today', actions: [{ id: 'plan', label: 'Open plan' }] }
  }
  const e = row.event
  const at = e.allDay || eventDay(e) !== today ? 'today' : new Date(e.startsAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  return { key: `plan:${row.key}`, kind: 'plan', kicker: 'Plan · today', title: `Next: ${e.title}`, body: at === 'today' ? 'On the calendar today' : `At ${at}`, actions: [{ id: 'plan', label: 'Open plan' }] }
}

export function usePlanCard(now: Date): HeroCard | null {
  const [card, setCard] = useState<HeroCard | null>(null)
  const minute = Math.floor(now.getTime() / 60_000)
  useEffect(() => {
    const sub = liveQuery(() => planCard(new Date(minute * 60_000))).subscribe({ next: setCard, error: () => undefined })
    return () => sub.unsubscribe()
  }, [minute])
  return card
}
