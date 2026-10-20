import { useEffect, useState } from 'react'
import { useFamilyPeople, type FamilyPerson } from '../family/roster'
import { useKv } from '../safety/store'
import { SELF_ID } from '../sync/profile'

const NONE = ''

/** Everyone in the family except me. "Me" is the signed-in person; when that is not resolved yet (offline start) the cached self id is used,
 *  so I am never counted as "someone else". Also returns a clock that ticks every minute, for lines that depend on the time of day. */
export function useOthers(): { others: FamilyPerson[]; now: Date } {
  const { people, selfId } = useFamilyPeople()
  const cached = useKv<string>(SELF_ID, NONE)
  const me = selfId ?? (cached || null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return { others: people.filter((p) => !p.isMe && p.id !== me), now }
}
