// Supabase side of the cards screen. Errors are swallowed or rethrown without values: no names, paths or URLs in logs (B-7).
import type { SupabaseClient } from '@supabase/supabase-js'
import { CARD_TYPES, ddb, type CardType, type DocKind, type Kind, type PersonRow, type QueueRow, type ScanKind, type Side } from './store'
import { aiOn } from '../privacy/ai'

export const MAX_BYTES = 15 * 1024 * 1024 // same limit as the 'records' bucket
export const MAX_TRIES = 5 // a picture that fails this many times (not counting no-signal) is given up on; Retry puts it back
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }
export const canUse = (f: Blob) => !!EXT[f.type] && f.size > 0 && f.size <= MAX_BYTES

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const bytes = (f: Blob) => (typeof f.arrayBuffer === 'function' ? f.arrayBuffer() : new Response(f).arrayBuffer())

/** Some Android pickers give a HEIC photo with no type. Look at the first bytes (ftypheic / ftypmif1) and label it. */
export async function fixType(f: Blob): Promise<Blob> {
  if (f.type) return f
  const head = String.fromCharCode(...new Uint8Array(await bytes(f.slice(0, 12))).slice(4, 12))
  return head === 'ftypheic' || head === 'ftypmif1' ? new Blob([f], { type: 'image/heic' }) : f
}

/** Keep a picture on this phone and queue it. Nothing here reads the picture beyond hashing its bytes. */
export async function addCard(o: { file: Blob; owner?: string; personId: string; kind: Kind; cardType: CardType; title: string | null; side: Side; docId?: string }): Promise<{ docId: string }> {
  const file = await fixType(o.file)
  if (!canUse(file)) throw new Error('unusable file')
  const ext = EXT[file.type]!
  const docId = o.docId ?? crypto.randomUUID()
  const path = `${o.personId}/${crypto.randomUUID()}.${ext}`
  const sha256 = hex(await crypto.subtle.digest('SHA-256', await bytes(file)))
  const title = o.title?.trim() || null
  const owner = o.owner ?? ''
  const base = { docId, personId: o.personId, kind: o.kind, cardType: o.cardType, title, side: o.side, mime: file.type }
  await ddb.transaction('rw', ddb.cards, ddb.queue, async () => {
    await ddb.cards.put({ ...base, path, blob: file, updated: Date.now(), pending: true, owner })
    await ddb.queue.add({ ...base, owner, createdAt: Date.now(), clientId: crypto.randomUUID(), docNew: !o.docId, path, name: `card-${o.side}.${ext}`, size: file.size, sha256, tries: 0 })
  })
  return { docId }
}

const pageName = (n: number) => `p${String(n).padStart(2, '0')}`
/** What the person chose in the scan form. 'id' is today's ID-card path (kept, not read). */
export type ScanChoice = ScanKind | 'id'

/** Keep scanned pages on this phone and queue them as ONE document: pages go to '<person_id>/<document_id>/p01.jpg', p02.jpg ...
 *  The first row creates the document; the last one to land asks the server to read the pages. Contract: src/features/scan/CONTRACT.md */
export async function addScan(o: { pages: Blob[]; owner?: string; personId: string; kind: ScanChoice; docDate?: string | null; title?: string | null }): Promise<{ docId: string }> {
  if (!o.pages.length) throw new Error('no pages')
  const files = await Promise.all(o.pages.map(fixType))
  if (!files.every(canUse)) throw new Error('unusable file')
  const docId = crypto.randomUUID()
  const owner = o.owner ?? ''
  const isId = o.kind === 'id'
  const kind: DocKind = o.kind === 'id' ? 'id_card' : o.kind
  const sums = await Promise.all(files.map(async (f) => hex(await crypto.subtle.digest('SHA-256', await bytes(f)))))
  const now = Date.now()
  const skipRead = !(await aiOn()) // privacy.ai off while scanning: the pages are kept, never read by the AI
  await ddb.transaction('rw', ddb.cards, ddb.queue, async () => {
    for (const [i, file] of files.entries()) {
      const ext = EXT[file.type]!
      const path = `${o.personId}/${docId}/${pageName(i + 1)}.${ext}`
      const side: Side = !isId || i === 0 ? 'front' : 'back'
      const base = { docId, personId: o.personId, kind, cardType: 'other' as CardType, title: o.title?.trim() || null, side, mime: file.type }
      await ddb.cards.put({ ...base, path, blob: file, updated: now, pending: true, owner })
      await ddb.queue.add({ ...base, side: isId ? side : null, owner, createdAt: now, clientId: crypto.randomUUID(), docNew: i === 0, path, name: `page-${String(i + 1).padStart(2, '0')}.${ext}`, size: file.size, sha256: sums[i]!, tries: 0, page: i + 1, pages: isId ? undefined : files.length, // an ID is kept, never read: no pages count, no extract call
         docDate: o.docDate || null, ...(skipRead && !isId ? { skipRead: true } : {}) })
    }
  })
  return { docId }
}

