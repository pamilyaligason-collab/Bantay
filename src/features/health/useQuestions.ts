import { useEffect, useState } from 'react'
import { db } from '../../db'

/** The question list saved for a person's next visit (kv visits.questions.<id>, written by Visits). */
export function useQuestions(personId: string): string[] {
  const [qs, setQs] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void db.kv.get(`visits.questions.${personId}`).then((r) => { if (live) setQs(Array.isArray(r?.value) ? (r!.value as unknown[]).filter((x): x is string => typeof x === 'string') : []) }).catch(() => undefined)
    return () => { live = false }
  }, [personId])
  return qs
}
