import type { Table } from 'dexie'
import { db, drain, type OutboxRow } from '../../db'
import { track } from '../admin/events'
import { supabase } from '../auth/client'
import { getAccessToken, onAuthChange } from '../auth/session'
import { drainQueue } from '../docs/api'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { OVERRIDES_KEY } from '../safety/entries'
import { fdb } from '../family/store'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { vdb } from '../health/visitsStore'
import { applyPulledProfiles, PROFILE_COLS, selfIdNow, syncOwnProfile } from './profile'
import { fromRow, isSyncable, naturalKey, PULL_TABLES, TABLES, toRow } from './tables'

// Outbox -> Supabase REST, then the member's own rows back down. Health values only ever travel in POST bodies,
// are never logged, and an error is reduced to a short code before it is stored or shown.

export const MAX_TRIES = 5
export const PAGE = 1000
export const OVERLAP_MS = 60 * 60_000 // pull re-reads this much before the cursor, so a row committed late is not missed
const DETERMINISTIC = new Set([400, 403, 404, 409, 422])
/** Tables from a migration that may not be applied yet (0024). A push to a missing table waits in the outbox and local rows stay; it is not a dead letter and not a sync failure. */
const WAIT_FOR_TABLE = new Set(['food_entries', 'water_entries', 'nutrition_goals', 'family_messages', 'sos_events', 'sos_events_update', 'sos_acks', 'phone_health'])
const NO_TABLE = /^(PGRST205|42P01)$/
export const SYNC_EVERY_MS = 5 * 60_000
/** Minutes to wait after the Nth network failure in a row: 1, 2, 4, 8, 16, then 30 at most. */
export const backoffMinutes = (fails: number) => (fails <= 0 ? 0 : Math.min(2 ** (fails - 1), 30))

export interface DeadLetter { table: string; op: string; clientId: string | null; code: string; at: number; payload: unknown }
export interface SyncConfig { url?: string; key?: string; getToken?: () => Promise<string | null> }
export interface SyncState { ready: boolean; signedIn: boolean; offline: boolean; paused: boolean }

const BACKOFF_KEY = 'sync.backoff'
export const DEAD_KEY = 'sync.dead'
export const LAST_PULL_KEY = 'sync.lastPull'
const cursorKey = (t: string) => `sync.cursor.${t}`

class SyncError extends Error {
  constructor(public kind: 'net' | 'transient' | 'auth' | 'perm' | 'soft', public code = '') { super(kind) }
}

// ---- status store (module level, read by <SyncStatus/> through useSyncExternalStore)
let state: SyncState = { ready: false, signedIn: false, offline: typeof navigator !== 'undefined' && navigator.onLine === false, paused: false }
const listeners = new Set<() => void>()
const setState = (p: Partial<SyncState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
export const getSyncState = () => state
export const subscribeSync = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export async function syncCounts() {
  const rows = await db.outbox.toArray()
  // usage_events (screen tracking) still sync, but a new row on every tab switch must not make the header count climb
  const waiting = rows.filter((r) => isSyncable(r.table) && r.table !== 'usage_events').length
  const hidden = rows.filter((r) => r.table === 'usage_events').length
  const dead = (((await db.kv.get(DEAD_KEY))?.value as DeadLetter[] | undefined) ?? []).filter((d) => d.table !== 'usage_events').length
  return { waiting, unknown: rows.length - waiting - hidden, dead }
}

// ---- config
let cfg: Required<Pick<SyncConfig, 'getToken'>> & SyncConfig = { getToken: getAccessToken }
const env = () => ({
  url: (cfg.url ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined))?.replace(/\/$/, ''),
  key: cfg.key ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
})

let pausedToken: string | null = null

// ---- push
const errCode = async (res: Response) => {
  try {
    const c = ((await res.json()) as { code?: unknown }).code
    if (typeof c === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(c)) return c // the code only: messages can quote row values
  } catch { /* no body */ }
  return `HTTP${res.status}`
}

async function deadLetter(row: OutboxRow, code: string) {
  const list = ((await db.kv.get(DEAD_KEY))?.value as DeadLetter[] | undefined) ?? []
  const clientId = (row.payload as { client_id?: string } | null)?.client_id ?? null
  list.push({ table: row.table, op: row.op, clientId, code, at: Date.now(), payload: row.payload }) // kept locally so nothing is lost
  await db.kv.put({ key: DEAD_KEY, value: list })
  await db.outbox.delete(row.id!)
}