/** Ask the server to read a scanned document. Failure is ignored: a sweep on the server picks up documents nobody asked about. */
async function askToRead(client: SupabaseClient, documentId: string) {
  try { await client.functions?.invoke('records-extract', { body: { document_id: documentId } }) } catch { /* the sweep will do it */ }
}

const exists = (e: { message?: string; statusCode?: string | number }) => String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? '')
const noSignal = (e: { message?: string } | null | undefined) => /fetch|network|load failed|timeout/i.test(e?.message ?? '')

async function sendOne(client: SupabaseClient, q: QueueRow, blob: Blob) {
  const fail = (what: string, e: { message?: string }) => { throw new Error(noSignal(e) ? 'net' : what) }
  const up = await client.storage.from('records').upload(q.path, blob, { upsert: false, contentType: q.mime })
  if (up.error && !exists(up.error as { message?: string })) fail('upload', up.error as { message?: string })
  if (q.docNew) {
    // Only status is sent for the confirm: the trigger stamps confirmed_by/at. client_id = id = the phone's UUID, so a retry is a no-op.
    // Scanned papers (lab, prescription, other) go in as 'draft' so they land in "To check" once read; cards stay 'confirmed'.
    const card = q.kind === 'id_card' || q.kind === 'insurance_card'
    const d = await client.from('documents').upsert(
      { id: q.docId, client_id: q.docId, person_id: q.personId, kind: q.kind, card_type: card ? q.cardType : null, title: q.title, status: card ? 'confirmed' : 'draft', ...(q.docDate ? { doc_date: q.docDate } : {}), ...(q.pages ? { page_count: q.pages } : {}) },
      { onConflict: 'client_id', ignoreDuplicates: true }
    )
    if (d.error) fail('document', d.error)
  }
  // privacy.ai off (decided once per document, see flushQueue): the page is kept but marked 'skipped'; the server sweep takes 'new' only
  const skip = !!q.pages && q.skipRead === true
  const f = await client.from('source_files').upsert(
    { client_id: q.clientId, person_id: q.personId, storage_path: q.path, side: q.side, document_id: q.docId, name: q.name, mime: q.mime, size_bytes: q.size, sha256: q.sha256, drive_file_id: null, ...(q.page ? { page_no: q.page } : {}), ...(skip ? { ingest_status: 'skipped' } : {}) },
    { onConflict: 'client_id', ignoreDuplicates: true }
  )
  if (f.error) fail('file', f.error)
}

let running: Promise<number> | null = null
let again = false
/** Send this user's queued pictures oldest first. No signal: stop and keep order. A real failure counts a try; at MAX_TRIES the
 *  card is marked failed (Retry puts it back) and the next card still goes. A call while running makes the running one do another pass. */
