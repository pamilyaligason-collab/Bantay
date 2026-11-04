import { Capacitor } from '@capacitor/core'
import { liveQuery } from 'dexie'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../db'
import { HOME_ZONES, type LatLon, type Loc } from './geo'
import { resolvePlace, type ZoneId } from './place'

export interface Home {
  name: string
  lat: number
  lon: number
}
export const ZONE_KEY = 'loc.zone'
const LAST_KEY = 'loc.last'
const FIRST_ZONE: ZoneId = HOME_ZONES[0].id
const zoneHome = (id: string): Home => HOME_ZONES.find((z) => z.id === id) ?? HOME_ZONES[0]
/** D-33: a saved custom home, else the last chosen zone, else the first zone. */
export const getHome = async (): Promise<Home> => {
  const saved = (await db.kv.get('loc.home').catch(() => undefined))?.value as Home | undefined
  if (saved) return saved
  return zoneHome(((await db.kv.get(ZONE_KEY).catch(() => undefined))?.value as string | undefined) ?? FIRST_ZONE)
}
export const saveHome = (h: Home) => db.kv.put({ key: 'loc.home', value: h })

/** X7: a real position. 0,0 is what a broken provider returns; it is never a place we are in (unknown is not a position). */
export const validFix = (p: { lat: number; lon: number }) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0)

const gpsOpts = (ask: boolean) => (ask ? { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 } : { maximumAge: 600_000, timeout: 15_000 })
const web = (ask: boolean) =>
  new Promise<GeolocationPosition>((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, gpsOpts(ask)))
/** N-2: on the APK the WebView's own geolocation often times out even with Android's permission granted (the phone then showed Dampas).
 *  The Geolocation plugin asks Android directly; the WebView call stays as the second try. */
const gps = async (ask: boolean, native: boolean): Promise<{ coords: { latitude: number; longitude: number } }> => {
  if (native) { try { return await import('@capacitor/geolocation').then((m) => m.Geolocation.getCurrentPosition(gpsOpts(ask))) } catch { /* fall through to the WebView */ } }
  return web(ask)
}

/** ask=true shows the browser prompt (once, from onboarding). ask=false only uses GPS if already granted.
 *  Any failure or denial falls back to the saved home barangay (default Dampas). */
export async function resolveLocation(ask: boolean): Promise<Loc> {
  const home = await getHome()
  const dampas: Loc = { lat: home.lat, lon: home.lon, source: 'home' }
  // D-105: the last real fix beats the saved home zone; the home zone is only the first-run fallback.
  const fallback = async (): Promise<Loc> => {
    const v = (await db.kv.get(LAST_KEY).catch(() => undefined))?.value as { lat: number; lon: number; at: number } | undefined
    return v && validFix(v) ? { lat: v.lat, lon: v.lon, at: v.at, source: 'last' } : dampas
  }
  try {
    if (!('geolocation' in navigator)) return await fallback()
    // APK 2.2+: the Geolocation plugin reads Android's own permission (it throws when location is switched off: treat as denied).
    const os = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geolocation')
      ? await import('@capacitor/geolocation').then((m) => m.Geolocation.checkPermissions()).then((p) => (p.location.startsWith('prompt') ? 'prompt' : p.location), () => 'denied')
      : null
    const st = os ?? (await navigator.permissions?.query({ name: 'geolocation' }).then((p) => p.state, () => 'prompt'))
    // Older APKs: Android WebView never retains the grant, so permissions.query stays 'prompt' after a yes: trust our own record there.
    const allowed = st === 'granted' || (!os && st === 'prompt' && Capacitor.isNativePlatform() && (await db.kv.get('loc.asked').catch(() => undefined))?.value === true)
    if (st === 'denied' || (!allowed && !ask)) return await fallback()
    const p = await gps(ask, os !== null)
    const fix = { lat: p.coords.latitude, lon: p.coords.longitude }
    if (!validFix(fix)) return await fallback() // X7: 0,0 (a phone that answers with nothing) or off the globe is no fix
    void db.kv.put({ key: LAST_KEY, value: { ...fix, at: Date.now() } }).catch(() => {})
    return { ...fix, at: Date.now(), source: 'gps' }
  } catch {
    return await fallback()
  } finally {
    if (ask) await db.kv.put({ key: 'loc.asked', value: true })
  }
}

/** The phone's position when GPS is already granted, else null (callers then use the home zones). Never prompts. */
export function useGpsLoc(): LatLon | null {
  const l = useLocation()
  return l.source === 'gps' || l.source === 'last' ? l : null
}

/** Nothing is known until resolveLocation finishes: unknown is null, never a made-up Dampas position. */
export type LocState = Loc | { source: 'pending'; lat: null; lon: null }
const PENDING: LocState = { source: 'pending', lat: null, lon: null }

/** Never prompts by itself. Onboarding calls ask() after the why screen. */
export function useLocation() {
  const [loc, setLoc] = useState<LocState>(PENDING)
  useEffect(() => {
    let live = true
    resolveLocation(false).then((l) => live && setLoc(l))
    return () => {
      live = false
    }
  }, [])
  const ask = useCallback(async () => {
    const l = await resolveLocation(true)
    setLoc(l)
    return l
  }, [])
  const forget = useCallback(async () => {
    await db.kv.delete(LAST_KEY)
    const home = await getHome()
    setLoc((l) => (l.source === 'last' ? { lat: home.lat, lon: home.lon, source: 'home' as const } : l))
  }, [])
  const setHome = useCallback(async (h: Home) => {
    await saveHome(h)
    setLoc((l) => (l.source === 'home' ? { lat: h.lat, lon: h.lon, source: 'home' as const } : l))
  }, [])
  return { ...loc, ask, setHome, forget }
}

/** D-33 place: null until the saved zone is read (the saved zone stands in while GPS is pending). `pickZone` keeps the member's choice for when they are outside the Philippines or have no position. */
export const usePlace = () => usePlaceFrom(useLocation())

/** Same, over a useLocation() the caller already holds, so a screen with several readers shares one position. */
export function usePlaceFrom(l: ReturnType<typeof useLocation>) {
  // undefined until Dexie has answered, so a saved Conel pick never shows Dampas first
  const [saved, setSaved] = useState<ZoneId | null | undefined>(undefined)
  useEffect(() => {
    const sub = liveQuery(() => db.kv.get(ZONE_KEY)).subscribe({ next: (r) => setSaved((r?.value as ZoneId | undefined) ?? null), error: () => setSaved(null) })
    return () => sub.unsubscribe()
  }, [])
  const lastZone = saved ?? FIRST_ZONE
  // a zone pick wins over an old fix: forget the fix so the pick is honoured when location is off
  const pickZone = useCallback(async (id: ZoneId) => { await db.kv.put({ key: ZONE_KEY, value: id }); if (l.source === 'last') await l.forget() }, [l])
  if (saved === undefined) return null
  // GPS still pending: show the saved zone now instead of hiding the screen
  // settled: GPS answered (or fell back), so a 'zone' source is a real fallback and not just "still looking"
  return { ...resolvePlace({ gps: l.source === 'gps' || l.source === 'last' ? { lat: l.lat, lon: l.lon, stale: l.source === 'last' } : null, lastZone }), lastZone, pickZone, ask: l.ask, settled: l.source !== 'pending', fixAt: l.source === 'gps' || l.source === 'last' ? l.at : undefined, picked: saved !== null }
}
