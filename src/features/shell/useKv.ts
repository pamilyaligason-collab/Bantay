import { useCallback, useEffect, useState } from 'react'
import { db } from '../../db'

/** One Dexie kv value as React state. `loaded` is false until the first read finishes, so a screen can avoid flashing the default. */
export function useKv<T>(key: string, init: T): [T, (v: T) => void, boolean] {
  const [val, setVal] = useState<T>(init)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let live = true
    void db.kv.get(key).then((r) => { if (live) { if (r) setVal(r.value as T); setLoaded(true) } }, () => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [key])
  const set = useCallback((v: T) => { setVal(v); void db.kv.put({ key, value: v }).catch(() => undefined) }, [key])
  return [val, set, loaded]
}
