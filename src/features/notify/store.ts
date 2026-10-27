import Dexie, { type Table } from 'dexie'
import { supabase } from '../auth/client'
import { NOTIFY_KINDS, type NotifyKind, type TemplateId } from './templates'

// Family alert rows (carer_alerts, migration 0030), kept on this phone so the bell works offline with what was last seen.
// Own Dexie database (the family/store.ts pattern): nobody edits src/db.ts. Rows hold template ids and refs only, never values (B-7).
export interface AlertRow {
  id: string
  personId: string | null
  kind: NotifyKind
  template: TemplateId
  ref: string | null
  createdAt: string
  pushedAt: string | null
  seenAt: string | null
  expiresAt: string
}

class AlertsDB extends Dexie {
  alerts!: Table<AlertRow, string>
  constructor() {
    super('bantay-alerts')
    this.version(1).stores({ alerts: 'id, createdAt, expiresAt' })
  }
}
export const adb: Dexie & { alerts: Table<AlertRow, string> } = new AlertsDB()

/** The carer_alerts columns the app reads (snake_case, as the server sends them). */
export interface ServerAlert { id: string; person_id: string | null; kind: string; template: string; ref: string | null; created_at: string; pushed_at: string | null; seen_at: string | null; expires_at: string }
export const ALERT_COLUMNS = 'id,person_id,kind,template,ref,created_at,pushed_at,seen_at,expires_at'

const KINDS: readonly string[] = NOTIFY_KINDS
const stamp = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)

/** A server row as an AlertRow, or null when it is malformed or its kind is not one we know (a newer server than this app). */
export function fromServer(r: Partial<ServerAlert> | null | undefined): AlertRow | null {
  if (!r || typeof r.id !== 'string' || typeof r.kind !== 'string' || !KINDS.includes(r.kind) || typeof r.template !== 'string') return null
  const createdAt = stamp(r.created_at)
  const expiresAt = stamp(r.expires_at)
  if (!createdAt || !expiresAt) return null
  return { id: r.id, personId: r.person_id ?? null, kind: r.kind as NotifyKind, template: r.template as TemplateId, ref: r.ref ?? null, createdAt, pushedAt: stamp(r.pushed_at), seenAt: stamp(r.seen_at), expiresAt }
}

export const MAX_LOCAL_ALERTS = 200
export const KEEP_LOCAL_DAYS = 30

/** Unexpired rows, newest first. The bell and the lists hide anything past expires_at. */
export async function visibleAlerts(now: Date = new Date()): Promise<AlertRow[]> {
  const t = now.getTime()
  const rows = (await adb.alerts.toArray()).filter((r) => Date.parse(r.expiresAt) > t)
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/** Unexpired and not yet seen: drives the tab bar badge and the bell. */
export async function unseenCount(now: Date = new Date()): Promise<number> {
  return (await visibleAlerts(now)).filter((r) => r.seenAt == null).length
}

/** Keep at most 200 rows and nothing older than 30 days (ML-06). */
export async function pruneAlerts(now: Date = new Date()): Promise<void> {
  const cutoff = now.getTime() - KEEP_LOCAL_DAYS * 86_400_000
  const all = (await adb.alerts.toArray()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const drop = all.filter((r, i) => i >= MAX_LOCAL_ALERTS || Date.parse(r.createdAt) < cutoff).map((r) => r.id)
  if (drop.length) await adb.alerts.bulkDelete(drop)
}

/** Merge rows from the server (poll or Realtime). A seen mark made on this phone is kept when the server has not heard of it yet.
 *  Returns how many ids were new to this phone. */
export async function upsertAlerts(rows: AlertRow[]): Promise<number> {
  if (!rows.length) return 0
  const fresh = await adb.transaction('rw', adb.alerts, async () => {
    const have = await adb.alerts.bulkGet(rows.map((r) => r.id))
    await adb.alerts.bulkPut(rows.map((r, i) => ({ ...r, seenAt: r.seenAt ?? have[i]?.seenAt ?? null })))
    return have.filter((h) => !h).length
  })
  await pruneAlerts()
  return fresh
}

/** Local first (the dot goes now, offline too); then the server's seen_at through supabase-js (RLS: own rows, column grant).
 *  A failed server write is repeated by the next poll. */
export async function markSeen(id: string): Promise<void> {
  const at = new Date().toISOString()
  const row = await adb.alerts.get(id)
  if (!row || row.seenAt) return
  await adb.alerts.update(id, { seenAt: at })
  try { await supabase?.from('carer_alerts').update({ seen_at: at }).eq('id', id) } catch { /* offline: the poll sends it later */ }
}

/** "Mark all read": every unseen visible row. */
export async function markAllSeen(now: Date = new Date()): Promise<void> {
  for (const r of await visibleAlerts(now)) if (!r.seenAt) await markSeen(r.id)
}

/** Forget everything (sign-out, or a different person signing in on this phone). */
export const clearAlerts = () => adb.alerts.clear()
