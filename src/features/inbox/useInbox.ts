import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPinRequests } from '../admin/api'
import { useQueue } from '../records/useRecordsServer'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { putKv, useKv } from '../safety/store'
import { useUpdate } from '../update/useUpdate'
import { SKIP_KEY } from '../today/heroCards'
import { useMyTakes } from '../today/useMyTakes'
import { useMedicationRows } from '../health/useMedicationRows'
import { useSelf } from '../sos/useSelf'
import { useFamilyPeople } from '../family/roster'
import { useAlertRows } from '../notify/useAlerts'
import { markAllSeen, markSeen } from '../notify/store'
import { buildInbox, countUnread } from './build'

const NO_ALERTS: Alert[] = []
const NO_NAMES: string[] = []
const NO_SKIP = { day: '', names: NO_NAMES }
const SEEN_KEY = 'notif.seen'

/** The inbox list, built from what is already on this phone (plus two admin lookups). Seen ids live in kv so the bell dot and the list agree. */
export function useInbox(isAdmin: boolean) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NO_ALERTS)
  const profile = useKv<string[]>('profile.medicines', NO_NAMES)
  const skip = useKv<{ day: string; names: string[] }>(SKIP_KEY, NO_SKIP)
  const seen = useKv<string[]>(SEEN_KEY, NO_NAMES)
  const { decision } = useUpdate()
  const queue = useQueue(isAdmin) // members never hit the records queue
  const taken = useMyTakes()
  const self = useSelf()
  const medications = useMedicationRows(self.personId, true) // undefined while loading: the inbox then waits on the old path instead of showing nothing as if there were no medicines
  const familyAlerts = useAlertRows()
  const { people } = useFamilyPeople()
  const nameOf = useCallback((id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? null : null), [people])
  const [pins, setPins] = useState<{ id: number; handle: string }[]>([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
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
    now, alerts, profile, taken, medications, personId: self.personId ?? undefined,
    skipped: skip.day === now.toDateString() ? skip.names : NO_NAMES,
    updateVersion: decision.kind === 'none' ? null : decision.latest.versionName,
    pins: isAdmin ? pins : [],
    toCheck: isAdmin ? queue.count : 0,
    familyAlerts, nameOf
  }), [now, alerts, profile, taken, medications, self.personId, skip, decision, pins, queue.count, isAdmin, familyAlerts, nameOf])
  const unread = countUnread(items, seen)
  const markAllRead = () => { void putKv(SEEN_KEY, items.filter((i) => i.kind !== 'family').map((i) => i.id)).catch(() => undefined); void markAllSeen().catch(() => undefined) }
  /** Opening a family row marks it seen (local first, then the server's seen_at). */
  const openRow = (rowId: string) => void markSeen(rowId).catch(() => undefined)
  return { items, unread, seen, markAllRead, openRow }
}
export type Inbox = ReturnType<typeof useInbox>
