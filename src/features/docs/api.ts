// Supabase side of the cards screen. Errors are swallowed or rethrown without values: no names, paths or URLs in logs (B-7).
import type { SupabaseClient } from '@supabase/supabase-js'
import { CARD_TYPES, ddb, type CardType, type Kind, type PersonRow, type QueueRow, type Side } from './store'

export const MAX_BYTES = 15 * 1024 * 1024 // same limit as the 'records' bucket
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }
export const canUse = (f: Blob) => !!EXT[f.type] && f.size > 0 && f.size <= MAX_BYTES

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const bytes = (f: Blob) => (typeof f.arrayBuffer === 'function' ? f.arrayBuffer() : new Response(f).arrayBuffer())

/** Keep a picture on this phone and queue it. Nothing here reads the picture beyond hashing its bytes. */
export async function addCard(o: { file: Blob; personId: string; kind: Kind; cardType: CardType; title: string | null; side: Side; docId?: string }): Promise<{ docId: string }> {
  if (!canUse(o.file)) throw new Error('unusable file')
  const ext = EXT[o.file.type]!
  const docId = o.docId ?? crypto.randomUUID()
  const path = `${o.personId}/${crypto.randomUUID()}.${ext}`
  const sha256 = hex(await crypto.subtle.digest('SHA-256', await bytes(o.file)))
  const title = o.title?.trim() || null
  const base = { docId, personId: o.personId, kind: o.kind, cardType: o.cardType, title, side: o.side, mime: o.file.type }
  await ddb.transaction('rw', ddb.cards, ddb.queue, async () => {
    await ddb.cards.put({ ...base, path, blob: o.file, updated: Date.now(), pending: true })
    await ddb.queue.add({ ...base, clientId: crypto.randomUUID(), docNew: !o.docId, path, name: `card-${o.side}.${ext}`, size: o.file.size, sha256, tries: 0 })
  })
  return { docId }
}

const exists = (e: { message?: string; statusCode?: string | number }) => String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? '')

async function sendOne(client: SupabaseClient, q: QueueRow, blob: Blob) {
  const up = await client.storage.from('records').upload(q.path, blob, { upsert: false, contentType: q.mime })
  if (up.error && !exists(up.error as { message?: string })) throw new Error('upload')
  if (q.docNew) {
    // Only status is sent for the confirm: the trigger stamps confirmed_by/at. client_id = id = the phone's UUID, so a retry is a no-op.
    const d = await client.from('documents').upsert(
      { id: q.docId, client_id: q.docId, person_id: q.personId, kind: q.kind, card_type: q.cardType, title: q.title, status: 'confirmed' },
      { onConflict: 'client_id', ignoreDuplicates: true }
    )
    if (d.error) throw new Error('document')
  }
  const f = await client.from('source_files').upsert(
    { client_id: q.clientId, person_id: q.personId, storage_path: q.path, side: q.side, document_id: q.docId, name: q.name, mime: q.mime, size_bytes: q.size, sha256: q.sha256, drive_file_id: null },
    { onConflict: 'client_id', ignoreDuplicates: true }
  )
  if (f.error) throw new Error('file')
}

let running: Promise<number> | null = null
let again = false
/** Send queued pictures oldest first; stop at the first failure so order is kept.
 *  A call while another is running joins it, and the running one makes another pass so rows added meanwhile are not missed. */
export function flushQueue(client: SupabaseClient | null): Promise<number> {
  if (!client) return Promise.resolve(0)
  if (running) { again = true; return running }
  return (running = (async () => {
    let sent = 0
    do {
      again = false
      for (const q of await ddb.queue.orderBy('seq').toArray()) {
        const card = await ddb.cards.get(q.path)
        if (card) {
          try { await sendOne(client, q, card.blob) } catch { await ddb.queue.update(q.seq!, { tries: q.tries + 1 }); return sent }
          await ddb.cards.update(q.path, { pending: false })
          sent++
        }
        await ddb.queue.delete(q.seq!)
      }
    } while (again)
    return sent
  })().finally(() => { running = null; again = false }))
}

/** Self plus no-login dependents this user can write for. null when signed out or the request failed (keep the cached list). */
export async function fetchPeople(client: SupabaseClient): Promise<PersonRow[] | null> {
  try {
    const uid = (await client.auth.getSession()).data.session?.user.id
    if (!uid) return null
    const [me, cr] = await Promise.all([
      client.from('people').select('id, display_name').eq('auth_user_id', uid).maybeSingle(),
      client.from('carers').select('person_id').eq('carer_id', uid).eq('can_write', true)
    ])
    if (me.error || cr.error) return null
    const out: PersonRow[] = me.data ? [{ id: me.data.id, name: 'Me', self: true }] : []
    const ids = (cr.data ?? []).map((r: { person_id: string }) => r.person_id).filter((id: string) => id !== me.data?.id)
    if (ids.length) {
      const dep = await client.from('people').select('id, display_name').in('id', ids).is('auth_user_id', null)
      if (dep.error) return null
      for (const p of dep.data ?? []) out.push({ id: p.id, name: p.display_name, self: false })
    }
    return out
  } catch { return null }
}

/** Download pictures this phone does not have yet into the cache, and drop cached ones removed on the server. */
export async function refreshCards(client: SupabaseClient, people: PersonRow[]): Promise<void> {
  const ids = people.map((p) => p.id)
  if (!ids.length) return
  try {
    const docs = await client.from('documents').select('id, person_id, kind, card_type, title').in('kind', ['id_card', 'insurance_card']).in('person_id', ids)
    if (docs.error || !docs.data) return
    const meta = new Map<string, { id: string; kind: Kind; card_type: string | null; title: string | null }>(docs.data.map((d: { id: string; kind: Kind; card_type: string | null; title: string | null }) => [d.id, d]))
    const files = meta.size
      ? await client.from('source_files').select('storage_path, document_id, side, person_id, mime').in('document_id', [...meta.keys()]).not('storage_path', 'is', null)
      : { data: [], error: null }
    if (files.error || !files.data) return
    const keep = new Set<string>()
    for (const f of files.data as { storage_path: string; document_id: string; side: Side | null; person_id: string; mime: string }[]) {
      const d = meta.get(f.document_id)
      if (!d || !f.storage_path) continue
      keep.add(f.storage_path)
      const type = (CARD_TYPES as readonly string[]).includes(d.card_type ?? '') ? (d.card_type as CardType) : 'other'
      if (await ddb.cards.get(f.storage_path)) { await ddb.cards.update(f.storage_path, { cardType: type, title: d.title, kind: d.kind }); continue }
      const dl = await client.storage.from('records').download(f.storage_path) // bytes straight into the cache; no URL is kept
      if (dl.error || !dl.data) continue
      await ddb.cards.put({ path: f.storage_path, personId: f.person_id, kind: d.kind, cardType: type, side: f.side === 'back' ? 'back' : 'front', blob: dl.data, updated: Date.now(), docId: f.document_id, title: d.title, mime: f.mime, pending: false })
    }
    for (const c of await ddb.cards.where('personId').anyOf(ids).toArray()) if (!c.pending && !keep.has(c.path)) await ddb.cards.delete(c.path)
  } catch { /* offline: the cache stays as it is */ }
}
