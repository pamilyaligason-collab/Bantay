import { distanceKm, type Alert } from '../safety/alerts'
import type { LatLon } from '../location/geo'
import { ALERT_RADIUS_KM, zoneAlert } from '../today/heroCards'
import type { WarningIn } from './actionLine'

/** The one warning that can top the action line at a point: an official alert in range, else an air-quality alert. Shared by the Weather screen and Today. */
export function weatherWarning(alerts: Alert[], point: LatLon): WarningIn | null {
  const official = zoneAlert(alerts, point)
  if (official) return { kind: official.kind, title: official.title, doNow: official.doNow }
  const air = alerts.find((a) => a.kind === 'air' && !a.stale && (a.lat == null || a.lon == null || distanceKm(point, { lat: a.lat, lon: a.lon }) <= ALERT_RADIUS_KM))
  return air ? { kind: air.kind, title: air.title, doNow: air.doNow } : null
}
