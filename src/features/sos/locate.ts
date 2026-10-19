import { getHome } from '../location/useLocation'

export interface SosFix { lat: number; lon: number; gps: boolean; at: number }

/** D-34: a fresh high-accuracy fix, 10 s at most. Any failure (denied, timeout, no GPS) gives the saved home zone with gps=false. */
export async function sosPosition(timeoutMs = 10_000): Promise<SosFix> {
  try {
    if ('geolocation' in navigator) {
      const p = await new Promise<GeolocationPosition>((ok, no) =>
        navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }))
      return { lat: p.coords.latitude, lon: p.coords.longitude, gps: true, at: Date.now() }
    }
  } catch { /* fall through to home */ }
  const h = await getHome()
  return { lat: h.lat, lon: h.lon, gps: false, at: Date.now() }
}
