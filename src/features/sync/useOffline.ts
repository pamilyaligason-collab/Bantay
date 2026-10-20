import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../../db'

/** kv key written by sync.ts after each successful push and pull (ms): what an offline person is looking at is data from then. */
export const LAST_ONLINE_KEY = 'sync.lastPull'

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** "10:42 AM" in the family's time zone (the same 12-hour style as the rest of the app). */
export const clockText = (ms: number) => new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }).format(new Date(ms))

/** The one line of the offline bar. `since` is null when the phone has never recorded a time. */
export function offlineText(since: number | null): string {
  return since == null ? 'Offline · showing saved data · will sync' : `Offline · showing data from ${clockText(since)} · will sync`
}

/** Live: is the phone offline, and when did the last successful sync finish (null when there has been none on this phone). */
export function useOffline(): { offline: boolean; since: number | null } {
  const [offline, setOffline] = useState(isOffline)
  const [since, setSince] = useState<number | null>(null)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  useEffect(() => {
    if (!offline) return
    let live = true
    void db.kv.get(LAST_ONLINE_KEY).then((r) => { if (live) setSince(typeof r?.value === 'number' ? r.value : null) }).catch(() => undefined)
    return () => { live = false }
  }, [offline])
  return { offline, since }
}

/** Local ids (ldb.meds) of dose rows that are still in the outbox, i.e. not on the server yet. Live. */
export function useQueuedDoseIds(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(() => new Set())
  useEffect(() => {
    const sub = liveQuery(async () => {
      const rows = await db.outbox.where('table').equals('meds_taken').toArray()
      return rows.map((r) => (r.payload as { id?: unknown } | null)?.id).filter((x): x is number => typeof x === 'number')
    }).subscribe({ next: (l) => setIds(new Set(l)), error: () => undefined })
    return () => sub.unsubscribe()
  }, [])
  return ids
}