const localTable = (t: string): Table<{ id?: number }, number> | undefined =>
  ({ readings: hdb.readings, consults: hdb.consults, meds_taken: ldb.meds, activity: ldb.activity, medications: ldb.medications, family_tasks: fdb.tasks, family_events: fdb.events, family_notes: fdb.notes, appointments: vdb.appointments, prescriptions: vdb.followUps, food_entries: ldb.food, water_entries: ldb.water } as Record<string, Table<{ id?: number }, number>>)[t]

async function sendRow(row: OutboxRow, token: string, failed: { row?: OutboxRow }) {
  const { url, key } = env()
  // client_id is minted once and saved on the row, so every retry of this row carries the same one.
  let payload = row.payload as Record<string, unknown>
  if (!payload.client_id) {
    payload = { ...payload, client_id: crypto.randomUUID() }
    await db.outbox.update(row.id!, { payload })
  }
  if (row.table === 'sos_events') payload = { ...payload, sentAt: new Date().toISOString() } // the server marks the row late when sentAt is long after at (same phone clock); not saved, so a retry carries its own send time
  const spec = TABLES[row.table]
  let res: Response
  try {
    const patch = spec.patch // an edit of an existing row: PATCH it by id
    res = await fetch(patch ? `${url}/rest/v1/${patch.table}?id=eq.${encodeURIComponent(String(payload[patch.idField]))}` : `${url}/rest/v1/${row.table}?on_conflict=${spec.onConflict}`, {
      method: patch ? 'PATCH' : 'POST',
      headers: {
        apikey: key!,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: patch ? 'return=representation' : `resolution=${spec.resolution},return=minimal`
      },
      body: JSON.stringify(toRow(row.table, payload, payload.client_id as string))
    })
  } catch {
    failed.row = row
    throw new SyncError('net')
  }
  if (res.ok) {
    // A PATCH that RLS filters out answers 200 with no rows: treat it as refused, not saved.
    if (spec.patch && !((await res.json().catch(() => [])) as unknown[]).length) return deadLetter({ ...row, payload }, '0rows')
    const lt = localTable(row.table)
    if (lt && typeof payload.id === 'number') await lt.update(payload.id, { clientId: payload.client_id } as never) // so pull recognises it
    return
  }
  const code = await errCode(res)
  // Before migration 0015 is applied there is no client_at column: PostgREST answers 400 PGRST204. Send the same event once more without it (the time is only for ordering).
  if (row.table === 'usage_events' && res.status === 400 && code === 'PGRST204' && payload.clientAt !== undefined) {
    const { clientAt: _drop, ...rest } = payload
    await db.outbox.update(row.id!, { payload: rest })
    return sendRow({ ...row, payload: rest }, token, failed)
  }
  if (res.status === 403 && row.table === 'push_subscriptions') { void track('error', 'push_failed'); return void (await db.outbox.delete(row.id!)) } // not allowed to subscribe (e.g. disabled): drop, no dead letter, visible in admin usage
  if (res.status === 401) { failed.row = row; throw new SyncError('auth', code) }
  if (WAIT_FOR_TABLE.has(row.table) && (NO_TABLE.test(code) || res.status === 404)) { failed.row = row; throw new SyncError('soft', code) }
  if (res.status === 408 || res.status === 429 || res.status >= 500) { failed.row = row; throw new SyncError('transient', code) }
  // 400/403/404/409/422 are the same answer every time: park the row at once (payload kept locally), keep going.
  if (row.table === 'usage_events' && (DETERMINISTIC.has(res.status) || row.tries + 1 >= MAX_TRIES)) return void (await db.outbox.delete(row.id!)) // tracking is never worth a banner: drop silently
  if (DETERMINISTIC.has(res.status) || row.tries + 1 >= MAX_TRIES) return deadLetter({ ...row, payload }, code)
  throw new SyncError('perm', code)
}

async function push(token: string): Promise<SyncError | null> {
  let last: SyncError | null = null
  const waiting = new Set<string>() // tables the server does not have yet: left queued for this run, the other rows go on
  for (let pass = 0; pass < MAX_TRIES; pass++) {
    const failed: { row?: OutboxRow } = {}
    last = null
    await drain(async (row) => {
      try { await sendRow(row, token, failed) } catch (e) { last = e as SyncError; throw e }
    }, (r) => isSyncable(r.table) && !waiting.has(r.table))
    const err = last as SyncError | null
    // Network, 401 and 5xx are not the row's fault: give back the try that drain counted.
    if (err && err.kind !== 'perm' && failed.row) await db.outbox.update(failed.row.id!, { tries: failed.row.tries })
    if (err?.kind === 'soft') { waiting.add(failed.row!.table); last = null; continue }
    if (!err || err.kind !== 'perm') return err
  }
  return last // a permanent error that is still pending after MAX_TRIES passes cannot happen (it is dead-lettered); defensive
}

