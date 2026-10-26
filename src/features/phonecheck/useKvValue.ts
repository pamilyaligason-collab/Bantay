import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../../db'

/** Live read of one kv row (undefined until it exists). Local only; the phone check never reads another person's data. */
export function useKvValue<T>(key: string): T | undefined {
  const [v, setV] = useState<T | undefined>(undefined)
  useEffect(() => {
    const sub = liveQuery(() => db.kv.get(key)).subscribe({ next: (r) => setV(r?.value as T | undefined), error: () => undefined })
    return () => sub.unsubscribe()
  }, [key])
  return v
}