export function flushQueue(client: SupabaseClient | null, owner = ''): Promise<number> {
  if (!client) return Promise.resolve(0)
  if (running) { again = true; return running }
  return (running = (async () => {
    let sent = 0
    const dead = new Set<number>()
    const skipped = new Set<string>()
    do {
      again = false
      for (const q of await ddb.queue.orderBy('seq').toArray()) {
        if (q.owner !== owner || dead.has(q.seq!)) continue // another user's picture: kept, never sent from here
        // Switched off after scanning but before the first page went up: the whole document is skipped (all pages the same, so the server never sees a mixed document).
        if (q.docNew && q.pages && !q.skipRead && !(await aiOn())) {
          await ddb.queue.filter((r) => r.docId === q.docId && r.owner === q.owner).modify({ skipRead: true })
          skipped.add(q.docId)
        }
        if (skipped.has(q.docId)) q.skipRead = true // the rows of this pass were read before the modify above
        const card = await ddb.cards.get(q.path)
        if (card) {
          try { await sendOne(client, q, card.blob) } catch (e) {
            if ((e as Error).message === 'net') return sent
            const tries = q.tries + 1
            if (tries < MAX_TRIES) { await ddb.queue.update(q.seq!, { tries }); return sent }
            // Give up on the whole card: its other queued pictures cannot land without the document, so they fail with it.
            await ddb.transaction('rw', ddb.cards, ddb.queue, async () => {
              for (const r of await ddb.queue.where('clientId').notEqual('').toArray()) {
                if (r.docId !== q.docId || r.owner !== q.owner) continue
                await ddb.cards.update(r.path, { pending: false, failed: true, retry: { ...r, tries: 0, seq: undefined } })
                await ddb.queue.delete(r.seq!)
                dead.add(r.seq!)
              }
            })
            continue
          }
          await ddb.cards.update(q.path, { pending: false })
          sent++
        }
        await ddb.queue.delete(q.seq!)
        // The last page of a scanned document is up: ask the server to read it (not awaited; a slow reply must not hold the queue).
        if (q.pages && !q.skipRead && !(await ddb.queue.filter((r) => r.docId === q.docId).count())) void askToRead(client, q.docId)
      }
    } while (again)
    return sent
  })().finally(() => { running = null; again = false }))
}

/** Drain this user's waiting uploads. Called by the app-wide sync loop so a saved scan goes up even when no Docs screen is open (B-78). */
export async function drainQueue(client: SupabaseClient | null): Promise<number> {
  if (!client) return 0
  try { return await flushQueue(client, await ensureOwner(client)) } catch { return 0 }
}

/** Put a given-up card back in the queue from the picture kept on this phone. */
export async function retryCard(docId: string): Promise<void> {
  const failed = (await ddb.cards.where('docId').equals(docId).toArray()).filter((c) => c.failed && c.retry)
  for (const c of failed.sort((a, b) => Number(b.retry!.docNew) - Number(a.retry!.docNew) || Number(b.side === 'front') - Number(a.side === 'front') || (a.retry!.page ?? 0) - (b.retry!.page ?? 0))) { // the row that creates the document goes first
    await ddb.transaction('rw', ddb.cards, ddb.queue, async () => {
      await ddb.queue.add({ ...c.retry!, createdAt: Date.now() })
      await ddb.cards.update(c.path, { failed: false, pending: true, retry: undefined })
    })
  }
}

const OWNER = 'owner'
/** Sign-out hook (also run for you on mount/flush): forget every picture that is not still waiting to upload, and who is cached. */
export async function clearDocsCache(currentOwner = ''): Promise<void> {
  // ponytail: another user's unsent pictures are kept 30 days, then dropped; a phone nobody signs back into keeps them that long.
  const old = Date.now() - 30 * 86_400_000
  await ddb.transaction('rw', ddb.cards, ddb.queue, ddb.people, ddb.driveOnly, ddb.meta, async () => {
    for (const c of await ddb.cards.toArray()) {
      if (!c.pending && !c.failed) await ddb.cards.delete(c.path)
      else if (c.owner !== currentOwner && c.updated < old) { await ddb.cards.delete(c.path); await ddb.queue.where('clientId').notEqual('').filter((r) => r.path === c.path).delete() }
    }
    await ddb.people.clear()
    await ddb.driveOnly.clear()
    await ddb.meta.clear()
  })
}

/** Who is signed in on this phone. If it is not who the cache belongs to, wipe the cache first. '' = auth not configured or signed out.
 *  A network error while checking is not a sign-out: the cache is kept so the screen still works offline. */