// ---- pull
type Local = Record<string, unknown> & { id?: number; clientId?: string }

async function merge(table: string, rows: Record<string, unknown>[], seen: { ids: Set<string>; keys: Map<string, Local>; byCid: Map<string, Local> }, lt: Table<Local, number>) {
  const fresh: Local[] = []
  for (const r of rows) {
    const cid = r.client_id as string
    const local = fromRow(table, r) as Local
    if (TABLES[table].cursor) {
      // mutable server rows: upsert by client_id, and a tombstone removes the local copy (no duplicate on re-confirm)
      const mine = seen.byCid.get(cid)
      if (r.deleted_at) {
        if (mine?.id != null) await lt.delete(mine.id)
        else if (mine) fresh.splice(fresh.indexOf(mine), 1) // added earlier in this same pull
        seen.byCid.delete(cid); seen.ids.delete(cid)
        continue
      }
      if (mine) { if (mine.id != null) await lt.put({ ...local, id: mine.id }); else Object.assign(mine, local); continue } // put, not update: a field nulled on the server must clear here
    }
    if (seen.ids.has(cid)) continue
    const twin = seen.keys.get(naturalKey[table](local))
    if (twin && !twin.clientId) {
      twin.clientId = cid // a row from this device that was sent before it got stamped
      await lt.update(twin.id!, { clientId: cid })
      seen.byCid.set(cid, twin)
    } else {
      fresh.push(local) // new, or the twin is a different row that happens to look alike
      seen.byCid.set(cid, local)
      if (!twin) seen.keys.set(naturalKey[table](local), local)
    }
    seen.ids.add(cid)
  }
  if (fresh.length) await lt.bulkAdd(fresh)
}

async function pull(token: string) {
  const { url, key } = env()
  for (const table of PULL_TABLES) {
    const lt = localTable(table) as unknown as Table<Local, number>
    const all = await lt.toArray()
    const seen = {
      ids: new Set(all.map((r) => r.clientId).filter((c): c is string => !!c)),
      keys: new Map(all.map((r) => [naturalKey[table](r), r] as const)),
      byCid: new Map(all.filter((r) => r.clientId).map((r) => [r.clientId!, r] as const))
    }
    let col: string = TABLES[table].cursor ?? 'created_at'
    let cursor = (await db.kv.get(cursorKey(table)))?.value as string | undefined
    let from = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : undefined
    for (let page = 0; page < 20; page++) {
      const page_ = (c: string) => getJson(`${url}/rest/v1/${table}?select=*&order=${c}.asc&limit=${PAGE}` + (from ? `&${c}=gte.${encodeURIComponent(from)}` : ''), key!, token)
      let rows: Record<string, unknown>[] = []
      try {
        rows = await page_(col)
      } catch (e) {
        // PGRST205 / 42P01 = the table is not created yet (migration 0012 not applied): skip this table, the rest carry on
        if (e instanceof SyncError && (e.code === 'PGRST205' || e.code === '42P01')) break
        // 42703 = the column does not exist yet (migration 0008 not applied): this table falls back to created_at, the rest carry on
        if (col === 'created_at' || !(e instanceof SyncError) || e.code !== '42703') throw e
        col = 'created_at'
        rows = await page_(col)
      }
      await merge(table, rows, seen, lt)
      const last = rows.length ? (rows[rows.length - 1][col] as string) : undefined
      if (last && (!cursor || Date.parse(last) > Date.parse(cursor))) {
        cursor = last
        await db.kv.put({ key: cursorKey(table), value: cursor })
      }
      if (rows.length < PAGE || !last || last === from) break // ponytail: PAGE rows sharing one created_at would stall; unrealistic at family scale
      from = last
    }
  }
  await pullPeople(url!, key!, token)
  await syncOwnProfile()
  await pullSafety(url!, key!, token)
  await pullAlerts(url!, key!, token)
  await pullGoals(url!, key!, token)
}

async function getJson(u: string, key: string, token: string): Promise<Record<string, unknown>[]> {
  let res: Response
  try { res = await fetch(u, { headers: { apikey: key, Authorization: `Bearer ${token}` } }) } catch { throw new SyncError('net') }
  if (!res.ok) {
    const code = await errCode(res)
    throw new SyncError(res.status === 401 ? 'auth' : res.status === 408 || res.status === 429 || res.status >= 500 ? 'transient' : 'perm', code)
  }
  return (await res.json()) as Record<string, unknown>[]
}

