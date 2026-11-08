/** Optional 'Full medical library' (D-158): the mdwiki offline pack built by scripts/medlib/mdwiki-pack.py.
 *  Downloaded once (resumable, Range), kept in OPFS (IndexedDB when OPFS cannot write), searched by title in memory. Nothing here runs until the person taps Get. */

// Uploaded by the orchestrator as a GitHub release asset; until then the download fails with a clear message.
export const FULL_LIBRARY_URL = 'https://github.com/pamilyaligason-collab/Bantay/releases/download/medlib-v1/medlib-mdwiki.pack'
// Shown before the size is known (it is read from the server on the first request). Orchestrator: set to the built pack's size.
export const FULL_LIBRARY_MB = 400
export const MDWIKI_CREDIT = 'Text from mdwiki.org (WikiProject Med). Licensed CC BY-SA 4.0. Changes: converted to plain text.'
export const MDWIKI_LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'

export type FullLibraryState = 'none' | 'downloading' | 'ready' | 'error'
export interface FullLibraryStatus { state: FullLibraryState; bytes: number; total: number; message?: string }
export interface FullHit { title: string; snippet: string; key: string }
export interface FullArticleData { key: string; title: string; text: string; url: string; image?: string }
export interface DownloadOpts { onProgress?: (p: { bytes: number; total: number }) => void; signal?: AbortSignal; confirmed?: boolean; url?: string }

/** code 'needs-confirm' = not on Wi-Fi, ask first; 'low-space' = not enough room; others are plain failures. */
export class FullLibraryError extends Error {
  code: 'needs-confirm' | 'low-space' | 'network' | 'bad-pack' | 'busy' | 'aborted'
  constructor(code: FullLibraryError['code'], message: string) { super(message); this.code = code }
}

const NAME = 'medlib-mdwiki.pack'
const META = 'bantay.medlib.v1'
const MAGIC = 'BMDW1\n'
const HEADROOM = 200 * 1024 * 1024 // keep this much free after the pack

interface Store {
  size(): Promise<number>
  append(b: Uint8Array): Promise<void>
  read(start: number, end: number): Promise<Uint8Array>
  clear(): Promise<void>
}

// ---- OPFS ----
function opfsOk(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory && typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype
}
async function opfsStore(): Promise<Store> {
  const dir = await navigator.storage.getDirectory()
  const handle = () => dir.getFileHandle(NAME, { create: true })
  return {
    size: async () => (await (await handle()).getFile()).size,
    async append(b) {
      const fh = await handle()
      const at = (await fh.getFile()).size
      const w = await fh.createWritable({ keepExistingData: true })
      await w.seek(at)
      await w.write(b as BufferSource)
      await w.close()
    },
    async read(s, e) { return new Uint8Array(await (await (await handle()).getFile()).slice(s, e).arrayBuffer()) },
    async clear() { try { await dir.removeEntry(NAME) } catch { /* nothing stored */ } },
  }
}

// ---- IndexedDB fallback: chunks of <= a few MB under numeric keys, lengths in the 'meta' record ----
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('bantay-medlib', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error) })
let openDb: IDBDatabase | null = null
async function idbStore(): Promise<Store> {
  const db = (openDb = await idb())
  const lens = async (): Promise<number[]> => (await req(db.transaction('kv').objectStore('kv').get('lens'))) ?? []
  return {
    size: async () => (await lens()).reduce((a, b) => a + b, 0),
    async append(b) {
      const l = await lens()
      const t = db.transaction('kv', 'readwrite')
      t.objectStore('kv').put(b.slice(), l.length)
      t.objectStore('kv').put([...l, b.length], 'lens')
      await done(t)
    },
    async read(s, e) {
      const l = await lens()
      const out = new Uint8Array(Math.max(0, Math.min(e, l.reduce((a, b) => a + b, 0)) - s))
      let at = 0
      for (let i = 0; i < l.length && at < e; at += l[i++]) {
        if (at + l[i] <= s) continue
        const c: Uint8Array = await req(db.transaction('kv').objectStore('kv').get(i))
        const from = Math.max(s - at, 0)
        const to = Math.min(e - at, l[i])
        out.set(c.subarray(from, to), Math.max(at - s, 0))
      }
      return out
    },
    async clear() { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); await done(t) },
  }
}

