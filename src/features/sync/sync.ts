import type { Table } from 'dexie'
import { db, drain, enqueue, type FeedRow, type OutboxRow } from '../../db'
import { track } from '../admin/events'
import { supabase } from '../auth/client'
import { getAccessToken, getMember, onAuthChange, type Member } from '../auth/session'
import { drainQueue } from '../docs/api'
import { ALERTS_KEY, CHECKED_KEY, EONET_KEY, LAST_SEEN_KEY, splitEonet, STALE_KEY, type Alert, type StaleSources } from '../safety/alerts'
import { FLAGS } from '../safety/flags'
import { OVERRIDES_KEY } from '../safety/entries'
import { fdb } from '../family/store'
import { hourClientId, isSensorHour, ldb } from '../log/store'
import { hdb } from '../records/store'
import { vdb } from '../health/visitsStore'
import { applyPulledProfiles, PROFILE_COLS, syncOwnProfile } from './profile'
import { fromRow, isSyncable, naturalKey, PULL_TABLES, TABLES, toRow, toSnake } from './tables'

// Outbox -> Supabase REST, then the member's own rows back down. Health values only ever travel in POST bodies,
// are never logged, and an error is reduced to a short code before it is stored or shown.

export const MAX_TRIES = 5
export const PAGE = 1000
export const OVERLAP_MS = 60 * 60_000 // pull re-reads this much before the cursor, so a row committed late is not missed
const DETERMINISTIC = new Set([400, 403, 404, 409, 422])
/** Tables from a migration that may not be applied yet (0024). A push to a missing table waits in the outbox and local rows stay; it is not a dead letter and not a sync failure. */
const WAIT_FOR_TABLE = new Set(['food_entries', 'water_entries', 'nutrition_goals', 'family_messages', 'sos_events', 'sos_events_update', 'sos_acks', 'phone_health', 'family_feed'])
const NO_TABLE = /^(PGRST205|42P01)$/
/** A row waiting for a table the server lacks gives up after 24 h of elapsed time (not a calendar day, so 23:30 vs 00:30 makes no difference) and becomes a dead letter the person can see. */
export const WAIT_LIMIT_MS = 24 * 3600_000
/** Answers that are the same every time. An urgent row is never parked for them, but after MAX_TRIES it stops retrying by itself (`stuck`). */
const PERM_4XX = new Set([400, 403, 404, 422])
/** family_feed is a function, so a database without 0050 answers PGRST202 or 42883 (or 404). */
const NO_FEED = /^(PGRST202|PGRST205|42883|42P01)$/
export const SYNC_EVERY_MS = 5 * 60_000
/** Rows sent in one go. A first steps sync queues about 720. A safety row queued meanwhile waits for the rest of the batch and one alerts read, or for the full pull if that batch emptied the queue, then goes first. */
const BATCH = 50
/** Minutes to wait after the Nth network failure in a row: 1, 2, 4, 8, 16, then 30 at most. */
export const backoffMinutes = (fails: number) => (fails <= 0 ? 0 : Math.min(2 ** (fails - 1), 30))

/** `status` is the HTTP status of the last answer (absent on letters written before it was kept), so the sheet words a 5xx as a server problem whatever its code. */
export interface DeadLetter { table: string; op: string; clientId: string | null; code: string; at: number; payload: unknown; status?: number }
export interface SyncConfig { url?: string; key?: string; getToken?: () => Promise<string | null> }
export interface SyncState { ready: boolean; signedIn: boolean; offline: boolean; paused: boolean }

const BACKOFF_KEY = 'sync.backoff'
export const DEAD_KEY = 'sync.dead'
export const LAST_PULL_KEY = 'sync.lastPull'
const cursorKey = (t: string) => `sync.cursor.${t}`

