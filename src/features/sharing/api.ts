import { supabase } from '../auth/client'

// Server sharing (migration 0037, D-80/D-82; 0046, D-109: links apply at once, no accept step). Every call tolerates supabase === null and never throws. Unknown is null, never an empty list (ML-05).
export interface Viewer { carerUserId: string; displayName: string; canWrite: boolean; addedByAdmin: boolean; addedAt: string | null }
export interface Candidate { carerUserId: string; personId: string; displayName: string }
/** 'added' = the link exists now, at once. 'updated' = the edit access (can_write) of an existing link changed. */
export type ShareResult = 'added' | 'updated' | 'removed' | 'unchanged' | 'offline' | 'refused' | 'limit'

/** The three plain-words errors the screens show. */
export const SHARE_COPY = {
  offline: 'No signal. Try again when you are online.',
  refused: 'You cannot change that.',
  limit: 'You changed sharing a lot. Try again in an hour.'
} as const

/** Shown to anyone who is not the family owner (or a writer carer) on a person's list or the owner list. */
export const NOT_OWNER = 'Only the family owner can open this page. If that is you, check your signal.'

export const shareCopy = (r: 'offline' | 'refused' | 'limit') => SHARE_COPY[r]

/** 42501 not allowed and 22023 bad target are refusals, 53400 is the hourly limit; anything else (no network, server down) is offline. */
export function failureOf(e: { code?: string } | null | undefined): 'offline' | 'refused' | 'limit' {
  const c = e?.code
  return c === '53400' ? 'limit' : c === '42501' || c === '22023' ? 'refused' : 'offline'
}

export async function setShare(personId: string, carerUserId: string, on: boolean, canWrite = false): Promise<ShareResult> {
  if (!supabase) return 'offline'
  try {
    const { data, error } = await supabase.rpc('share_set', { p_person: personId, p_carer: carerUserId, p_can_write: canWrite, p_on: on })
    if (error) return failureOf(error)
    return data === 'added' || data === 'updated' || data === 'removed' || data === 'unchanged' ? data : 'unchanged'
  } catch { return 'offline' }
}

type ViewerRow = { carer_user_id: string; display_name: string; can_write: boolean; added_by_admin: boolean; added_at: string | null }
/** Who can see this person's records (0046 person_viewers: the person on themself, the family owner, or a writer carer of a person with no login). null when unknown (ML-05); 'refused' when the server said no (42501, 22023). */
export async function personViewers(personId: string): Promise<Viewer[] | null | 'refused'> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('person_viewers', { p_person: personId })
    if (error) return failureOf(error) === 'refused' ? 'refused' : null
    if (!Array.isArray(data)) return null
    return (data as ViewerRow[]).map((r) => ({ carerUserId: r.carer_user_id, displayName: r.display_name, canWrite: r.can_write, addedByAdmin: r.added_by_admin, addedAt: r.added_at }))
  } catch { return null }
}

type CandidateRow = { carer_user_id: string; person_id: string; display_name: string }
/** Family members who could be allowed to see this person's records. null when unknown; 'refused' when the server said no. */
export async function shareCandidatesFor(personId: string): Promise<Candidate[] | null | 'refused'> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('share_candidates', { p_person: personId })
    if (error) return failureOf(error) === 'refused' ? 'refused' : null
    if (!Array.isArray(data)) return null
    return (data as CandidateRow[]).map((r) => ({ carerUserId: r.carer_user_id, personId: r.person_id, displayName: r.display_name }))
  } catch { return null }
}

type GridRow = { person_id: string; carer_user_id?: string; pending?: boolean }
/** How many people see each person: one per link row. A leftover pending offer is not a link, and neither is the owner's own row (the owner sees everyone without one, and is the writer carer of several people with no login), so "Only you" means no one else. */
export function countViewers(rows: GridRow[], ownerUserId: string | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) if (!r.pending && !(ownerUserId && r.carer_user_id === ownerUserId)) m.set(r.person_id, (m.get(r.person_id) ?? 0) + 1)
  return m
}
/** Owner list counts from admin_share_grid (one row per link), without the signed-in owner's own rows. null when unknown. */
export async function shareCounts(ownerUserId?: string | null): Promise<Map<string, number> | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('admin_share_grid')
    if (error || !Array.isArray(data)) return null
    return countViewers(data as GridRow[], ownerUserId)
  } catch { return null }
}
