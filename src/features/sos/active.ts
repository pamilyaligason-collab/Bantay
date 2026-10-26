import { db } from '../../db'

export const SOS_ACTIVE_KEY = 'sos.active'
export const SOS_CONTACTS_KEY = 'sos.contacts'
/** The SOS in progress. `recorded` = the row is in the outbox; `at` = end of the hold (ISO, phone clock). Kept so a WebView killed during a long call resumes on the status screen. */
export interface SosActive { id: string; step: 'recorded' | 'calling' | 'texting' | 'status'; at: string; contactIndex: 0 | 1 }

/** An SOS older than this is history, not something to resume. */
const STALE_MS = 12 * 3_600_000
/** The composer opens by itself only while the SOS is this young and not cancelled (otherwise it is a button). */
export const AUTO_TEXT_MS = 10 * 60_000

let fresh: { id: string; at: string } | null = null

/** The hold finished: keep it in memory at once (the screen mounts in the same tick); the screen saves it to kv once it is recorded. */
export function startSos(now = Date.now()): { id: string; at: string } {
  fresh = { id: crypto.randomUUID(), at: new Date(now).toISOString() }
  return fresh
}
/** SosScreen takes the just-started SOS exactly once; null when it was mounted to resume. */
export function takeFresh(): { id: string; at: string } | null {
  const f = fresh
  fresh = null
  return f
}

const valid = (v: unknown): v is SosActive => {
  const a = v as SosActive | null
  return !!a && typeof a.id === 'string' && typeof a.at === 'string' && Number.isFinite(Date.parse(a.at))
    && ['recorded', 'calling', 'texting', 'status'].includes(a.step) && (a.contactIndex === 0 || a.contactIndex === 1)
}
export async function loadActive(now = Date.now()): Promise<SosActive | null> {
  const v = (await db.kv.get(SOS_ACTIVE_KEY).catch(() => undefined))?.value
  return valid(v) && now - Date.parse(v.at) < STALE_MS ? v : null
}
export const saveActive = (a: SosActive) => db.kv.put({ key: SOS_ACTIVE_KEY, value: a }).then(() => undefined, () => undefined)
export const clearActive = () => db.kv.delete(SOS_ACTIVE_KEY).then(() => undefined, () => undefined)
/** True while the composer may open by itself. */
export const autoTextAllowed = (at: string, cancelled: boolean, now = Date.now()) => !cancelled && now - Date.parse(at) < AUTO_TEXT_MS
