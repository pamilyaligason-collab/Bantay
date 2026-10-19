import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { ldb } from '../log/store'
import { currentPersonId } from '../sensors/health'

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** Today's medicine takes logged for THIS phone's member only (sync also brings other family members' rows). */
export function useMyTakes() {
  const [taken, setTaken] = useState<{ name: string; takenAt: string }[]>([])
  useEffect(() => {
    let pid: string | null = null
    let rows: { personId: string; name: string; takenAt: string }[] = []
    const push = () => setTaken(pid ? rows.filter((r) => r.personId === pid) : [])
    void currentPersonId().then((p) => { pid = p; push() }, () => undefined)
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(startOfDay().toISOString()).toArray()).subscribe({ next: (r) => { rows = r; push() }, error: () => undefined })
    return () => sub.unsubscribe()
  }, [])
  return taken
}
