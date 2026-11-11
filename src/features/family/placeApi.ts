import { useEffect, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'
import { validFix } from '../location/useLocation'
import { batteryNow, type BatteryNow } from './batteryNow'
import { familyPlacesOn } from './flags'

/** Family place data (D-136, D-138, migration 0052). Never throws; never logs a coordinate (B-7). */
export interface PlaceFix { lat: number; lon: number; accuracy?: number | null; at: number }
export interface Place { personId: string; lat: number; lon: number; accuracyM: number | null; fixedAt: number; batteryPct: number | null; charging: boolean | null; batteryAt?: number | null; checkedAt?: number | null }

/** Both kv values are per person, not per phone: a second person on the same phone must see the notice themself (D-138). signOut clears every kv key that starts with 'place.'. */
/** Cached copy of this person's own switch, `place.sharing:<personId>`. Unset means ON (D-138: on by default); only an explicit false stops the write. */
export const PLACE_KEY = 'place.sharing'
/** `place.notice.seen:<personId>` is true once that person answered the D-138 first-open notice. No point is sent before it. */
export const PLACE_NOTICE_KEY = 'place.notice.seen'
export const placeKey = (personId: string): string => `${PLACE_KEY}:${personId}`
export const placeNoticeKey = (personId: string): string => `${PLACE_NOTICE_KEY}:${personId}`
export const placeSharingOn = async (personId: string): Promise<boolean> => (await db.kv.get(placeKey(personId)).catch(() => undefined))?.value !== false
export const placeNoticeSeen = async (personId: string): Promise<boolean> => (await db.kv.get(placeNoticeKey(personId)).catch(() => undefined))?.value === true
export const setPlaceSharing = (personId: string, on: boolean): Promise<unknown> => db.kv.put({ key: placeKey(personId), value: on }).catch(() => undefined)

/** Save the phone's latest point for the family map. Called after a real GPS fix. Skipped (no call at all) while the feature flag is off, the first-open notice is not yet answered, the cached switch is off, or the fix is not a real position.
 *  `battery` undefined reads it now; null means unknown. `personId` defaults to the signed-in person. A server refusal (42501) means the switch is off there: the cache follows, so the next open does not ask again. */
export async function putLivePlace(fix: PlaceFix, battery?: BatteryNow | null, personId?: string | null): Promise<'ok' | 'skipped' | 'off' | 'failed'> {
  if (!supabase || !familyPlacesOn() || !validFix(fix)) return 'skipped'
  // Who is signed in unknown (signed out, or offline with no cached id): never send, never guess (ML-05).
  const me = personId ?? await import('../sync/profile').then((m) => m.selfIdOrCached()).catch(() => null)
  void import('./bgPlace').then((m) => m.bgPlaceSync(me)).catch(() => {}) // D-149, D-150, D-151: arm or disarm the daily background check-in (APK 2.8.0+; battery and a time only, never a place)
  if (!me || !(await placeNoticeSeen(me)) || !(await placeSharingOn(me))) return 'skipped'
  try {
    const bat = battery === undefined ? await batteryNow() : battery
    const acc = typeof fix.accuracy === 'number' && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 ? Math.round(fix.accuracy) : null
    const { error } = await supabase.rpc('live_location_put', { p_lat: fix.lat, p_lon: fix.lon, p_accuracy_m: acc, p_fixed_at: new Date(fix.at).toISOString(), p_battery_pct: bat ? bat.pct : null, p_charging: bat ? bat.charging : null })
    if (!error) return 'ok'
    if (error.code === '42501') { await setPlaceSharing(me, false); return 'off' }
    return 'failed'
  } catch { return 'failed' }
}

type Row = { person_id: string; lat: number; lon: number; accuracy_m: number | null; fixed_at: string; battery_pct: number | null; charging: boolean | null; battery_at?: string | null; checked_at?: string | null }
/** Everyone sharing, latest point each. null when unknown (offline, 0052 not applied, not allowed): unknown is never an empty family (ML-05). */
export async function fetchPlaces(): Promise<Place[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('family_places')
    if (error || !Array.isArray(data)) return null
    return (data as Row[]).flatMap((r) => {
      const t = Date.parse(r.fixed_at)
      return validFix({ lat: r.lat, lon: r.lon }) && Number.isFinite(t)
        ? [{ personId: r.person_id, lat: r.lat, lon: r.lon, accuracyM: r.accuracy_m ?? null, fixedAt: t, batteryPct: r.battery_pct ?? null, charging: r.charging ?? null, batteryAt: r.battery_at ? Date.parse(r.battery_at) || null : null, checkedAt: r.checked_at ? Date.parse(r.checked_at) || null : null }]
        : []
    })
  } catch { return null }
}

/** Read this person's own switch from the server and keep the cached copy in step (no row = on). Returns it, or null when unknown. */
export async function syncPlaceSwitch(personId: string): Promise<boolean | null> {
  if (!supabase || !personId) return null
  try {
    const r = await supabase.from('feed_shares').select('enabled').eq('person_id', personId).eq('category', 'place')
    if (r.error || !Array.isArray(r.data)) return null
    const on = !r.data.some((x: { enabled: boolean }) => x.enabled === false)
    await setPlaceSharing(personId, on)
    return on
  } catch { return null }
}

/** The family's places, read once on mount; null until read or when unknown. Does nothing with the flag off. */
/** undefined while loading, null when the read failed or the map is off. */
export function usePlaces(): Place[] | null | undefined {
  const [places, setPlaces] = useState<Place[] | null | undefined>(undefined)
  useEffect(() => {
    if (!familyPlacesOn()) { setPlaces(null); return }
    let live = true
    void fetchPlaces().then((p) => { if (live) setPlaces(p) })
    return () => { live = false }
  }, [])
  return places
}
