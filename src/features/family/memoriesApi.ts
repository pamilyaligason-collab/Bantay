import { supabase } from '../auth/client'
import { isNotSetUp } from './memoriesLogic'

/** Online calls for Memories (migration 0023). Never throws; never logs captions, paths or names (B-7). */
export interface Photo { id: string; path: string; caption: string | null; takenOn: string | null; createdAt: string; mine: boolean; url: string | null }
export type Res<T> = { ok: true; data: T } | { ok: false; error: 'unavailable' | 'not_set_up' | 'offline' | 'failed' }

const fail = (e: { code?: string; message?: string; statusCode?: string | number } | null | undefined): Res<never> =>
  isNotSetUp(e) ? { ok: false, error: 'not_set_up' } : { ok: false, error: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'failed' }
const NO: Res<never> = { ok: false, error: 'unavailable' }

export async function listPhotos(limit = 12): Promise<Res<Photo[]>> {
  if (!supabase) return NO
  try {
    const me = (await supabase.auth.getSession()).data.session?.user.id ?? null
    const r = await supabase.from('family_photos').select('id,storage_path,caption,taken_on,created_at,uploaded_by').is('deleted_at', null).order('created_at', { ascending: false }).limit(limit)
    if (r.error) return fail(r.error)
    const rows = r.data ?? []
    const signed = rows.length ? await supabase.storage.from('memories').createSignedUrls(rows.map((x) => x.storage_path as string), 300) : { data: [], error: null }
    if (signed.error && isNotSetUp(signed.error)) return fail(signed.error)
    const url = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl] as const))
    return { ok: true, data: rows.map((x) => ({ id: x.id as string, path: x.storage_path as string, caption: (x.caption as string | null) ?? null, takenOn: (x.taken_on as string | null) ?? null, createdAt: x.created_at as string, mine: !!me && x.uploaded_by === me, url: url.get(x.storage_path as string) ?? null })) }
  } catch (e) { return fail(e as { code?: string }) }
}

/** Upload one already-stripped JPEG, then its row. If the row fails the object is removed again. */
export async function addPhoto(jpeg: Blob, caption: string, takenOn: string | null): Promise<Res<null>> {
  if (!supabase) return NO
  try {
    const uid = (await supabase.auth.getSession()).data.session?.user.id
    if (!uid) return NO
    const id = crypto.randomUUID()
    const path = `${uid}/${id}.jpg`
    const up = await supabase.storage.from('memories').upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
    if (up.error) return fail(up.error)
    const row = await supabase.from('family_photos').insert({ client_id: id, storage_path: path, caption: caption.trim().slice(0, 140) || null, taken_on: takenOn })
    if (row.error) { await supabase.storage.from('memories').remove([path]); return fail(row.error) }
    return { ok: true, data: null }
  } catch (e) { return fail(e as { code?: string }) }
}

/** Soft-delete the row, then remove the object. Only the uploader (or an admin) passes RLS. */
export async function removePhoto(p: Pick<Photo, 'id' | 'path'>): Promise<Res<null>> {
  if (!supabase) return NO
  try {
    const r = await supabase.from('family_photos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id).select('id')
    if (r.error) return fail(r.error)
    if (!r.data?.length) return { ok: false, error: 'failed' } // RLS let nothing through: not yours
    await supabase.storage.from('memories').remove([p.path])
    return { ok: true, data: null }
  } catch (e) { return fail(e as { code?: string }) }
}
