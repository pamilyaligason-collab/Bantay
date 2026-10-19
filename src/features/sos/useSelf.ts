import { useMemo } from 'react'
import { loadFamily } from '../auth/family'
import { useSelfPersonId } from '../setup/useProfile'

/** This phone's person: id (cached offline) and the display name from the family cache on this phone. */
export function useSelf(): { personId: string | null; name: string } {
  const personId = useSelfPersonId()
  const name = useMemo(() => (personId ? loadFamily().find((f) => f.personId === personId)?.displayName ?? '' : ''), [personId])
  return { personId, name }
}
