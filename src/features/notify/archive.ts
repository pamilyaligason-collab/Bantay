import { useEffect, useState } from 'react'
import type { AlertRow } from './store'
import { todayRed } from './todayRed'

// "Archive all" (S22 H): past family alerts leave Today in one tap. Local only: the archive list lives in localStorage (no server column);
// the server only hears the existing seen_at mark (so ops seen-rate metrics count archived rows as seen; the local list is the only archived flag, no migration). Rows hold template ids and refs, never values (B-7).
export const ARCHIVE_KEY = 'bantay.alerts.archived'
export const OLD_AFTER_MS = 24 * 3_600_000
export const KEEP_ARCHIVED = 50
export const KEEP_ARCHIVED_DAYS = 30
export const MIN_TO_OFFER = 2

export interface Archived { row: AlertRow; at: string }

/** Exactly the red notices Today can show (todayRed: unseen, urgent, same kinds) that are past 24 h, so the button count is what leaves Today. A live SOS never goes. Active official warnings are not family alert rows. */
export function archivable(rows: AlertRow[], archivedIds: ReadonlySet<string>, now: number = Date.now()): AlertRow[] {
  return todayRed(rows).filter((r) => !archivedIds.has(r.id) && Date.parse(r.expiresAt) > now && now - Date.parse(r.createdAt) > OLD_AFTER_MS && r.kind !== 'sos')
}

export function readArchive(now: number = Date.now()): Archived[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    const cutoff = now - KEEP_ARCHIVED_DAYS * 86_400_000
    return v.filter((a): a is Archived => !!a && typeof a.at === 'string' && typeof a.row?.id === 'string' && Date.parse(a.at) > cutoff).slice(0, KEEP_ARCHIVED)
  } catch { return [] }
}

export const ARCHIVE_EVENT = 'bantay:archive'

function write(list: Archived[]): void {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, KEEP_ARCHIVED))) } catch { /* private window: the archive is just not kept */ }
  try { window.dispatchEvent(new Event(ARCHIVE_EVENT)) } catch { /* no window */ }
}

/** Ids of archived rows, live: the Family inbox hides them (they stay in Archived on Today, and Undo brings them back). */
export function useArchivedIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(readArchive().map((a) => a.row.id)))
  useEffect(() => {
    const on = () => setIds(new Set(readArchive().map((a) => a.row.id)))
    window.addEventListener(ARCHIVE_EVENT, on)
    return () => window.removeEventListener(ARCHIVE_EVENT, on)
  }, [])
  return ids
}

/** Newest first, capped (ML-06). */
export function addArchived(rows: AlertRow[], now: number = Date.now()): void {
  const at = new Date(now).toISOString()
  write([...rows.map((row) => ({ row, at })), ...readArchive(now)])
}

export function removeArchived(ids: string[]): void {
  const drop = new Set(ids)
  write(readArchive().filter((a) => !drop.has(a.row.id)))
}
