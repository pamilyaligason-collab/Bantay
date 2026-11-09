import { useEffect, useState } from 'react'

/** The current time, refreshed just after each local midnight so a page left open overnight recomputes "today". */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    const id = setTimeout(() => setNow(new Date()), Math.max(1000, next.getTime() - Date.now()))
    return () => clearTimeout(id)
  }, [now])
  return now
}