// People: RLS limits this to the member and linked persons, so local Person.id == server people.id.
// Anything that creates a local person must use getMember().personId.
async function pullPeople(url: string, key: string, token: string) {
  let rows: Record<string, unknown>[]
  try {
    rows = await getJson(`${url}/rest/v1/people?select=id,display_name,${PROFILE_COLS}`, key, token)
  } catch (e) {
    // 42703 = the profile columns do not exist yet (migration 0010 not applied): names only
    if (!(e instanceof SyncError) || e.code !== '42703') throw e
    rows = await getJson(`${url}/rest/v1/people?select=id,display_name`, key, token)
  }
  if (!rows.length) return
  await hdb.people.bulkPut(rows.map((r) => ({ id: r.id as string, name: r.display_name as string })))
  const selfId = await selfIdNow()
  await applyPulledProfiles(rows, selfId)
  // The server no longer sends archived (or unlinked) people: forget them here too. Only after a full successful pull, never my own row.
  const keep = new Set([...rows.map((r) => r.id as string), ...(selfId ? [selfId] : [])])
  const gone = (await hdb.people.toCollection().primaryKeys()).filter((id) => !keep.has(id))
  if (gone.length) await Promise.all([hdb.people.bulkDelete(gone), db.profiles.bulkDelete(gone)])
}

// Admin safety edits go into the same kv map the safety screens read: { [id]: patch }. A removed edit drops the key.
async function pullSafety(url: string, key: string, token: string) {
  const rows = await getJson(`${url}/rest/v1/safety_overrides?select=kind,key,data,removed`, key, token)
  if (!rows.length) return
  const cur = { ...(((await db.kv.get(OVERRIDES_KEY))?.value as Record<string, unknown> | undefined) ?? {}) }
  for (const r of rows) {
    if (r.removed || r.data == null) delete cur[r.key as string]
    else cur[r.key as string] = r.data
  }
  await db.kv.put({ key: OVERRIDES_KEY, value: cur })
}

// Official alerts (D-25): the server list is the whole truth, so it REPLACES the kv list (an empty list clears old alerts).
// A failed fetch leaves the kv list as it was. Alerts are optional: a missing table or a server error must not put the
// health sync into backoff, so only a lost network or a rejected session is rethrown.
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)
const pt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export function toAlert(r: Record<string, unknown>): Alert | null {
  const issuedAt = iso(r.issued_at)
  if (typeof r.id !== 'string' || typeof r.kind !== 'string' || !r.title || !issuedAt) return null
  return {
    id: r.id, kind: r.kind as Alert['kind'], level: typeof r.level === 'string' ? r.level : null, title: str(r.title), what: str(r.what),
    where: str(r.where_text), when: str(r.when_text), doNow: str(r.do_now), source: str(r.source), sourceUrl: typeof r.source_url === 'string' ? r.source_url : null,
    issuedAt, lat: pt(r.lat), lon: pt(r.lon), bulletin: str(r.bulletin), previousBulletin: typeof r.previous_bulletin === 'string' ? r.previous_bulletin : null,
    checklist: Array.isArray(r.checklist) ? (r.checklist as string[]) : undefined, timeline: Array.isArray(r.timeline) ? (r.timeline as Alert['timeline']) : undefined,
    stale: r.stale === true, checkedAt: iso(r.fetched_at)
  }
}

async function pullAlerts(url: string, key: string, token: string) {
  const now = encodeURIComponent(new Date().toISOString())
  let rows: Record<string, unknown>[]
  try {
    rows = await getJson(`${url}/rest/v1/safety_alerts?select=*&or=(expires_at.is.null,expires_at.gt.${now})`, key, token)
  } catch (e) {
    if (e instanceof SyncError && (e.kind === 'net' || e.kind === 'auth')) throw e
    return
  }
  if (!Array.isArray(rows)) return
  await db.kv.put({ key: ALERTS_KEY, value: rows.map(toAlert).filter((a): a is Alert => a !== null) })
}

