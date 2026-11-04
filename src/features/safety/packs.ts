// Region packs on the phone (docs/local-data/APP-INTEGRATION.md section 3). Never blocks the UI and never throws to the caller.
// The province is worked out on the phone (unitAt); pack URLs are anonymous public files, so no position leaves the phone.
import { db, type PackRow } from '../../db'
import { pauseOnData, type Conn } from './stormPar'
import { type Entry, entriesFromPack, type PackPlace } from './entries'

export interface PackIndexEntry {
  code: string; name: string; version: number; checksum: string; size: number; rows: number; path: string; neighbours: string[]
  hazards?: { pack: string; version: number; checksum: string; size: number; path: string; bounds?: Record<string, number[]> }
}
export interface PackIndex { format: 1; built: string; packs: PackIndexEntry[] }
export interface PackFile { format: 1; province: string; name: string; neighbours: string[]; places: PackPlace[] }

/** Bohol, South Cotabato and the city of General Santos: always on the phone, never cleaned up. */
export const PINNED = ['0701200000', '1206300000', '1230800000'] as const
export const KEEP_DAYS = 60
const DAY = 86_400_000
export const BUCKET = 'region-packs'

export const packBase = (url = import.meta.env.VITE_SUPABASE_URL as string | undefined) => (url ? `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/` : null)
/** Wi-Fi (or a browser that does not say) is fine; mobile data and "data saver" are not. */
/** The hazard file is tens of MB: it needs positive evidence of Wi-Fi or ethernet, not just the absence of "cellular". */
export const strictWifi = (conn: Conn | null | undefined = (typeof navigator === 'undefined' ? null : (navigator as unknown as { connection?: Conn }).connection)) => (conn?.type === 'wifi' || conn?.type === 'ethernet') && conn.saveData !== true
export const onWifi = (conn: Conn | null | undefined = (typeof navigator === 'undefined' ? null : (navigator as unknown as { connection?: Conn }).connection)) => !pauseOnData(conn, true)

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** What to fetch, in order: the current unit, the pinned home units, then the current unit's neighbours (Wi-Fi or a tap only). */
export function downloadOrder(index: PackIndex, current: string | null, nearby: boolean): string[] {
  const here = index.packs.find((p) => p.code === current)
  const order = [...(current ? [current] : []), ...PINNED, ...(nearby && here ? here.neighbours : [])]
  return [...new Set(order)].filter((c) => index.packs.some((p) => p.code === c))
}

export interface Store {
  get(code: string): Promise<PackRow | undefined>
  put(row: PackRow): Promise<unknown>
  all(): Promise<PackRow[]>
  remove(code: string): Promise<unknown>
}
export const dexieStore: Store = { get: (c) => db.packs.get(c), put: (r) => db.packs.put(r), all: () => db.packs.toArray(), remove: (c) => db.packs.delete(c) }

export interface SyncDeps { fetch?: typeof fetch; base?: string | null; store?: Store; now?: number; wifi?: boolean; tapped?: boolean }
export interface SyncResult { fetched: string[]; bad: string[]; offline: boolean }

let indexCache: { at: number; value: PackIndex } | null = null
export const resetIndexCache = () => { indexCache = null }
async function loadIndex(f: typeof fetch, base: string, now: number): Promise<PackIndex | null> {
  if (indexCache && now - indexCache.at < 5 * 60_000) return indexCache.value
  try {
    const r = await f(`${base}index.json`)
    const j = r.ok ? ((await r.json()) as PackIndex) : null
    if (!j || j.format !== 1 || !Array.isArray(j.packs)) return null
    indexCache = { at: now, value: j }
    return j
  } catch { return null }
}

