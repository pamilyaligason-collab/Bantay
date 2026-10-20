import { useHealthData } from '../records/useHealthData'
import { canMarkFor, useWritableIds } from './useCanMark'

/** The Health data hook plus whether this user may write for the chosen person (themself, a writer carer, or an admin editing records). */
export function useHealthPerson() {
  const d = useHealthData()
  const writable = useWritableIds(d.member?.userId)
  const canMark = canMarkFor(d.personId, d.ownId, writable)
  return { ...d, canMark, canEdit: canMark || d.member?.role === 'admin' }
}