// Salt and water goals (0024): one small row per person the member may see. A goal edited here and not yet sent wins over the server copy.
// Optional like alerts: a missing table or a server error leaves the local goals as they were.
async function pullGoals(url: string, key: string, token: string) {
  let rows: Record<string, unknown>[]
  try {
    rows = await getJson(`${url}/rest/v1/nutrition_goals?select=*`, key, token)
  } catch (e) {
    if (e instanceof SyncError && (e.kind === 'net' || e.kind === 'auth')) throw e
    return
  }
  if (!Array.isArray(rows)) return
  const queued = new Set((await db.outbox.where('table').equals('nutrition_goals').toArray()).map((r) => (r.payload as { personId?: string }).personId))
  for (const r of rows) {
    const sodiumMg = pt(r.sodium_mg)
    const waterMl = pt(r.water_ml)
    if (typeof r.person_id !== 'string' || queued.has(r.person_id) || sodiumMg == null || waterMl == null) continue
    // potassium_mg and sex come with migration 0026; a project without it just has no such keys (null)
    await ldb.goals.put({ personId: r.person_id, sodiumMg, waterMl, potassiumMg: pt(r.potassium_mg), sex: r.sex === 'female' || r.sex === 'male' ? r.sex : null, ...(iso(r.updated_at) ? { updatedAt: iso(r.updated_at)! } : {}) })
  }
}

// ---- run
let inflight: Promise<void> | null = null

async function run(force: boolean) {
  const { url, key } = env()
  const token = url && key ? await cfg.getToken() : null
  if (!token) return setState({ ready: true, signedIn: false })
  if (state.paused && token === pausedToken) return // 401 pauses sync until a new session
  setState({ ready: true, signedIn: true, paused: false })
  void drainQueue(supabase) // waiting ID/insurance/scan uploads go up from here too, not only while the Docs screen is open (B-78); single flight
  const bo = (await db.kv.get(BACKOFF_KEY))?.value as { fails: number; nextAt: number } | undefined
  if (!force && bo && Date.now() < bo.nextAt) return
  try {
    const err = await push(token)
    if (err) throw err
    await pull(token)
    await db.kv.put({ key: LAST_PULL_KEY, value: Date.now() }) // when this phone last had fresh data (the offline bar says so)
    await db.kv.delete(BACKOFF_KEY)
    setState({ offline: false })
  } catch (e) {
    const err = e instanceof SyncError ? e : new SyncError('net')
    // Track once per failure streak (bo unset), never for offline; perm errors back off too, so a tracked
    // usage_events row cannot re-trigger a failing run every 3 s.
    if (err.kind !== 'net' && !bo) void track('error', 'sync_failed')
    if (err.kind === 'auth') { pausedToken = token; setState({ paused: true }) }
    else {
      const fails = (bo?.fails ?? 0) + 1
      await db.kv.put({ key: BACKOFF_KEY, value: { fails, nextAt: Date.now() + backoffMinutes(fails) * 60_000 } })
      if (err.kind === 'net') setState({ offline: true })
    }
  }
}

/** Run one sync now. Single flight: a call during a run joins it. `force` ignores the backoff wait (used when the network returns). */
export const syncNow = (force = false): Promise<void> => (inflight ??= run(force).finally(() => (inflight = null)))

/** Test helper: forget in-memory state. */
export function resetSyncForTests() {
  inflight = null
  pausedToken = null
  state = { ready: false, signedIn: false, offline: false, paused: false }
}

let stop: (() => void) | null = null

/** Start background sync: on start, when the network returns, when the app is shown, every 5 minutes while visible,
 *  and shortly after a row is queued. Returns a stop function. Does nothing until there is a session token. */
export function startSync(config: SyncConfig = {}): () => void {
  stop?.()
  cfg = { getToken: getAccessToken, ...config }
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
  const go = () => void syncNow()
  let nudge: ReturnType<typeof setTimeout> | undefined
  const onQueued = () => { clearTimeout(nudge); nudge = setTimeout(go, 3000) }
  const queuedHook = () => { onQueued() }
  const online = () => { setState({ offline: false }); void syncNow(true) }
  const offline = () => setState({ offline: true })
  const shown = () => { if (visible()) go() }
  window.addEventListener('online', online)
  window.addEventListener('offline', offline)
  document.addEventListener('visibilitychange', shown)
  const timer = setInterval(() => { if (visible()) go() }, SYNC_EVERY_MS)
  const offAuth = onAuthChange(() => { pausedToken = null; setState({ paused: false }); void syncNow(true) })
  db.outbox.hook('creating', queuedHook)
  go()
  return (stop = () => {
    window.removeEventListener('online', online)
    window.removeEventListener('offline', offline)
    document.removeEventListener('visibilitychange', shown)
    clearInterval(timer)
    clearTimeout(nudge)
    offAuth()
    db.outbox.hook('creating').unsubscribe(queuedHook)
    stop = null
  })
}
