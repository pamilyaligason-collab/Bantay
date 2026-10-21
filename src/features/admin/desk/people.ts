import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'

/** Everyone in the family as the admin sees them. Needs `people_admin_read` (0021); before it, RLS returns only the admin's own and created rows. */
export type DeskPerson = { id: string; display_name: string; auth_user_id: string | null; photo_path: string | null; /** set when an admin archived the person (0022); null or absent = active */ archived_at?: string | null }

export async function loadPeople(): Promise<DeskPerson[]> {
  if (!supabase) return []
  let { data, error } = (await supabase.from('people').select('id, display_name, auth_user_id, photo_path, archived_at').order('display_name')) as { data: DeskPerson[] | null; error: unknown }
  // shortcut: a server before migration 0022 has no archived_at, so retry without it; drop this once 0022 is live everywhere.
  if (error) ({ data, error } = (await supabase.from('people').select('id, display_name, auth_user_id, photo_path').order('display_name')) as { data: DeskPerson[] | null; error: unknown })
  if (error) throw new Error('not_connected')
  return data ?? []
}

export function useDeskPeople() {
  const [people, setPeople] = useState<DeskPerson[] | null>(null)
  const [error, setError] = useState(false)
  const reload = () => { setError(false); loadPeople().then(setPeople, () => setError(true)) }
  useEffect(reload, [])
  return { people, error, reload, nameOf: (id: string | null | undefined) => people?.find((p) => p.id === id)?.display_name ?? 'Unknown' }
}
