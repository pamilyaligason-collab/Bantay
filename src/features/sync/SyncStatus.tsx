import { liveQuery } from 'dexie'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSyncState, subscribeSync, syncCounts } from './sync'

export interface Counts { waiting: number; unknown: number; dead: number }

/** Pure so it can be tested: the one line a person reads. Empty until the first sync check has finished. */
export function statusText(s: { ready: boolean; signedIn: boolean; offline: boolean }, c: Counts): string {
  if (!s.ready) return ''
  if (!s.signedIn) return 'Sign in to sync'
  const waiting = c.waiting + c.unknown // rows we will not send still are not safe on the server
  if (s.offline) return waiting ? `Offline, ${waiting} waiting` : 'Offline'
  if (c.dead) return `${c.dead} could not sync`
  return waiting ? `${waiting} waiting` : 'Synced'
}

const NONE: Counts = { waiting: 0, unknown: 0, dead: 0 }

/** Small text badge. Place it anywhere (for example under the page heading). */
export function SyncStatus() {
  const s = useSyncExternalStore(subscribeSync, getSyncState)
  const [c, setC] = useState<Counts>(NONE)
  useEffect(() => {
    // outbox and kv (dead letters) both change the counts
    const sub = liveQuery(() => syncCounts()).subscribe({ next: setC, error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  return (
    <p role="status" className="sync-status" style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink2)' }}>
      {statusText(s, c)}
    </p>
  )
}
