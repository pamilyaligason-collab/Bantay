import { Capacitor } from '@capacitor/core'
import { liveQuery } from 'dexie'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../db'
import { HOME_ZONES, type LatLon, type Loc } from './geo'
import { resolvePlace, type ZoneId } from './place'
import { shouldRefresh, weatherFixState } from './freshness'
import { familyPlacesOn } from '../family/flags'
import { useBarangayTick } from './nearestPlace'

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

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
// precise (an ask, or Weather with an old fix) wants a fresh high-accuracy read; the rest may reuse a 10-minute-old one
const gpsOpts = (precise: boolean) => (precise ? { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 } : { enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 })
const web = (precise: boolean) =>
  new Promise<GeolocationPosition>((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, gpsOpts(precise)))
/** N-2: on the APK the WebView's own geolocation often times out even with Android's permission granted (the phone then showed Dampas).
 *  The Geolocation plugin asks Android directly; the WebView call stays as the second try. */
const gps = async (precise: boolean, native: boolean): Promise<{ coords: { latitude: number; longitude: number; accuracy?: number }; timestamp?: number }> => {
  if (native) { try { return await import('@capacitor/geolocation').then((m) => m.Geolocation.getCurrentPosition(gpsOpts(precise))) } catch { /* fall through to the WebView */ } }
  return web(precise)
}

/** ask=true shows the browser prompt (once, from onboarding). ask=false only uses GPS if already granted.
 *  precise (default: same as ask) reads a fresh high-accuracy fix; it never prompts unless ask is true.
 *  Any failure or denial falls back to the saved home barangay (default Dampas). */
