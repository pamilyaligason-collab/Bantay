import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'

/** Everyone in the family as the admin sees them. Needs `people_admin_read` (0021); before it, RLS returns only the admin's own and created rows. */
export type DeskPerson = { id: string; display_name: string; auth_user_id: string | null; photo_path: string | null }

export async function loadPeople(): Promise<DeskPerson[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('people').select('id, display_name, auth_user_id, photo_path').order('display_name')
  if (error) throw new Error('not_connected')
  return (data ?? []) as DeskPerson[]
}

export function useDeskPeople() {
  const [people, setPeople] = useState<DeskPerson[] | null>(null)
  const [error, setError] = useState(false)
  const reload = () => { setError(false); loadPeople().then(setPeople, () => setError(true)) }
  useEffect(reload, [])
  return { people, error, reload, nameOf: (id: string | null | undefined) => people?.find((p) => p.id === id)?.display_name ?? 'Unknown' }
}
