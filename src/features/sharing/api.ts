import { supabase } from '../auth/client'
import { getMember } from '../auth/session'

// Server sharing (migration 0037, D-80/D-82). Every call tolerates supabase === null and never throws. Unknown is null, never an empty list (ML-05).
export interface Viewer { carerUserId: string; displayName: string; canWrite: boolean; pending: boolean; addedByAdmin: boolean; addedAt: string | null }
export interface Candidate { carerUserId: string; personId: string; displayName: string }
export interface Offer { personId: string; canWrite: boolean; addedAt: string | null }
export type ShareResult = 'pending' | 'removed' | 'unchanged' | 'offline' | 'refused' | 'limit'

/** The three plain-words errors the screens show. */
export const SHARE_COPY = {
  offline: 'No signal. Try again when you are online.',
  refused: 'You cannot change that.',
  limit: 'You changed sharing a lot. Try again in an hour.'
} as const

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
    return data === 'pending' || data === 'removed' || data === 'unchanged' ? data : 'unchanged'
  } catch { return 'offline' }
}

/** true when an offer was found and answered. */
export async function acceptShare(personId: string, accept: boolean): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data, error } = await supabase.rpc('share_accept', { p_person: personId, p_accept: accept })
    return !error && data === true
  } catch { return false }
}

type ViewerRow = { carer_user_id: string; display_name: string; can_write: boolean; pending: boolean; added_by_admin: boolean; added_at: string | null }
/** My viewers, accepted and pending. null when the server could not be reached. */
export async function myViewers(): Promise<Viewer[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('my_viewers')
    if (error || !Array.isArray(data)) return null
    return (data as ViewerRow[]).map((r) => ({ carerUserId: r.carer_user_id, displayName: r.display_name, canWrite: r.can_write, pending: r.pending, addedByAdmin: r.added_by_admin, addedAt: r.added_at }))
  } catch { return null }
}

type CandidateRow = { carer_user_id: string; person_id: string; display_name: string }
/** Family members I could share with. null when the server could not be reached. */
export async function shareCandidates(): Promise<Candidate[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('share_candidates')
    if (error || !Array.isArray(data)) return null
    return (data as CandidateRow[]).map((r) => ({ carerUserId: r.carer_user_id, personId: r.person_id, displayName: r.display_name }))
  } catch { return null }
}

type OfferRow = { person_id: string; can_write: boolean; added_at: string | null }
/** Offers waiting for me to answer (RLS lets a carer read their own; the filter keeps an admin's view to mine too). null when unknown. */
export async function pendingOffers(): Promise<Offer[] | null> {
  if (!supabase) return null
  try {
    const m = await getMember()
    if (!m) return null
    const { data, error } = await supabase.from('share_offers').select('person_id,can_write,added_at').eq('carer_id', m.userId).order('added_at', { ascending: false })
    if (error || !Array.isArray(data)) return null
    return (data as OfferRow[]).map((r) => ({ personId: r.person_id, canWrite: r.can_write, addedAt: r.added_at }))
  } catch { return null }
}

export { AcceptCard } from './AcceptCard'
