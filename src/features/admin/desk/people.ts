import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'

/** Everyone in the family as the admin sees them. Needs `people_admin_read` (0021); before it, RLS returns only the admin's own and created rows. */
export type DeskPerson = { id: string; display_name: string; auth_user_id: string | null; photo_path: string | null; /** set when an admin archived the person (0022); null or absent = active */ archived_at?: string | null; /** 'shared' = the shared family account (0046); it never gets a link. Absent before 0046. */ kind?: string | null }

export async function loadPeople(): Promise<DeskPerson[]> {
  if (!supabase) return []
  const cols = ['id, display_name, auth_user_id, photo_path, archived_at, kind', 'id, display_name, auth_user_id, photo_path, archived_at', 'id, display_name, auth_user_id, photo_path']
  let data: DeskPerson[] | null = null
  let error: unknown = true
  // shortcut: a server before migration 0046 has no kind and before 0022 no archived_at, so retry with fewer columns; drop this once both are live everywhere.
  for (const c of cols) {
    if (!error) break
    ;({ data, error } = (await supabase.from('people').select(c).order('display_name')) as unknown as { data: DeskPerson[] | null; error: unknown })
  }
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
