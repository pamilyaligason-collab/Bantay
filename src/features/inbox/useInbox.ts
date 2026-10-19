import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { listPinRequests } from '../admin/api'
import { ldb } from '../log/store'
import { useQueue } from '../records/useRecordsServer'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { putKv, useKv } from '../safety/store'
import { useUpdate } from '../update/useUpdate'
import { buildInbox, countUnread } from './build'

const NO_ALERTS: Alert[] = []
const NO_NAMES: string[] = []
const NO_SKIP = { day: '', names: NO_NAMES }
const SEEN_KEY = 'notif.seen'
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** The inbox list, built from what is already on this phone (plus two admin lookups). Seen ids live in kv so the bell dot and the list agree. */
export function useInbox(isAdmin: boolean) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NO_ALERTS)
  const profile = useKv<string[]>('profile.medicines', NO_NAMES)
  const skip = useKv<{ day: string; names: string[] }>('today.skipped', NO_SKIP)
  const seen = useKv<string[]>(SEEN_KEY, NO_NAMES)
  const { decision } = useUpdate()
  const queue = useQueue(isAdmin) // members never hit the records queue
  const [taken, setTaken] = useState<{ name: string; takenAt: string }[]>([])
  const [pins, setPins] = useState<{ id: number; handle: string }[]>([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(startOfDay().toISOString()).toArray()).subscribe({ next: setTaken, error: () => undefined })
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => { sub.unsubscribe(); clearInterval(t) }
  }, [])
  const [pinTick, setPinTick] = useState(0)
  const { refresh } = queue
  useEffect(() => {
    if (!isAdmin) return
    const again = () => { if (document.visibilityState === 'visible') { refresh(); setPinTick((t) => t + 1) } }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again) }
  }, [isAdmin, refresh])
  useEffect(() => {
    if (!isAdmin) return setPins([])
    let live = true
    void listPinRequests().then((r) => { if (live) setPins(r.ok ? r.data.map((p) => ({ id: p.id, handle: p.handle })) : []) })
    return () => { live = false }
  }, [isAdmin, pinTick])

  const items = useMemo(() => buildInbox({
    now, alerts, profile, taken,
    skipped: skip.day === now.toDateString() ? skip.names : NO_NAMES,
    updateVersion: decision.kind === 'none' ? null : decision.latest.versionName,
    pins: isAdmin ? pins : [],
    toCheck: isAdmin ? queue.count : 0
  }), [now, alerts, profile, taken, skip, decision, pins, queue.count, isAdmin])
  const unread = countUnread(items, seen)
  const markAllRead = () => void putKv(SEEN_KEY, items.map((i) => i.id)).catch(() => undefined)
  return { items, unread, seen, markAllRead }
}
export type Inbox = ReturnType<typeof useInbox>
