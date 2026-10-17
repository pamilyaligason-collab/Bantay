import { useCallback, useEffect, useState } from 'react'
import { db } from '../../db'
import { DAMPAS, type LatLon, type Loc } from './geo'

export interface Home {
  name: string
  lat: number
  lon: number
}
export const getHome = async (): Promise<Home> => ((await db.kv.get('loc.home').catch(() => undefined))?.value as Home | undefined) ?? DAMPAS
export const saveHome = (h: Home) => db.kv.put({ key: 'loc.home', value: h })

const gps = () =>
  new Promise<GeolocationPosition>((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { maximumAge: 600_000, timeout: 10_000 }))

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

/** Never prompts by itself. Onboarding calls ask() after the why screen. */
export function useLocation() {
  const [loc, setLoc] = useState<Loc>({ lat: DAMPAS.lat, lon: DAMPAS.lon, source: 'home' })
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
    setLoc((l) => (l.source === 'home' ? { lat: h.lat, lon: h.lon, source: 'home' } : l))
  }, [])
  return { ...loc, ask, setHome }
}
