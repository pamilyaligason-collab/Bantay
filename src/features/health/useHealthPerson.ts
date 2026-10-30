import { useEffect, useMemo, useRef } from 'react'
import { useHealthData } from '../records/useHealthData'
import { useActing, useActingCan, useActingPersonId, useViewedVisibleIds } from '../viewas/viewAs'
import { canMarkFor, useWritableIds } from './useCanMark'

/** The Health data hook plus whether this user may write for the chosen person (themself, a writer carer, or an admin editing records).
 *  S16 (C-9): while an admin acts as a member the picker starts on that member, lists only people the member can see, and the log / edit rights are the acting ones (`ownId` stays the admin). */
export function useHealthPerson() {
  const d = useHealthData()
  const writable = useWritableIds(d.member?.userId)
  const { acting } = useActing()
  const actingId = useActingPersonId()
  const can = useActingCan()
  const visible = useViewedVisibleIds()
  const { setPersonId, ownId } = d
  const was = useRef(false)
  useEffect(() => { // enter: land on the member; exit: back to the admin's own records
    if (acting && actingId) setPersonId(actingId)
    else if (was.current && ownId) setPersonId(ownId)
    was.current = acting
  }, [acting, actingId, ownId, setPersonId])
  const people = useMemo(() => (visible ? d.people.filter((p) => visible.has(p.id)) : d.people), [d.people, visible])
  const canMark = acting ? !!can?.log : canMarkFor(d.personId, d.ownId, writable)
  const canEdit = acting ? !!can?.edit : canMark || d.member?.role === 'admin'
  return { ...d, people, acting, canMark, canEdit, lockReason: acting ? can?.reason ?? null : null }
}
