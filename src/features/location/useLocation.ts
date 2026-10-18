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
const FIRST_ZONE: ZoneId = HOME_ZONES[0].id
const zoneHome = (id: string): Home => HOME_ZONES.find((z) => z.id === id) ?? HOME_ZONES[0]
/** D-33: a saved custom home, else the last chosen zone, else the first zone. */
export const getHome = async (): Promise<Home> => {
  const saved = (await db.kv.get('loc.home').catch(() => undefined))?.value as Home | undefined
  if (saved) return saved
  return zoneHome(((await db.kv.get(ZONE_KEY).catch(() => undefined))?.value as string | undefined) ?? FIRST_ZONE)
}
export const saveHome = (h: Home) => db.kv.put({ key: 'loc.home', value: h })

const gps = () =>
  new Promise<GeolocationPosition>((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }))

/** ask=true shows the browser prompt (once, from onboarding). ask=false only uses GPS if already granted.
 *  Any failure or denial falls back to the saved home barangay (default Dampas). */
export async function resolveLocation(ask: boolean): Promise<Loc> {
  const home = await getHome()
  const fallback: Loc = { lat: home.lat, lon: home.lon, source: 'home' }
  try {
    if (!('geolocation' in navigator)) return fallback
    const st = await navigator.permissions?.query({ name: 'geolocation' }).then((p) => p.state, () => 'prompt')
    if (st === 'denied' || (st !== 'granted' && !ask)) return fallback
    const p = await gps()
    return { lat: p.coords.latitude, lon: p.coords.longitude, source: 'gps' }
  } catch {
    return fallback
  } finally {
    if (ask) await db.kv.put({ key: 'loc.asked', value: true })
  }
}

/** The phone's position when GPS is already granted, else null (callers then use the home zones). Never prompts. */
export function useGpsLoc(): LatLon | null {
  const l = useLocation()
  return l.source === 'gps' ? l : null
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
  const setHome = useCallback(async (h: Home) => {
    await saveHome(h)
    setLoc((l) => (l.source === 'home' ? { lat: h.lat, lon: h.lon, source: 'home' as const } : l))
  }, [])
  return { ...loc, ask, setHome }
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
  const pickZone = useCallback((id: ZoneId) => db.kv.put({ key: ZONE_KEY, value: id }), [])
  if (saved === undefined) return null
  // GPS still pending: show the saved zone now instead of hiding the screen
  return { ...resolvePlace({ gps: l.source === 'gps' ? l : null, lastZone }), lastZone, pickZone, ask: l.ask }
}
