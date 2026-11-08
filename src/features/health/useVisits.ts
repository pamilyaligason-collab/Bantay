import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { visitList, type VisitList } from './visitsLogic'
import { vdb, type Appointment, type FollowUp } from './visitsStore'

const NA: Appointment[] = []
const NF: FollowUp[] = []

/** One person's visits and follow-ups, live from the synced tables (read only). `ready` is false until both tables have answered once, so a caller can hold a layout that depends on whether a visit exists. */
export function useVisitsState(personId: string): { list: VisitList; ready: boolean } {
  const [appts, setAppts] = useState<Appointment[] | null>(null)
  const [rx, setRx] = useState<FollowUp[] | null>(null)
  useEffect(() => {
    if (!personId) { setAppts(NA); setRx(NF); return }
    const a = liveQuery(() => vdb.appointments.where('personId').equals(personId).toArray()).subscribe({ next: setAppts, error: () => setAppts(NA) })
    const b = liveQuery(() => vdb.followUps.where('personId').equals(personId).toArray()).subscribe({ next: setRx, error: () => setRx(NF) })
    return () => { a.unsubscribe(); b.unsubscribe() }
  }, [personId])
  const list = useMemo(() => visitList(appts ?? NA, rx ?? NF, personId, new Date()), [appts, rx, personId])
  return { list, ready: appts !== null && rx !== null }
}

export const useVisits = (personId: string): VisitList => useVisitsState(personId).list