export async function ensureOwner(client: SupabaseClient | null): Promise<string> {
  const had = (await ddb.meta.get(OWNER))?.value
  if (!client) return had ?? ''
  let uid = ''
  try {
    const { data, error } = await client.auth.getSession()
    if (error) return had ?? ''
    uid = data.session?.user.id ?? ''
  } catch { return had ?? '' }
  if (had !== uid) { await clearDocsCache(uid); await ddb.meta.put({ key: OWNER, value: uid }) }
  return uid
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

type DocMeta = { id: string; kind: Kind; card_type: string | null; title: string | null; status: string; person_id: string }
type FileMeta = { storage_path: string | null; drive_file_id: string | null; document_id: string; side: Side | null; person_id: string; mime: string }
const typeOf = (t: string | null): CardType => ((CARD_TYPES as readonly string[]).includes(t ?? '') ? (t as CardType) : 'other')

/** Download pictures this phone does not have yet into the cache, drop cached ones removed on the server, and keep a metadata row
 *  for cards that live only in the Drive (never fetched). */
export async function refreshCards(client: SupabaseClient, people: PersonRow[], owner = ''): Promise<void> {
  const ids = people.map((p) => p.id)
  if (!ids.length) return
  try {
    const docs = await client.from('documents').select('id, person_id, kind, card_type, title, status').in('kind', ['id_card', 'insurance_card']).in('person_id', ids)
    if (docs.error || !docs.data) return
    const meta = new Map<string, DocMeta>((docs.data as DocMeta[]).map((d) => [d.id, d]))
    const files = meta.size
      ? await client.from('source_files').select('storage_path, drive_file_id, document_id, side, person_id, mime').in('document_id', [...meta.keys()])
      : { data: [], error: null }
    if (files.error || !files.data) return
    const keep = new Set<string>()
    const hasPicture = new Set<string>()
    for (const f of files.data as FileMeta[]) {
      const d = meta.get(f.document_id)
      if (!d || !f.storage_path) continue
      hasPicture.add(d.id)
      keep.add(f.storage_path)
      const type = typeOf(d.card_type)
      if (await ddb.cards.get(f.storage_path)) { await ddb.cards.update(f.storage_path, { cardType: type, title: d.title, kind: d.kind }); continue }
      const dl = await client.storage.from('records').download(f.storage_path) // bytes straight into the cache; no URL is kept
      if (dl.error || !dl.data) continue
      await ddb.cards.put({ path: f.storage_path, personId: f.person_id, kind: d.kind, cardType: type, side: f.side === 'back' ? 'back' : 'front', blob: dl.data, updated: Date.now(), docId: f.document_id, title: d.title, mime: f.mime, pending: false, owner })
    }
    for (const c of await ddb.cards.where('personId').anyOf(ids).toArray()) if (!c.pending && !c.failed && !keep.has(c.path)) await ddb.cards.delete(c.path)
    const drive = (files.data as FileMeta[]).filter((f) => f.drive_file_id && !f.storage_path && !hasPicture.has(f.document_id))
    const driveDocs = [...new Set(drive.map((f) => f.document_id))].map((id) => meta.get(id)!).filter((d) => d && d.status !== 'rejected')
    await ddb.transaction('rw', ddb.driveOnly, async () => {
      await ddb.driveOnly.where('personId').anyOf(ids).delete()
      await ddb.driveOnly.bulkPut(driveDocs.map((d) => ({ docId: d.id, personId: d.person_id, kind: d.kind, cardType: typeOf(d.card_type), title: d.title, status: d.status === 'confirmed' ? 'confirmed' as const : 'draft' as const })))
    })
  } catch { /* offline: the cache stays as it is */ }
}

/** The owner checks which card a Drive-only draft is, then confirms or rejects it. Only status and card_type are sent. */
export async function decideDriveCard(client: SupabaseClient, c: { docId: string; cardType: CardType }, status: 'confirmed' | 'rejected'): Promise<boolean> {
  try {
    const r = await client.from('documents').update(status === 'confirmed' ? { status, card_type: c.cardType } : { status }).eq('id', c.docId)
    if (r.error) return false
    if (status === 'rejected') await ddb.driveOnly.delete(c.docId)
    else await ddb.driveOnly.update(c.docId, { status: 'confirmed', cardType: c.cardType })
    return true
  } catch { return false }
}
