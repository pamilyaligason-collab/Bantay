import { supabase } from '../auth/client'
import { isNotSetUp } from './memoriesLogic'
import { shortName } from './messagesLogic'

/** Online calls for family messages (migration 0027): one family thread. Never throws; never logs text, names or paths (B-7). */
export interface Msg { id: string; mine: boolean; senderPersonId: string | null; kind: 'text' | 'voice' | 'photo' | 'file'; body: string | null; name: string | null; durationS: number | null; createdAt: string; url: string | null }
export type Res<T> = { ok: true; data: T } | { ok: false; error: 'unavailable' | 'not_set_up' | 'offline' | 'failed' }

const fail = (e: { code?: string; message?: string; statusCode?: string | number } | null | undefined): Res<never> =>
  isNotSetUp(e) ? { ok: false, error: 'not_set_up' } : { ok: false, error: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'failed' }
const NO: Res<never> = { ok: false, error: 'unavailable' }
const BUCKET = 'family-messages'

/** The newest `limit` messages, oldest first, with short-lived links for attachments. */
export async function listMessages(limit = 80): Promise<Res<Msg[]>> {
  if (!supabase) return NO
  try {
    const me = (await supabase.auth.getSession()).data.session?.user.id ?? null
    const r = await supabase.from('family_messages').select('id,sender_id,sender_person_id,kind,body,attachment_path,attachment_name,duration_s,created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(limit)
    if (r.error) return fail(r.error)
    const rows = (r.data ?? []).reverse()
    const paths = rows.map((x) => x.attachment_path as string | null).filter((p): p is string => !!p)
    const signed = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 600) : { data: [], error: null }
    if (signed.error && isNotSetUp(signed.error)) return fail(signed.error)
    const url = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl] as const))
    return { ok: true, data: rows.map((x) => ({ id: x.id as string, mine: !!me && x.sender_id === me, senderPersonId: (x.sender_person_id as string | null) ?? null, kind: x.kind as Msg['kind'], body: (x.body as string | null) ?? null, name: (x.attachment_name as string | null) ?? null, durationS: (x.duration_s as number | null) ?? null, createdAt: x.created_at as string, url: x.attachment_path ? url.get(x.attachment_path as string) ?? null : null })) }
  } catch (e) { return fail(e as { code?: string }) }
}

export async function sendText(body: string): Promise<Res<null>> {
  if (!supabase) return NO
  const text = body.trim().slice(0, 2000)
  if (!text) return { ok: false, error: 'failed' }
  try {
    const r = await supabase.from('family_messages').insert({ client_id: crypto.randomUUID(), kind: 'text', body: text })
    return r.error ? fail(r.error) : { ok: true, data: null }
  } catch (e) { return fail(e as { code?: string }) }
}

/** Upload one attachment (already stripped / recorded), then its row. If the row fails the object is removed again. */
export async function sendAttachment(blob: Blob, a: { kind: 'voice' | 'photo' | 'file'; ext: string; mime: string; name?: string | null; durationS?: number | null }): Promise<Res<null>> {
  if (!supabase) return NO
  try {
    const uid = (await supabase.auth.getSession()).data.session?.user.id
    if (!uid) return NO
    const id = crypto.randomUUID()
    const path = `${uid}/${id}.${a.ext}`
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: a.mime.split(';')[0], upsert: false })
    if (up.error) return fail(up.error)
    const row = await supabase.from('family_messages').insert({ client_id: id, kind: a.kind, attachment_path: path, attachment_name: a.kind === 'file' ? shortName(a.name ?? null) : null, duration_s: a.kind === 'voice' && a.durationS ? Math.min(60, Math.max(1, Math.round(a.durationS))) : null })
    if (row.error) { await supabase.storage.from(BUCKET).remove([path]); return fail(row.error) }
    return { ok: true, data: null }
  } catch (e) { return fail(e as { code?: string }) }
}

/** Soft-delete the row. Only the sender (or an admin) passes RLS; the object is removed best-effort. */
export async function removeMessage(id: string): Promise<Res<null>> {
  if (!supabase) return NO
  try {
    const got = await supabase.from('family_messages').select('attachment_path').eq('id', id).maybeSingle()
    const r = await supabase.from('family_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id')
    if (r.error) return fail(r.error)
    if (!r.data?.length) return { ok: false, error: 'failed' }
    const p = got.data?.attachment_path as string | null | undefined
    if (p) await supabase.storage.from(BUCKET).remove([p])
    return { ok: true, data: null }
  } catch (e) { return fail(e as { code?: string }) }
}