class SyncError extends Error {
  constructor(public kind: 'net' | 'transient' | 'auth' | 'perm' | 'soft', public code = '', public status = 0) { super(kind) }
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
  const stuck = rows.filter((r) => r.stuck && isSyncable(r.table)).length // an SOS that could not be sent: counted with the ones that could not be sent, not the waiting
  const waiting = rows.filter((r) => isSyncable(r.table) && r.table !== 'usage_events' && !r.stuck).length
  const hidden = rows.filter((r) => r.table === 'usage_events').length
  const dead = (((await db.kv.get(DEAD_KEY))?.value as DeadLetter[] | undefined) ?? []).filter((d) => d.table !== 'usage_events').length
  return { waiting, unknown: rows.length - waiting - hidden - stuck, dead: dead + stuck }
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

async function deadLetter(row: OutboxRow, code: string, status?: number) {
  const list = ((await db.kv.get(DEAD_KEY))?.value as DeadLetter[] | undefined) ?? []
  const clientId = (row.payload as { client_id?: string } | null)?.client_id ?? null
  list.push({ table: row.table, op: row.op, clientId, code, at: Date.now(), payload: row.payload, ...(status ? { status } : {}) }) // kept locally so nothing is lost
  await db.kv.put({ key: DEAD_KEY, value: list })
  await db.outbox.delete(row.id!)
}

const localTable = (t: string): Table<{ id?: number }, number> | undefined =>
  ({ readings: hdb.readings, consults: hdb.consults, meds_taken: ldb.meds, activity: ldb.activity, medications: ldb.medications, family_tasks: fdb.tasks, family_events: fdb.events, family_notes: fdb.notes, appointments: vdb.appointments, prescriptions: vdb.followUps, food_entries: ldb.food, water_entries: ldb.water } as Record<string, Table<{ id?: number }, number>>)[t]

/** The server table a row writes to: sos_events_update PATCHes sos_events, so an update finds its insert across the two. */
const serverTable = (t: string) => TABLES[t].patch?.table ?? t

/** The server row an update aims at (`server table:id`), or the row an insert creates; null when there is none. */
const rowKey = (r: OutboxRow): string | null => {
  const p = r.payload as Record<string, unknown> | null
  const patch = TABLES[r.table]?.patch
  const id = r.op === 'update' ? p?.[patch ? patch.idField : 'id'] : r.op === 'insert' ? p?.id : null
  return id == null ? null : `${serverTable(r.table)}:${String(id)}`
}

/** True when this update's target row is still waiting as an insert: the server cannot have it yet, so a PATCH would answer 0 rows. */
async function insertQueued(row: OutboxRow): Promise<boolean> {
  if (row.op !== 'update') return false
  const k = rowKey(row)
  if (k == null) return false
  return (await db.outbox.where('table').equals(serverTable(row.table)).toArray()).some((r) => r.op === 'insert' && rowKey(r) === k)
}

async function sendRow(row: OutboxRow, token: string, failed: { row?: OutboxRow }) {
  const { url, key } = env()
  if (await insertQueued(row)) { failed.row = row; throw new SyncError('soft', 'insert-queued') } // wait for its insert; the try is not counted
  // client_id is minted once and saved on the row, so every retry of this row carries the same one.
  let payload = row.payload as Record<string, unknown>
  const spec = TABLES[row.table]
  const upd = row.op === 'update' ? spec.update : undefined // a changed row that is already on the server: PATCH its few editable columns by client_id
  let cid = ''
  if (upd) {
    cid = ((await (localTable(row.table) as Table<{ clientId?: string }, number> | undefined)?.get(payload.id as number))?.clientId) ?? ''
    if (!cid) return void (await db.outbox.delete(row.id!)) // the row is gone, or never reached the server: nothing to change
  } else if (!payload.client_id) {
    payload = { ...payload, client_id: row.table === 'activity' && isSensorHour(payload as never) ? await hourClientId(payload as never) : crypto.randomUUID() }
    await db.outbox.update(row.id!, { payload })
  }
  const newHour = !upd && row.table === 'activity' && isSensorHour(payload as never)
  if (row.table === 'sos_events') payload = { ...payload, sentAt: new Date().toISOString() } // the server marks the row late when sentAt is long after at (same phone clock); not saved, so a retry carries its own send time
  let res: Response
  try {
    if (upd) {
      // Another phone of this person can hold more for this hour, and this phone cannot see that from its own row. Only ever raise it. Read first because a value never goes in a URL filter.
      // shortcut: two phones can still cross between this read and the PATCH; a server-side rule would need a migration.
      const read = await fetch(`${url}/rest/v1/${row.table}?select=steps&client_id=eq.${encodeURIComponent(cid)}`, { headers: { apikey: key!, Authorization: `Bearer ${token}` } })
      // A read that may work later must not let a lower total through unchecked. A 401 or other 4xx goes on: the PATCH below answers with its own, which pauses sync or dead-letters the row.
      if (read.status === 408 || read.status === 429 || read.status >= 500) { failed.row = row; throw new SyncError('transient', await errCode(read), read.status) }
      const [onServer] = (read.ok ? await read.json().catch(() => []) : []) as { steps?: number | null }[]
      if ((onServer?.steps ?? -1) >= (payload.steps as number)) return
    }
    const patch = spec.patch // an edit of an existing row: PATCH it by id
    res = await fetch(upd ? `${url}/rest/v1/${row.table}?client_id=eq.${encodeURIComponent(cid)}` : patch ? `${url}/rest/v1/${patch.table}?id=eq.${encodeURIComponent(String(payload[patch.idField]))}` : `${url}/rest/v1/${row.table}?on_conflict=${spec.onConflict}`, {
      method: patch || upd ? 'PATCH' : 'POST',
      headers: {
        apikey: key!,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: patch || upd ? 'return=representation' : `resolution=${spec.resolution},return=${newHour ? 'representation' : 'minimal'}`
      },
      body: JSON.stringify(upd ? Object.fromEntries(upd.fields.map((f) => [toSnake(f), payload[f]])) : toRow(row.table, payload, payload.client_id as string))
    })
  } catch (e) {
    if (e instanceof SyncError) throw e
    failed.row = row
    throw new SyncError('net')
  }
  if (res.ok) {
    // A PATCH that RLS filters out answers 200 with no rows: treat it as refused, not saved.
    if ((spec.patch || upd) && !((await res.json().catch(() => [])) as unknown[]).length) {
      if (await insertQueued(row)) { failed.row = row; throw new SyncError('soft', 'insert-queued') } // its insert is still queued: retry, never a dead letter
      if (spec.urgent) { failed.row = row; throw new SyncError('transient', '0rows', res.status) } // an urgent PATCH (sos_events_update) that matched nothing is held, never parked: push() holds only this row with its own wait
      return deadLetter({ ...row, payload }, '0rows', res.status)
    }
    const lt = localTable(row.table)
    if (lt && !upd && typeof payload.id === 'number') await lt.update(payload.id, { clientId: payload.client_id } as never) // so pull recognises it
    // [] = the server already had this hour from another phone, and this insert changed nothing: send this phone's total as an update, which goes up only if it is larger.
    if (newHour && typeof payload.id === 'number' && ((await res.json().catch(() => null)) as unknown[] | null)?.length === 0) await enqueue(row.table, 'update', { id: payload.id, steps: payload.steps })
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
  if (res.status === 401) { failed.row = row; throw new SyncError('auth', code, res.status) }
  // An SOS is never dropped, but the server saying no (400/403/404/422) five times is not a reason to keep hammering: the row stays, marked stuck, retried only on its slow held schedule (or at once when the person taps Try again).
  if (spec.urgent && PERM_4XX.has(res.status)) {
    const n = (row.permFails ?? 0) + 1
    await db.outbox.update(row.id!, { permFails: n, ...(n >= MAX_TRIES ? { stuck: true } : {}) })
    failed.row = row; throw new SyncError('transient', code, res.status)
  }
  // A missing table waits as a whole. An urgent row's bare 404 (no table code) may be about this row only, so it is held below, row by row.
  if (WAIT_FOR_TABLE.has(row.table) && (NO_TABLE.test(code) || (res.status === 404 && !spec.urgent))) {
    if (Date.now() - row.createdAt >= WAIT_LIMIT_MS) return deadLetter({ ...row, payload }, 'wait-limit', res.status) // waited a day for a table that never came: now visible as a dead letter
    failed.row = row; throw new SyncError('soft', code, res.status)
  }
  // Urgent rows (SOS) are never dead-lettered, whatever the answer, and every answer (4xx, 5xx, 408, 429) is held as this row's own: push() skips only this row with its own next-try time, so an older stuck row never blocks a newer SOS. backoffMinutes caps at 30 min, so the retry is forever by design.
  if (spec.urgent) { failed.row = row; throw new SyncError('transient', code, res.status) }
  if (res.status === 408 || res.status === 429 || res.status >= 500) { failed.row = row; throw new SyncError('transient', code, res.status) }
  // 400/403/404/409/422 are the same answer every time: park the row at once (payload kept locally), keep going.
  if (row.table === 'usage_events' && (DETERMINISTIC.has(res.status) || row.tries + 1 >= MAX_TRIES)) return void (await db.outbox.delete(row.id!)) // tracking is never worth a banner: drop silently
  if (DETERMINISTIC.has(res.status) || row.tries + 1 >= MAX_TRIES) return deadLetter({ ...row, payload }, code, res.status)
  throw new SyncError('perm', code)
}

/** Try again on a row that got stuck (or all of them): clears the count so the next sync sends it. */
export async function retryStuck(id?: number): Promise<void> {
  for (const k of await db.outbox.filter((r) => !!r.stuck && (id == null || r.id === id)).primaryKeys()) await db.outbox.update(k, { stuck: false, permFails: 0 })
  void syncNow(true)
}

/** Held urgent rows by outbox id: each waits out its own next-try time (1, 2, 4 ... 30 min), so one old held SOS never puts the rest of sync into backoff. */
export const HELD_KEY = 'sync.held'
type Held = Record<string, { fails: number; nextAt: number }>
/** Urgent rows already held in this sync flight: each is tried at most once per flight, so many old held rows cannot cost extra drain passes or a retry per run. */
let heldThisFlight = new Set<number>()

/** `waiting` collects the tables the server does not have yet, `skip` the rows this run will not send (held, not due, or behind an insert that is not going): left queued, the other rows go on. `force` tries held rows before their next-try time. */
async function push(token: string, waiting: Set<string>, skip: Set<number>, force = false): Promise<SyncError | null> {
  let last: SyncError | null = null
  for (const r of await db.outbox.filter((x) => !isSyncable(x.table)).toArray()) await deadLetter(r, 'unknown-table') // no table of that name in this version: it can never be sent, so it is visible at once
  const ids = new Set(await db.outbox.toCollection().primaryKeys())
  const stored = ((await db.kv.get(HELD_KEY))?.value as Held | undefined) ?? {}
  const held: Held = Object.fromEntries(Object.entries(stored).filter(([id]) => ids.has(Number(id)))) // a sent or discarded row forgets its wait
  if (Object.keys(held).length !== Object.keys(stored).length) await db.kv.put({ key: HELD_KEY, value: held })
  const now = Date.now()
  const blocked = new Set<string>() // inserts this run will not send: an update aimed at one waits with it, row by row, never its whole table
  const sendable = (r: OutboxRow) => {
    if (!isSyncable(r.table)) return false
    const h = held[r.id!]
    // A stuck SOS is not hammered (never on a forced run), but it is still tried on its own slow schedule (backoff caps at 30 min): a server fixed later delivers it by itself (Opus S28 release review).
    if (waiting.has(r.table) || skip.has(r.id!) || (r.stuck && (force || !h || now < h.nextAt)) || heldThisFlight.has(r.id!) || (h && !force && now < h.nextAt)) {
      skip.add(r.id!)
      if (r.op === 'insert') { const k = rowKey(r); if (k) blocked.add(k) }
      return false
    }
    const k = r.op === 'update' ? rowKey(r) : null
    if (k && blocked.has(k)) { skip.add(r.id!); return false }
    return true
  }
  for (let pass = 0; pass < MAX_TRIES; pass++) {
    const failed: { row?: OutboxRow } = {}
    last = null
    await drain(async (row) => {
      try { await sendRow(row, token, failed) } catch (e) {
        last = e as SyncError
        await db.outbox.update(row.id!, { lastCode: e instanceof SyncError ? e.code || e.kind : 'error', lastStatus: e instanceof SyncError ? e.status || undefined : undefined, lastAt: Date.now() }) // the sheet shows why a row waits
        throw e
      }
    }, sendable, { first: (r) => !!TABLES[r.table].urgent, max: BATCH })
    const err = last as SyncError | null
    // An SOS must always get sent eventually: its try is given back (never a dead letter), any server answer skips only that row with its own next-try time, so every other row (a newer SOS too) still goes, and the run is not put into backoff.
    if (err && err.kind === 'transient' && failed.row && TABLES[failed.row.table].urgent) {
      const id = failed.row.id!
      await db.outbox.update(id, { tries: failed.row.tries })
      const fails = (held[id]?.fails ?? 0) + 1
      held[id] = { fails, nextAt: Date.now() + backoffMinutes(fails) * 60_000 }
      if (fails === 1) void track('error', 'sync_failed') // a stuck SOS stays visible in admin usage, once per streak as before
      await db.kv.put({ key: HELD_KEY, value: held })
      heldThisFlight.add(id); skip.add(id)
      last = null
      pass-- // each hold adds a new row to skip, so this is bounded by the due urgent rows, each once per flight
      continue
    }
    // An update whose insert is still queued waits by itself (its try is not counted); the rest of its table goes on.
    if (err?.kind === 'soft' && err.code === 'insert-queued' && failed.row) {
      await db.outbox.update(failed.row.id!, { tries: failed.row.tries })
      skip.add(failed.row.id!)
      last = null
      pass-- // bounded like a hold: each adds a new row to skip
      continue
    }
    // Network and 401 are not the row's fault: give back the try that drain counted. A 5xx/408/429 keeps it, so a row the server always fails on parks after MAX_TRIES and stops blocking the rows behind it.
    if (err && err.kind === 'transient' && failed.row && failed.row.tries + 1 >= MAX_TRIES) {
      const cur = (await db.outbox.get(failed.row.id!)) ?? failed.row
      if (cur.table === 'usage_events') await db.outbox.delete(cur.id!)
      else await deadLetter(cur, err.code || 'HTTP500', err.status)
      last = null
      continue
    }
    if (err && err.kind !== 'perm' && err.kind !== 'transient' && failed.row) await db.outbox.update(failed.row.id!, { tries: failed.row.tries })
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
      if (table === 'activity') {
        // Only a sensor hour whose total rose is taken (a late watch total, or the owner's other phone). A lower total, a hidden old-shape row and every other field stay as they are.
        if (mine && isSensorHour(local as never) && ((local.steps as number | null | undefined) ?? -1) > ((mine.steps as number | null | undefined) ?? -1)) {
          if (mine.id != null) await lt.update(mine.id, { steps: local.steps } as never); else mine.steps = local.steps
        }
        if (mine) continue
      } else if (mine) { if (mine.id != null) await lt.put({ ...local, id: mine.id }); else Object.assign(mine, local); continue } // put, not update: a field nulled on the server must clear here
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
  if (!fresh.length) return
  // A sensor read can store this very hour while the pull is on the wire. That row's own insert lands on the same client_id, so keep it and skip the pulled copy.
  const late = table === 'activity' ? new Set((await lt.toArray()).filter((r) => !r.clientId).map((r) => naturalKey[table](r))) : null
  await lt.bulkAdd(late ? fresh.filter((r) => !late.has(naturalKey[table](r))) : fresh)
}

/** Stored in place of a cursor that must re-read from the start. The medications cursor doubles as the "medicines pulled once" marker (MEDS_CURSOR, read by reminders), so it is never deleted: a reset with an empty read would re-arm the old text alarms for good. */
const RESTART = '1970-01-01T00:00:00.000Z'
const clearCursors = async () => {
  const held = new Set((await db.kv.bulkGet(PULL_TABLES.map(cursorKey))).filter(Boolean).map((r) => r!.key))
  await db.kv.bulkDelete(PULL_TABLES.map(cursorKey).filter((k) => k !== cursorKey('medications')))
  if (held.has(cursorKey('medications'))) await db.kv.put({ key: cursorKey('medications'), value: RESTART })
}
/** One re-read of every pull table on the owner's phone from the start (D-109): the owner's old doses and check-ins were out of reach before 0046. Set after the pull succeeds, so a failed one tries again. A failed pull repeating the reset is accepted: it only costs one more full read. */
export const CURSOR_RESET_KEY = 'sync.d109CursorReset'

async function pull(token: string) {
  const { url, key } = env()
  // Only the owner's phone needs the reset, and only once 0046 and the owner line are live: a late one must not spend it on a pull that reads nothing new. Unknown = not the owner.
  const m = await getMember().catch(() => null)
  const reset = !(await db.kv.get(CURSOR_RESET_KEY))?.value && m?.isOwner === true
  if (reset) await clearCursors()
  const hadCursors = (await db.kv.bulkGet(PULL_TABLES.map(cursorKey))).some((r) => r && r.value !== RESTART) // a pull from the start already reads a new person's rows
  await pullTables(url!, key!, token)
  // A person who appeared since the last sync has rows older than the cursors. pullPeople cleared the cursors before it stored the person (so a kill cannot lose the re-read); read the tables once more from the start. Once, not a loop: the person is stored now, so the next sync finds nobody new.
  const added = await pullPeople(url!, key!, token, hadCursors, m)
  if (added.length && hadCursors) await pullTables(url!, key!, token)
  await syncOwnProfile()
  await pullSafety(url!, key!, token)
  await pullAlerts(url!, key!, token)
  await pullGoals(url!, key!, token)
  await pullFeed(url!, key!, token)
  if (reset) await db.kv.put({ key: CURSOR_RESET_KEY, value: true })
}

async function pullTables(url: string, key: string, token: string) {
  for (const table of PULL_TABLES) {
    const lt = localTable(table) as unknown as Table<Local, number>
    const all = await lt.toArray()
    const seen = {
      ids: new Set(all.map((r) => r.clientId).filter((c): c is string => !!c)),
      keys: new Map(all.map((r) => [naturalKey[table](r), r] as const)),
      byCid: new Map(all.filter((r) => r.clientId).map((r) => [r.clientId!, r] as const))
    }
    let col: string = TABLES[table].cursor ?? 'created_at'
    const stored = (await db.kv.get(cursorKey(table)))?.value as string | undefined
    let cursor = stored === RESTART ? undefined : stored
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

// People: RLS limits this to the member and linked persons (an admin's policy reads everyone), so local Person.id == server people.id.
// Anything that creates a local person must use getMember().personId.
// Archived people are never pulled, but my own row always is (found by my user id, so it still comes when the person id is unknown). Returns the ids this phone had not seen before.
async function pullPeople(url: string, key: string, token: string, hadCursors: boolean, m: Member | null): Promise<string[]> {
  const uid = m?.userId && /^[0-9a-f-]{36}$/i.test(m.userId) ? m.userId : null
  const live = uid ? `&or=(archived_at.is.null,auth_user_id.eq.${uid})` : '&archived_at=is.null'
  const read = (cols: string) => getJson(`${url}/rest/v1/people?select=${cols}${live}`, key, token)
  let rows: Record<string, unknown>[]
  try {
    rows = await read(`id,display_name,kind,auth_user_id,${PROFILE_COLS}`)
  } catch (e) {
    // 42703 = people.kind does not exist yet (0046 not applied): without it, then names only (0010 not applied)
    if (!(e instanceof SyncError) || e.code !== '42703') throw e
    try {
      rows = await read(`id,display_name,auth_user_id,${PROFILE_COLS}`)
    } catch (e2) {
      if (!(e2 instanceof SyncError) || e2.code !== '42703') throw e2
      rows = await read('id,display_name,auth_user_id')
    }
  }
  // My own row, wherever the id came from: the member's person, else the row that carries my user id (an archived own row).
  const selfId = m?.personId ?? (uid ? ((rows.find((r) => r.auth_user_id === uid)?.id as string | undefined) ?? null) : null)
  // An empty answer is a real answer (every link removed), but without my own id there is no row to keep: unknown, so no purge (ML-05).
  if (!rows.length && !selfId) return []
  const known = new Set(await hdb.people.toCollection().primaryKeys())
  // My own id counts as new when other people were already known and I was not (a member attached to an existing person); never on a first-ever read.
  const added = rows.map((r) => r.id as string).filter((id) => !known.has(id) && (id !== selfId || known.size > 0))
  // Cleared before the person is stored: if the app dies between the two, the next sync still reads everything from the start.
  if (added.length && hadCursors) await clearCursors()
  await hdb.people.bulkPut(rows.map((r) => ({ id: r.id as string, name: r.display_name as string, ...(typeof r.kind === 'string' ? { kind: r.kind } : {}) })))
  await applyPulledProfiles(rows, selfId)
  // Without my user id I cannot tell my own archived row from a removed one: skip the purge (ML-05).
  if (!uid) return added
  // The server no longer sends archived (or unlinked) people: forget them here too. Only after a full successful pull, never my own row.
  const keep = new Set([...rows.map((r) => r.id as string), ...(selfId ? [selfId] : [])])
  const gone = (await hdb.people.toCollection().primaryKeys()).filter((id) => !keep.has(id))
  if (gone.length) {
    // shortcut: an archived person's table rows (readings, doses...) can still reach an owner's phone through the table pulls, though nobody lists them; no sweep. Upgrade if archived people's records must vanish from an owner's phone.
    // After "Stop sharing" nothing of theirs may stay on this phone: records, medicines, doses, food, water, goals, visits too (ML-07).
    const mine = (t: Table<{ personId: string }, number>) => t.where('personId').anyOf(gone).delete()
    await Promise.all([
      hdb.people.bulkDelete(gone), db.profiles.bulkDelete(gone),
      mine(hdb.readings as never), mine(hdb.consults as never),
      Promise.all(gone.map((id) => hdb.thresholds.where('key').startsWith(`${id}:`).delete())),
      mine(ldb.meds as never), mine(ldb.medications as never), mine(ldb.activity as never), mine(ldb.food as never), mine(ldb.water as never), ldb.goals.bulkDelete(gone),
      mine(vdb.appointments as never), mine(vdb.followUps as never)
    ])
  }
  return added
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
    rows = await getJson(`${url}/rest/v1/safety_alerts?select=*&or=(expires_at.is.null,expires_at.gt.${now})${FLAGS.eonet ? '' : '&kind=neq.eonet'}`, key, token)
  } catch (e) {
    if (e instanceof SyncError && (e.kind === 'net' || e.kind === 'auth')) throw e
    return
  }
  if (!Array.isArray(rows)) return
  const { official: list, eonet } = splitEonet(rows.map(toAlert).filter((a): a is Alert => a !== null))
  await db.kv.put({ key: ALERTS_KEY, value: list })
  if (FLAGS.eonet) await db.kv.put({ key: EONET_KEY, value: eonet }) // awareness rows live apart from the official list
  // Last event / Last storm: pullAlerts keeps only unexpired rows, so keep the newest quake and newest cyclone separately.
  const prev = ((await db.kv.get(LAST_SEEN_KEY))?.value as Alert[] | undefined) ?? []
  const newest = (pick: (a: Alert) => boolean) => [...list, ...prev].filter(pick).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0]
  const seen = [newest((a) => a.kind === 'quake'), newest((a) => a.kind === 'gdacs' && a.id.startsWith('gdacs-TC-'))].filter((a): a is Alert => !!a)
  await db.kv.put({ key: LAST_SEEN_KEY, value: seen })
  // The check time is when the ingest last wrote any row (the air row is rewritten every run), not when this phone asked: a stopped ingest must read as old.
  // A failed or empty read leaves the stored stamp as it was. The same read covers expired rows, so a failed source's stale flag reaches the phone on a quiet day (a good run clears it on all that source's rows).
  try {
    const stamps = await getJson(`${url}/rest/v1/safety_alerts?select=source,fetched_at,stale&order=fetched_at.desc&source=neq.EONET`, key, token) // EONET is awareness only: its freshness never marks the official feeds stale or moves the check time
    if (!Array.isArray(stamps)) return
    const at = iso(stamps[0]?.fetched_at)
    if (at) await db.kv.put({ key: CHECKED_KEY, value: at })
    const down: StaleSources = {}
    for (const r of stamps) if (r.stale === true && typeof r.source === 'string') down[r.source] ??= iso(r.fetched_at) // newest first: the source's last good run
    await db.kv.put({ key: STALE_KEY, value: down })
  } catch (e) {
    if (e instanceof SyncError && (e.kind === 'net' || e.kind === 'auth')) throw e
  }
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

// Family feed (D-134): the server list is the whole truth, so it REPLACES the local table (a stop-share, a deleted reading or a deleted photo leaves every phone at its next pull).
// Optional like alerts: without migration 0050 the feed is empty and sync reports nothing; only a lost network or a rejected session is rethrown.
const FEED_KINDS = new Set(['bp', 'lab', 'photo', 'status'])
const FEED_DAYS = 30
export function toFeedRow(r: Record<string, unknown>): FeedRow | null {
  const at = iso(r.at)
  if (typeof r.kind !== 'string' || !FEED_KINDS.has(r.kind) || typeof r.person_id !== 'string' || typeof r.row_id !== 'string' || !at) return null
  return { id: `${r.kind}|${r.row_id}`, kind: r.kind as FeedRow['kind'], personId: r.person_id, at, titleKey: str(r.title_key), valueText: typeof r.value_text === 'string' ? r.value_text : null, chip: typeof r.chip === 'string' ? r.chip : null, photoPath: typeof r.photo_path === 'string' ? r.photo_path : null, rowId: r.row_id }
}

export async function pullFeed(url?: string, key?: string, token?: string | null): Promise<void> {
  const e = env()
  const u = url ?? e.url
  const k = key ?? e.key
  const t = token ?? (u && k ? await cfg.getToken() : null)
  if (!u || !k || !t) return
  let rows: Record<string, unknown>[]
  try {
    let res: Response
    try {
      res = await fetch(`${u}/rest/v1/rpc/family_feed`, { method: 'POST', headers: { apikey: k, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_since: new Date(Date.now() - FEED_DAYS * 86_400_000).toISOString() }) })
    } catch { throw new SyncError('net') }
    if (res.status === 404) rows = []
    else if (!res.ok) {
      const code = await errCode(res)
      if (NO_FEED.test(code)) rows = []
      else throw new SyncError(res.status === 401 ? 'auth' : 'perm', code)
    } else rows = (await res.json()) as Record<string, unknown>[]
  } catch (err) {
    if (err instanceof SyncError && (err.kind === 'net' || err.kind === 'auth')) throw err
    return // any other failure leaves the feed as it was
  }
  if (!Array.isArray(rows)) return
  const list = rows.map(toFeedRow).filter((x): x is FeedRow => x !== null)
  await db.transaction('rw', db.feed, async () => { await db.feed.clear(); await db.feed.bulkPut(list) })
}

// ---- run
let inflight: Promise<void> | null = null

/** One batch up, then official alerts while rows remain, and the full pull once none do. True when rows that could go now are still queued: over the cap, or added during this run. */
async function run(force: boolean): Promise<boolean> {
  const { url, key } = env()
  const token = url && key ? await cfg.getToken() : null
  if (!token) { setState({ ready: true, signedIn: false }); return false }
  if (state.paused && token === pausedToken) return false // 401 pauses sync until a new session
  setState({ ready: true, signedIn: true, paused: false })
  void drainQueue(supabase) // waiting ID/insurance/scan uploads go up from here too, not only while the Docs screen is open (B-78); single flight
  const bo = (await db.kv.get(BACKOFF_KEY))?.value as { fails: number; nextAt: number } | undefined
  if (!force && bo && Date.now() < bo.nextAt) return false
  try {
    const waiting = new Set<string>()
    const skip = new Set<number>()
    const err = await push(token, waiting, skip, force)
    if (err) throw err
    const left = () => db.outbox.filter((r) => isSyncable(r.table) && !waiting.has(r.table) && !skip.has(r.id!)).count() // held rows are not "left": they wait for their own time, not for another run
    if (await left()) await pullAlerts(url!, key!, token) // a failing pull table must not hold back the rows behind this batch
    else {
      await pull(token)
      await db.kv.put({ key: LAST_PULL_KEY, value: Date.now() }) // when this phone last had fresh data (the offline bar says so)
    }
    await db.kv.delete(BACKOFF_KEY)
    setState({ offline: false })
    return (await left()) > 0
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
    return false
  }
}

/** A forced call joined a run in flight. Left set in the instant after a run ends, it forces the next one. */
let forceJoined = false
/** Bounds a run that keeps reporting rows it cannot send (a missing table hides the ones behind it). 2000 rows at most; the rest go on the next trigger. */
const MAX_RUNS = 40

async function runAll(force: boolean) {
  heldThisFlight = new Set()
  for (let i = 0; i < MAX_RUNS || forceJoined; i++) { // a joined SOS gets its run even at the cap; each extra run needs a new forced call
    force ||= forceJoined
    forceJoined = false
    // A run that ended on backoff or failure would drop the joined force, and an SOS would wait out the backoff (SosScreen).
    if (!(await run(force)) && !(forceJoined && (await db.outbox.filter((r) => isSyncable(r.table)).count()))) break
  }
  forceJoined = false
}

/** Run one sync now, batch after batch until nothing that can go is left. Single flight: a call during it joins it, and a row queued meanwhile goes in the next batch. `force` ignores the backoff wait (used when the network returns), and a forced join earns one more run if this one stops short. */
export const syncNow = (force = false): Promise<void> => {
  if (force && inflight) forceJoined = true
  return (inflight ??= runAll(force).finally(() => (inflight = null)))
}

/** Test helper: forget in-memory state. */
export function resetSyncForTests() {
  inflight = null
  forceJoined = false
  pausedToken = null
  heldThisFlight = new Set()
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
