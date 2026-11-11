import { db } from '../../db'
import { supabase } from '../auth/client'
import { familyPlacesOn } from '../family/flags'
import { placeNoticeSeen, placeSharingOn } from '../family/placeApi'
import { phoneZone, setPersonZones } from './zone'

// S30 L8 (A1): the phone tells the server which clock its owner lives on (people.tz, migration 0065), so dose-watch judges a dose "late" on THEIR wall clock and push quiet hours follow it.
// Self only: the server function set_my_tz changes the caller's own row and nobody else's. Unknown (a phone that will not say) sends nothing, so a Philippine member is never moved by a guess.
export const TZ_SENT_KEY = 'tz.sent'
const RESEND_MS = 7 * 86_400_000 // the same zone is re-sent weekly (a new phone, a restored account); a changed zone goes at once
const RETRY_MS = 30 * 60_000 // a refused or failed call waits before it asks again (the server allows 12 changes an hour)

export const PERSON_ZONES_KEY = 'tz.people'
type Cache = { self: string | null; zones: Record<string, string> }
/** Other people's zones, from the cache the last read left (so a screen shows "(their time)" offline and at start). */
export async function loadPersonZones(): Promise<void> {
  try {
    const c = (await db.kv.get(PERSON_ZONES_KEY).catch(() => undefined))?.value as Cache | undefined
    if (c?.zones && typeof c.zones === 'object') setPersonZones(c.zones, typeof c.self === 'string' ? c.self : undefined)
  } catch { /* the default stands: Asia/Manila */ }
}
/** Read people.id, tz of every person this account may see (the same rows the app already reads), keep them for the clock helpers. Before migration 0065 the column is missing: the error is quiet and everyone stays Asia/Manila. */
export async function syncPersonZones(userId: string): Promise<void> {
  try {
    if (!supabase) return
    const { data, error } = await supabase.from('people').select('id,tz,auth_user_id').limit(500)
    if (error || !data) return
    const rows = data as { id: string; tz: string | null; auth_user_id: string | null }[]
    const zones: Record<string, string> = {}
    for (const r of rows) if (r.tz) zones[r.id] = r.tz
    const self = rows.find((r) => r.auth_user_id === userId)?.id ?? null
    setPersonZones(zones, self ?? undefined)
    await db.kv.put({ key: PERSON_ZONES_KEY, value: { self, zones } satisfies Cache })
  } catch { /* offline or not migrated: keep the cache */ }
}

/** The phone's time zone is a coarse place (it names a region), so it follows the same switch as the family place (ML-45/ML-46): sent only while this person has answered the place notice and has sharing on.
 *  Off, or not yet answered, or the person unknown: nothing is sent and nothing already on the server is cleared. */
export async function zoneMaySend(): Promise<boolean> {
  if (!familyPlacesOn()) return false
  const me = await import('../sync/profile').then((m) => m.selfIdOrCached()).catch(() => null)
  return !!me && (await placeNoticeSeen(me)) && (await placeSharingOn(me))
}

export async function reportMyZone(userId: string, now = Date.now()): Promise<boolean> {
  try {
    const tz = phoneZone()
    if (!tz || !supabase || /^(UTC|GMT|Etc\/)/.test(tz)) return false // UTC is what a browser that hides its zone says: never a person's clock
    if (!(await zoneMaySend())) return false
    const last = (await db.kv.get(TZ_SENT_KEY).catch(() => undefined))?.value as { userId?: string; tz?: string; at?: number; ok?: boolean } | undefined
    const at = last?.at
    const same = last?.userId === userId && last.tz === tz && typeof at === 'number' && now >= at
    if (same && last?.ok && now - at! < RESEND_MS) return false
    if (same && !last?.ok && now - at! < RETRY_MS) return false
    const { error } = await supabase.rpc('set_my_tz', { p_tz: tz })
    await db.kv.put({ key: TZ_SENT_KEY, value: { userId, tz, at: now, ok: !error } })
    return !error
  } catch { return false }
}
