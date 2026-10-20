import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { ldb, type Medication } from '../log/store'

const NONE: Medication[] = []

/** One person's medications rows (all statuses), live. Tombstoned rows are never stored locally. */
export function useMedications(personId: string): Medication[] {
  const [rows, setRows] = useState<Medication[]>(NONE)
  useEffect(() => {
    if (!personId) return setRows(NONE)
    const sub = liveQuery(() => ldb.medications.where('personId').equals(personId).toArray()).subscribe({ next: setRows, error: () => setRows(NONE) })
    return () => sub.unsubscribe()
  }, [personId])
  return rows
}
