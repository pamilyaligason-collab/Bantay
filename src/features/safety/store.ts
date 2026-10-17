import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../../db'

/** Live read of one kv row. `fallback` must be a stable value (module constant). */
export function useKv<T>(key: string, fallback: T): T {
  const [v, setV] = useState<T>(fallback)
  useEffect(() => {
    const sub = liveQuery(() => db.kv.get(key)).subscribe({ next: (r) => setV((r?.value as T) ?? fallback), error: () => {} })
    return () => sub.unsubscribe()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return v
}

export const putKv = (key: string, value: unknown) => db.kv.put({ key, value })
