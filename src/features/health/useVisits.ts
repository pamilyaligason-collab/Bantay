import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { visitList, type VisitList } from './visitsLogic'
import { vdb, type Appointment, type FollowUp } from './visitsStore'

const NA: Appointment[] = []
const NF: FollowUp[] = []

/** One person's visits and follow-ups, live from the synced tables (read only). */
export function useVisits(personId: string): VisitList {
  const [appts, setAppts] = useState(NA)
  const [rx, setRx] = useState(NF)
  useEffect(() => {
    if (!personId) { setAppts(NA); setRx(NF); return }
    const a = liveQuery(() => vdb.appointments.where('personId').equals(personId).toArray()).subscribe({ next: setAppts, error: () => setAppts(NA) })
    const b = liveQuery(() => vdb.followUps.where('personId').equals(personId).toArray()).subscribe({ next: setRx, error: () => setRx(NF) })
    return () => { a.unsubscribe(); b.unsubscribe() }
  }, [personId])
  return useMemo(() => visitList(appts, rx, personId, new Date()), [appts, rx, personId])
}