let storePromise: Promise<Store> | null = null
const getStore = () => (storePromise ??= (opfsOk() ? opfsStore().catch(idbStore) : idbStore()))
/** Tests swap the backing store between cases. */
export function _resetFullLibrary() { openDb?.close(); openDb = null; storePromise = null; idx = null; active = false; lastError = '' }

// ---- meta (total size of the pack, from the server) ----
const getTotal = (): number => { try { return Number(JSON.parse(localStorage.getItem(META) || '{}').total) || 0 } catch { return 0 } }
const setTotal = (total: number) => { try { if (total) localStorage.setItem(META, JSON.stringify({ total })); else localStorage.removeItem(META) } catch { /* private mode: resume falls back to a fresh start */ } }

let active = false
let lastError = ''
type Idx = { rows: [string, string, number, number, string][]; base: number }
let idx: Idx | null = null

export async function getStatus(): Promise<FullLibraryStatus> {
  const total = getTotal()
  let bytes = 0
  try { bytes = await (await getStore()).size() } catch { return { state: 'error', bytes: 0, total, message: 'This device cannot store the library.' } }
  if (active) return { state: 'downloading', bytes, total }
  if (total > 0 && bytes >= total) return { state: 'ready', bytes, total }
  if (lastError) return { state: 'error', bytes, total, message: lastError }
  return { state: 'none', bytes, total }
}

function wifiOk(): boolean {
  const t = (navigator as Navigator & { connection?: { type?: string } }).connection?.type
  return !t || t === 'wifi' || t === 'ethernet' // unknown (most browsers) is allowed; the card asks first when it cannot tell
}
export const connectionKnown = (): boolean => !!(navigator as Navigator & { connection?: { type?: string } }).connection?.type

/** Starts or resumes the download. Throws FullLibraryError. Cancel with opts.signal (a cancelled download is erased). */
export async function download(opts: DownloadOpts = {}): Promise<void> {
  if (active) throw new FullLibraryError('busy', 'Already downloading.')
  if (!wifiOk() && !opts.confirmed) throw new FullLibraryError('needs-confirm', 'You are not on Wi-Fi. This is a large download.')
  const store = await getStore()
  active = true
  lastError = ''
  idx = null
  try {
    let have = await store.size()
    const prevTotal = getTotal()
    if (prevTotal && have >= prevTotal) return
    const res = await fetch(opts.url ?? FULL_LIBRARY_URL, { headers: have ? { Range: `bytes=${have}-` } : {}, signal: opts.signal }).catch((e) => {
      if (opts.signal?.aborted) throw new FullLibraryError('aborted', 'Cancelled.')
      throw new FullLibraryError('network', `Could not reach the download (${e instanceof Error ? e.message : 'network'}).`)
    })
    if (res.status === 416) { setTotal(have); return }
    if (!res.ok) throw new FullLibraryError('network', `The download is not available yet (HTTP ${res.status}).`)
    const len = Number(res.headers.get('content-length')) || 0
    const range = /\/(\d+)\s*$/.exec(res.headers.get('content-range') || '')
    if (res.status === 200 && have) { await store.clear(); have = 0 } // the server ignored Range: start over
    const total = range ? Number(range[1]) : have + len
    if (!total) throw new FullLibraryError('network', 'The server did not say how big the library is.')
    const need = total - have
    const est = await navigator.storage?.estimate?.().catch(() => undefined)
    if (est && typeof est.quota === 'number' && typeof est.usage === 'number' && est.quota - est.usage < need + HEADROOM) {
      void res.body?.cancel().catch(() => undefined)
      throw new FullLibraryError('low-space', `Not enough free space. The library needs about ${Math.ceil(total / 1048576)} MB and this phone has ${Math.max(0, Math.floor((est.quota - est.usage) / 1048576))} MB free to use.`)
    }
    void navigator.storage?.persist?.().catch(() => undefined)
    setTotal(total)
    const reader = res.body?.getReader()
    if (!reader) throw new FullLibraryError('network', 'This browser cannot stream the download.')
    let buf: Uint8Array[] = []
    let buffered = 0
    const flush = async () => {
      if (!buffered) return
      const all = new Uint8Array(buffered)
      let at = 0
      for (const c of buf) { all.set(c, at); at += c.length }
      buf = []; buffered = 0
      await store.append(all)
    }
    try {
      for (;;) {
        const { done: end, value } = await reader.read()
        if (end) break
        buf.push(value); buffered += value.length; have += value.length
        opts.onProgress?.({ bytes: have, total })
        if (buffered >= 4 * 1048576) await flush()
      }
    } catch (e) {
      await flush().catch(() => undefined) // keep what arrived so the next try resumes
      if (opts.signal?.aborted) throw new FullLibraryError('aborted', 'Cancelled.')
      throw new FullLibraryError('network', `The download stopped (${e instanceof Error ? e.message : 'network'}). Tap Get to carry on.`)
    }
    await flush()
    if (have < total) throw new FullLibraryError('network', 'The download stopped early. Tap Get to carry on.')
    const head = await store.read(0, MAGIC.length)
    if (new TextDecoder().decode(head) !== MAGIC) {
      await store.clear(); setTotal(0)
      throw new FullLibraryError('bad-pack', 'The downloaded file is not a library pack. It was deleted.')
    }
  } catch (e) {
    if (e instanceof FullLibraryError && e.code === 'aborted') { await store.clear(); setTotal(0) }
    else lastError = e instanceof Error ? e.message : 'Download failed.'
    throw e
  } finally {
    active = false
  }
}

