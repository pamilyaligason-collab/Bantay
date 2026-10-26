import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { visibleAlerts, type AlertRow } from './store'

const NONE: AlertRow[] = []

/** Unexpired family alert rows, newest first, live (the store changes on Realtime, poll and seen marks; a minute tick hides rows as they expire). */
export function useAlertRows(): AlertRow[] {
  const [rows, setRows] = useState<AlertRow[]>(NONE)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const sub = liveQuery(() => visibleAlerts()).subscribe({ next: setRows, error: () => setRows(NONE) })
    return () => sub.unsubscribe()
  }, [tick])
  return rows
}

/** How many unexpired alerts are unseen: the badge on the Family tab. 0 until the first read. */
export function useUnseenAlerts(): number {
  return useAlertRows().filter((r) => r.seenAt == null).length
}