/** Download what is missing or changed. A file whose sha256 does not match the index is thrown away and tried again on the next run. */
export async function syncPacks(current: string | null, d: SyncDeps = {}): Promise<SyncResult> {
  const f = d.fetch ?? fetch, store = d.store ?? dexieStore, now = d.now ?? Date.now(), base = d.base === undefined ? packBase() : d.base
  const out: SyncResult = { fetched: [], bad: [], offline: false }
  if (!base) return { ...out, offline: true }
  const index = await loadIndex(f, base, now)
  if (!index) return { ...out, offline: true }
  for (const code of downloadOrder(index, current, (d.wifi ?? onWifi()) || d.tapped === true)) {
    const e = index.packs.find((p) => p.code === code)!
    const have = await store.get(code)
    if (have && have.checksum === e.checksum) { if (code === current) await store.put({ ...have, usedAt: now }); continue }
    try {
      const r = await f(`${base}${e.path}`)
      if (!r.ok) { out.bad.push(code); continue }
      const buf = await r.arrayBuffer()
      if ((await sha256Hex(buf)) !== e.checksum) { out.bad.push(code); continue }
      const file = JSON.parse(new TextDecoder().decode(buf)) as PackFile
      // a new version replaces the old one whole; a downloaded hazard file stays (it has its own checksum)
      await store.put({ ...have, code, version: e.version, checksum: e.checksum, name: file.name, neighbours: file.neighbours, places: file.places, fetchedAt: now, usedAt: now, pinned: (PINNED as readonly string[]).includes(code) })
      out.fetched.push(code)
    } catch { out.bad.push(code) }
  }
  return out
}

/** Unpinned packs not used for 60 days go. Returns the codes removed. */
export async function cleanup(store: Store = dexieStore, now = Date.now()): Promise<string[]> {
  const gone = (await store.all()).filter((r) => !r.pinned && now - r.usedAt > KEEP_DAYS * DAY).map((r) => r.code)
  await Promise.all(gone.map((c) => store.remove(c)))
  return gone
}

/** A hazard file (tens of MB) downloads on Wi-Fi, or when the member taps. Returns what happened. */
export async function downloadHazards(code: string, d: SyncDeps = {}): Promise<'done' | 'wait' | 'none' | 'bad' | 'offline'> {
  const f = d.fetch ?? fetch, store = d.store ?? dexieStore, base = d.base === undefined ? packBase() : d.base
  if (!(d.wifi ?? strictWifi()) && d.tapped !== true) return 'wait'
  if (!base) return 'offline'
  const index = await loadIndex(f, base, d.now ?? Date.now())
  if (!index) return 'offline'
  const hz = index.packs.find((p) => p.code === code)?.hazards
  if (!hz) return 'none'
  try {
    const owner = (await store.get(hz.pack)) ?? (await store.get(code))
    if (!owner) return 'none'
    const link = async () => { if (owner.code !== code) { const me = await store.get(code); if (me && me.hazardsFrom !== owner.code) await store.put({ ...me, hazardsFrom: owner.code }) } }
    if (owner.hazards?.checksum === hz.checksum) { await link(); return 'done' }
    const r = await f(`${base}${hz.path}`)
    if (!r.ok) return 'bad'
    const buf = await r.arrayBuffer()
    if ((await sha256Hex(buf)) !== hz.checksum) return 'bad'
    await store.put({ ...((await store.get(owner.code)) ?? owner), hazards: { checksum: hz.checksum, bounds: hz.bounds, blob: new Blob([buf]) } })
    await link()
    return 'done'
  } catch { return 'bad' }
}

const bundled = import.meta.glob('../../data/safety/packs/*/*.json', { import: 'default' }) as Record<string, () => Promise<PackFile>>
/** The pack baked into the app for a home unit; used only when the phone has no pack for that unit. */
export async function bundledPack(code: string): Promise<PackFile | null> {
  const key = Object.keys(bundled).find((k) => k.split('/').at(-2) === code)
  return key ? bundled[key]!() : null
}

const loaded = new Map<string, Entry[]>()
/** Read the unit's rows (phone first, bundled home pack second) into memory so entriesFor can answer at once. */
export async function loadPack(unit: string, store: Store = dexieStore, now = Date.now()): Promise<Entry[] | null> {
  try {
    const row = await store.get(unit)
    const places = (row?.places as PackPlace[] | undefined) ?? (await bundledPack(unit))?.places
    if (!places) return null
    if (row) await store.put({ ...row, usedAt: now }) // a pack in use is not cleaned up, even offline
    const e = entriesFromPack(places, now)
    loaded.set(unit, e)
    return e
  } catch { return null }
}
/** Contract: the unit's rows as Entry[]; [] until loadPack has read it. */
export const entriesFor = (unit: string): Entry[] => loaded.get(unit) ?? []
export const clearLoaded = () => loaded.clear()

/** The server's pack list (5-minute cache), or null offline. Used to offer the hazard download with its size. */
export const getIndex = (f: typeof fetch = fetch, base = packBase()) => (base ? loadIndex(f, base, Date.now()) : Promise.resolve(null))
