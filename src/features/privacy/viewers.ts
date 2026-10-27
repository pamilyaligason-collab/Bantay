import { supabase } from '../auth/client'

/** First names of the carers linked to this person (carers rows the person can read, then people.display_name for those users).
 *  null = could not tell (offline, no client): the screen then shows the generic line, never "nobody". */
export async function loadViewers(personId: string): Promise<string[] | null> {
  if (!supabase) return null
  try {
    const c = await supabase.from('carers').select('carer_id').eq('person_id', personId)
    if (c.error) return null
    const ids = ((c.data ?? []) as { carer_id: string }[]).map((r) => r.carer_id)
    if (!ids.length) return []
    const p = await supabase.from('people').select('display_name').in('auth_user_id', ids)
    if (p.error) return null
    const names = ((p.data ?? []) as { display_name: string | null }[]).map((r) => (r.display_name ?? '').trim()).filter(Boolean)
    return names.length === ids.length ? names : null // some name hidden from this phone: say nothing rather than a short list
  } catch { return null }
}

/** "Papa, Ate Joy" / "Papa, Ate Joy and Kuya Ben"; '' for none. */
export const joinNames = (n: string[]) => (n.length < 2 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)
