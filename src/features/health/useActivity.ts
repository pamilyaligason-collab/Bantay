import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { ldb } from '../log/store'
import type { Activity } from './model'

export const NO_ACTIVITY: Activity[] = [] // useActivity's state before its first query answers (every answer is a new array)
export type TakenToday = { name: string; takenAt: string }
const NO_TAKEN: TakenToday[] = []
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** One person's activity rows (steps, sleep, mood) from the last `days` days, live. */
export function useActivity(personId: string, days = 120): Activity[] {
  const [rows, setRows] = useState<Activity[]>(NO_ACTIVITY)
  useEffect(() => {
    if (!personId) return setRows(NO_ACTIVITY)
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const sub = liveQuery(() => ldb.activity.where('personId').equals(personId).filter((a) => a.startedAt >= since).toArray()).subscribe({ next: setRows, error: () => setRows(NO_ACTIVITY) })
    return () => sub.unsubscribe()
  }, [personId, days])
  return rows
}

/** Doses this person marked taken today, live. */
/** Skipped rows are not takes: they are left out unless `includeSkipped` (the new id-based screens read skips themselves). */
export function useTakenToday(personId: string, opts: { includeSkipped?: boolean } = {}): TakenToday[] {
  const includeSkipped = !!opts.includeSkipped
  const [rows, setRows] = useState<TakenToday[]>(NO_TAKEN)
  useEffect(() => {
    if (!personId) return setRows(NO_TAKEN)
    const since = startOfDay().toISOString()
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(since).filter((m) => m.personId === personId && (includeSkipped || !m.skipped)).toArray()).subscribe({ next: setRows, error: () => setRows(NO_TAKEN) })
    return () => sub.unsubscribe()
  }, [personId, includeSkipped])
  return rows
}