export async function remove(): Promise<void> {
  idx = null; lastError = ''
  await (await getStore()).clear()
  setTotal(0)
}

// ---- reading ----
const u32 = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true)
async function loadIndex() {
  if (idx) return idx
  const s = await getStore()
  const hl = u32(await s.read(MAGIC.length, MAGIC.length + 4))
  const ilAt = MAGIC.length + 4 + hl
  const il = u32(await s.read(ilAt, ilAt + 4))
  const rows: Idx['rows'] = JSON.parse(new TextDecoder().decode(await s.read(ilAt + 4, ilAt + 4 + il)))
  return (idx = { rows, base: ilAt + 4 + il })
}

async function gunzip(b: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const w = ds.writable.getWriter()
  void w.write(b as BufferSource).then(() => w.close())
  const r = ds.readable.getReader()
  const parts: Uint8Array[] = []
  for (;;) { const { done: end, value } = await r.read(); if (end) break; parts.push(value) }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return new TextDecoder().decode(out)
}

/** Title search over the downloaded pack: names that start with the query first, then word starts, then anywhere. Empty when the pack is not ready. */
export async function searchFullLibrary(q: string): Promise<FullHit[]> {
  const needle = q.trim().toLowerCase()
  if (needle.length < 2) return []
  try {
    if ((await getStatus()).state !== 'ready') return []
    const { rows } = await loadIndex()
    const scored: [number, FullHit][] = []
    for (const [key, title, , , lead] of rows) {
      const t = title.toLowerCase()
      const at = t.indexOf(needle)
      if (at < 0) continue
      const rank = at === 0 ? 0 : t[at - 1] === ' ' ? 1 : 2
      scored.push([rank * 1000 + t.length, { title, snippet: lead, key }])
    }
    return scored.sort((a, b) => a[0] - b[0]).slice(0, 20).map((s) => s[1])
  } catch { return [] }
}

export async function readArticle(key: string): Promise<FullArticleData | null> {
  try {
    if ((await getStatus()).state !== 'ready') return null
    const { rows, base } = await loadIndex()
    const r = rows.find((x) => x[0] === key)
    if (!r) return null
    return JSON.parse(await gunzip(await (await getStore()).read(base + r[2], base + r[2] + r[3])))
  } catch { return null }
}
