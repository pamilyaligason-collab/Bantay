import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { fdb, type FamilyEvent, type FamilyNote, type FamilyTask } from './store'

/** Tasks, events and notes, live: a tick, an edit or a sync pull shows at once. */
export function usePlan() {
  const [tasks, setTasks] = useState<FamilyTask[]>([])
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [notes, setNotes] = useState<FamilyNote[]>([])
  useEffect(() => {
    const subs = [
      liveQuery(() => fdb.tasks.toArray()).subscribe({ next: setTasks, error: () => undefined }),
      liveQuery(() => fdb.events.toArray()).subscribe({ next: setEvents, error: () => undefined }),
      liveQuery(() => fdb.notes.toArray()).subscribe({ next: setNotes, error: () => undefined })
    ]
    return () => subs.forEach((s) => s.unsubscribe())
  }, [])
  return { tasks, events, notes }
}
