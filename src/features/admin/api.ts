import { supabase } from '../auth/client'

// Thin wrappers over the shared client. Every call tolerates supabase === null ("Not connected yet") and never throws.
export interface Profile { photoPath: string | null; phone: string | null; birthdate: string | null; bloodType: string | null; allergies: string[]; conditions: string[]; medicines: string[] }
export interface Member { userId: string; personId: string | null; displayName: string; handle: string | null; role: 'admin' | 'member'; disabled: boolean; lastSignInAt: string | null; provider: string | null; profile: Profile | null }
/** What the member page can change. A key left out is untouched; null clears it. */
export type ProfilePatch = Partial<{ displayName: string; phone: string | null; birthdate: string | null; bloodType: string | null; allergies: string[]; conditions: string[]; medicines: string[]; photoPath: string | null }>
export interface UsageRow { user_id: string; last_seen: string; events: number; top_screens: { name: string; count: number }[]; active_7: boolean; active_30: boolean; alerts_on: boolean; sensors_on: boolean }
export interface ImportRow { person_id: string; display_name: string; readings: number; consults: number }
export interface Carer { carer_id: string; person_id: string; can_write: boolean }
export interface PinRequest { id: number; handle: string; user_id: string; created_at: string }
export type Res<T> = { ok: true; data: T } | { ok: false; error: string }

export const connected = () => supabase !== null
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: typeof e === 'string' ? e : (e as { message?: string } | null)?.message ?? 'failed' })
const NO = { ok: false, error: 'not_connected' } as const

export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<Res<T>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.rpc(name, args)
    return error ? fail(error) : { ok: true, data: (data ?? []) as T }
  } catch (e) { return fail(e) }
}

/** admin-members Edge Function (contract). Returns the function's own { ok, error } shape. */
export async function adminMembers<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<Res<T>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.functions.invoke('admin-members', { body })
    if (error) return fail(error)
    const d = data as { ok?: boolean; error?: string } | null
    return d?.ok ? { ok: true, data: data as T } : fail(d?.error ?? 'failed')
  } catch (e) { return fail(e) }
}

/** Save a member's details through the admin-members 'update' action (service role: RLS only shows an admin their own row). */
export const updatePerson = (personId: string, patch: ProfilePatch) => adminMembers({ action: 'update', personId, ...patch })

/** Photos live in the private avatars bucket as <person_id>.jpg (migration 0010). */
export async function uploadAvatar(personId: string, jpeg: Blob): Promise<Res<string>> {
  if (!supabase) return NO
  try {
    const path = `${personId}.jpg`
    const { error } = await supabase.storage.from('avatars').upload(path, jpeg, { upsert: true, contentType: 'image/jpeg' })
    return error ? fail(error) : { ok: true, data: path }
  } catch (e) { return fail(e) }
}
export async function downloadAvatar(path: string): Promise<Blob | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.storage.from('avatars').download(path)
    return error ? null : data
  } catch { return null }
}

export async function listCarers(): Promise<Res<Carer[]>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.from('carers').select('carer_id,person_id,can_write')
    return error ? fail(error) : { ok: true, data: (data ?? []) as Carer[] }
  } catch (e) { return fail(e) }
}
export async function linkCarer(carerId: string, personId: string, canWrite: boolean): Promise<Res<null>> {
  if (!supabase) return NO
  try {
    const { error } = await supabase.from('carers').upsert({ carer_id: carerId, person_id: personId, can_write: canWrite }, { onConflict: 'carer_id,person_id', ignoreDuplicates: true }) // never rewrites an existing link
    return error ? fail(error) : { ok: true, data: null }
  } catch (e) { return fail(e) }
}
export async function unlinkCarer(carerId: string, personId: string): Promise<Res<null>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.from('carers').delete().eq('carer_id', carerId).eq('person_id', personId).select()
    if (error) return fail(error)
    return data && data.length > 0 ? { ok: true, data: null } : { ok: false, error: 'forbidden' } // RLS hides a row it will not delete
  } catch (e) { return fail(e) }
}

/** Open "Forgot PIN" requests that matched a member (migration 0009: admin select). Oldest first. */
export async function listPinRequests(): Promise<Res<PinRequest[]>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.from('admin_requests').select('id,handle,user_id,created_at').eq('kind', 'pin_reset').is('handled_at', null).order('created_at')
    return error ? fail(error) : { ok: true, data: (data ?? []) as PinRequest[] }
  } catch (e) { return fail(e) }
}
/** Mark a request handled (admin update policy on handled_at only). */
export async function markRequestDone(id: number): Promise<Res<null>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.from('admin_requests').update({ handled_at: new Date().toISOString() }).eq('id', id).select('id')
    if (error) return fail(error)
    return data && data.length > 0 ? { ok: true, data: null } : { ok: false, error: 'not_found' }
  } catch (e) { return fail(e) }
}

/** Time of the newest news item, or null when there are none. */
export async function newsLastAt(): Promise<Res<string | null>> {
  if (!supabase) return NO
  try {
    const { data, error } = await supabase.from('news_items').select('published_at').order('published_at', { ascending: false }).limit(1)
    return error ? fail(error) : { ok: true, data: (data?.[0] as { published_at?: string } | undefined)?.published_at ?? null }
  } catch (e) { return fail(e) }
}
