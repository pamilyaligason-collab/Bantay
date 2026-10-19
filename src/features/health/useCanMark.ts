import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'

/** Mirrors the meds_taken insert RLS (0003_sync.sql): is_self(person) or a carers row with can_write. App admin role does not count. */
export const canMarkFor = (personId: string, ownId: string, writableIds: readonly string[]) =>
  !!personId && (personId === ownId || writableIds.includes(personId))

/** Person ids the signed-in user is a can_write carer of. Empty when signed out or the request fails (then only "me" can mark). */
export function useWritableIds(userId: string | undefined): string[] {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    if (!supabase || !userId) { setIds([]); return }
    let live = true
    void Promise.resolve(supabase.from('carers').select('person_id').eq('carer_id', userId).eq('can_write', true))
      .then((r) => { if (live) setIds(((r.data ?? []) as { person_id: string }[]).map((x) => x.person_id)) })
      .catch(() => {})
    return () => { live = false }
  }, [userId])
  return ids
}
