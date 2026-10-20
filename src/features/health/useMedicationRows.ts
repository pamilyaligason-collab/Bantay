import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { ldb, type Medication } from '../log/store'

/** One person's medications rows, live. undefined until the first read, so callers can tell "still loading" from "none" (an empty list is a real answer). */
export function useMedicationRows(personId: string | null | undefined): Medication[] | undefined {
  const [rows, setRows] = useState<Medication[] | undefined>(undefined)
  useEffect(() => {
    setRows(undefined)
    if (!personId) return
    const sub = liveQuery(() => ldb.medications.where('personId').equals(personId).toArray()).subscribe({ next: setRows, error: () => setRows(undefined) })
    return () => sub.unsubscribe()
  }, [personId])
  return rows
}