export async function resolveLocation(ask: boolean, precise: boolean = ask): Promise<Loc> {
  const home = await getHome()
  const dampas: Loc = { lat: home.lat, lon: home.lon, source: 'home' }
  // D-105: the last real fix beats the saved home zone; the home zone is only the first-run fallback.
  const fallback = async (): Promise<Loc> => {
    // the old stored shape is {lat, lon, at}: accuracy is simply absent there
    const v = (await db.kv.get(LAST_KEY).catch(() => undefined))?.value as { lat: number; lon: number; at: number; accuracy?: number } | undefined
    return v && validFix(v) ? { lat: v.lat, lon: v.lon, at: v.at, ...(isNum(v.accuracy) ? { accuracy: v.accuracy } : {}), source: 'last' } : dampas
  }
  try {
    if (!('geolocation' in navigator)) return await fallback()
    // APK 2.2+: the Geolocation plugin reads Android's own permission (it throws when location is switched off: treat as denied).
    const os = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geolocation')
      ? await import('@capacitor/geolocation').then((m) => m.Geolocation.checkPermissions()).then((p) => (p.location === 'granted' || p.coarseLocation === 'granted' ? 'granted' : p.location.startsWith('prompt') ? 'prompt' : p.location), () => 'denied')
      : null
    const st = os ?? (await navigator.permissions?.query({ name: 'geolocation' }).then((p) => p.state, () => 'prompt'))
    // Older APKs: Android WebView never retains the grant, so permissions.query stays 'prompt' after a yes: trust our own record there.
    const allowed = st === 'granted' || (!os && st === 'prompt' && Capacitor.isNativePlatform() && (await db.kv.get('loc.asked').catch(() => undefined))?.value === true)
    if (st === 'denied' || (!allowed && !ask)) return await fallback()
    // D-138: with the family map on, every open or resume reads a precise fix for the family pin
    const wantPrecise = precise || familyPlacesOn()
    // a precise read that fails (indoors, "Approximate" only) gets one cached/low-accuracy try before the last fix stands in
    const p = await gps(wantPrecise, os !== null).catch((e) => { if (!wantPrecise) throw e; return gps(false, os !== null) })
    const fix = { lat: p.coords.latitude, lon: p.coords.longitude }
    if (!validFix(fix)) return await fallback() // X7: 0,0 (a phone that answers with nothing) or off the globe is no fix
    const at = isNum(p.timestamp) && p.timestamp > 0 ? Math.min(p.timestamp, Date.now()) : Date.now() // when the phone took the fix, not when we asked
    const acc = isNum(p.coords.accuracy) ? { accuracy: p.coords.accuracy } : {}
    void db.kv.put({ key: LAST_KEY, value: { ...fix, at, ...acc } }).catch(() => {})
    // D-138: the family pin; putLivePlace itself checks the flag, the person's notice answer and their switch
    void import('../family/placeApi').then((m) => m.putLivePlace({ ...fix, at, ...acc })).catch(() => {})
    lastLoc = { ...fix, at, ...acc, source: 'gps' } // a direct call (setup wizard, Weather ask) also refreshes what newly mounted screens start from
    return { ...fix, at, ...acc, source: 'gps' }
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

// S22 G: one shared, throttled refresh, so a return to the foreground makes one request however many screens hold a location.
let lastRun = 0
let inflight: Promise<Loc> | null = null
let lastLoc: Loc | null = null // the newest answer, for a screen that mounts inside the throttle window
const subs = new Set<(l: Loc) => void>()
/** force skips the 5-minute throttle (Weather's precise read) but still joins a request already running. */
export function refreshLocation(opts: { precise?: boolean; force?: boolean; now?: number } = {}): Promise<Loc> | null {
  if (inflight) return inflight
  const now = opts.now ?? Date.now()
  if (!opts.force && !shouldRefresh(lastRun, now)) return null
  lastRun = now
  inflight = resolveLocation(false, !!opts.precise)
    .then((l) => { lastLoc = l; subs.forEach((f) => f(l)); return l })
    .finally(() => { inflight = null })
  return inflight
}
export const resetRefresh = () => { lastRun = 0; inflight = null; lastLoc = null } // tests

/** Never prompts by itself. Onboarding calls ask() after the why screen. */
export function useLocation() {
  const [loc, setLoc] = useState<LocState>(PENDING)
  useEffect(() => {
    let live = true
    // every mount shares the one throttled read; inside the window it takes the newest answer
    void (refreshLocation() ?? (lastLoc ? Promise.resolve(lastLoc) : refreshLocation({ force: true })))?.then((l) => live && setLoc(l))
    const sub = (l: Loc) => { if (live) setLoc(l) }
    subs.add(sub)
    const onVis = () => { if (document.visibilityState === 'visible') void refreshLocation() }
    document.addEventListener('visibilitychange', onVis)
    let handle: { remove: () => unknown } | undefined
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/app').then((m) => m.App.addListener('appStateChange', (s) => { if (s.isActive) void refreshLocation() })).then((h) => { if (live) handle = h; else void h.remove() }).catch(() => {})
    }
    return () => {
      live = false
      subs.delete(sub)
      document.removeEventListener('visibilitychange', onVis)
      void handle?.remove()
    }
  }, [])
  /** A fresh high-accuracy read without a prompt (Weather, when the stored fix is old). */
  const refine = useCallback(() => refreshLocation({ precise: true, force: true }), [])
  const ask = useCallback(async () => {
    const l = await resolveLocation(true)
    lastLoc = l
    setLoc(l)
    return l
  }, [])
  const forget = useCallback(async () => {
    await db.kv.delete(LAST_KEY)
    lastLoc = null
    const home = await getHome()
    setLoc((l) => (l.source === 'last' ? { lat: home.lat, lon: home.lon, source: 'home' as const } : l))
  }, [])
  const setHome = useCallback(async (h: Home) => {
    await saveHome(h)
    lastLoc = null
    setLoc((l) => (l.source === 'home' ? { lat: h.lat, lon: h.lon, source: 'home' as const } : l))
  }, [])
  return { ...loc, ask, refine, setHome, forget }
}

/** D-33 place: null until the saved zone is read (the saved zone stands in while GPS is pending). `pickZone` keeps the member's choice for when they are outside the Philippines or have no position. */
export const usePlace = (o?: { weather?: boolean }) => {
  const l = useLocation()
  // weather: true is the Weather screen's rule (S22 G): a stored fix older than 6 h is no fix, so the saved zone answers. Other readers still show it as last known.
  const drop = !!o?.weather && (l.source === 'gps' || l.source === 'last') && weatherFixState(l.at, Date.now()) === 'drop'
  return usePlaceFrom(drop ? { ...l, source: 'home' as const } : l)
}

/** Same, over a useLocation() the caller already holds, so a screen with several readers shares one position. */
export function usePlaceFrom(l: ReturnType<typeof useLocation>) {
  useBarangayTick() // re-render when an offline barangay lookup lands (S28, D-181)
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
  return { ...resolvePlace({ gps: l.source === 'gps' || l.source === 'last' ? { lat: l.lat, lon: l.lon, stale: l.source === 'last' } : null, lastZone }), lastZone, pickZone, ask: l.ask, settled: l.source !== 'pending', fixAt: l.source === 'gps' || l.source === 'last' ? l.at : undefined, accuracy: l.source === 'gps' || l.source === 'last' ? l.accuracy : undefined, picked: saved !== null }
}

/** Where Weather would look right now, without a hook or a GPS read (the rain reminder runs at app open): a stored fix up to 6 h old, else the saved zone. */
export async function weatherPoint(now = Date.now()): Promise<LatLon> {
  const v = (await db.kv.get(LAST_KEY).catch(() => undefined))?.value as { lat: number; lon: number; at: number } | undefined
  const lastZone = ((await db.kv.get(ZONE_KEY).catch(() => undefined))?.value as ZoneId | undefined) ?? FIRST_ZONE
  const gps = v && validFix(v) && weatherFixState(v.at, now) !== 'drop' ? { lat: v.lat, lon: v.lon, stale: true } : null
  return resolvePlace({ gps, lastZone }).weather
}
