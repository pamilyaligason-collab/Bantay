import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../../db'
import { ldb, type Medication } from '../log/store'

export const MEDS_CURSOR = 'sync.cursor.medications'

/** One person's medications rows, live. undefined until the first read, so callers can tell "still loading" from "none" (an empty list is a real answer).
 *  `trusted` (for readers that replace an older source, like Medical ID and the inbox): an empty list counts as unknown (undefined) until the medications
 *  pull has finished once on this phone, so a first empty read never hides medicines that are still on the old profile list. */
export function useMedicationRows(personId: string | null | undefined, trusted = false): Medication[] | undefined {
  const [rows, setRows] = useState<Medication[] | undefined>(undefined)
  useEffect(() => {
    setRows(undefined)
    if (!personId) return
    const sub = liveQuery(async () => {
      const list = await ldb.medications.where('personId').equals(personId).toArray()
      const pulled = list.length > 0 || !trusted || !!(await db.kv.get(MEDS_CURSOR))?.value
      return pulled ? list : undefined
    }).subscribe({ next: setRows, error: () => setRows(undefined) })
    return () => sub.unsubscribe()
  }, [personId, trusted])
  return rows
}
