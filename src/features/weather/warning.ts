import { distanceKm, LOCAL_KM, type Alert } from '../safety/alerts'
import type { LatLon } from '../location/geo'
import { zoneAlert } from '../today/heroCards'
import type { WarningIn } from './actionLine'

/** The one warning that can top the action line at a point: an official alert in range, else an air-quality alert. Shared by the Weather screen and Today. `hold` is the Today-only D-114 quake hold: Simple Today keeps it, the Weather row passes false and follows plain ranking. */
export function weatherWarning(alerts: Alert[], point: LatLon, hold = true): WarningIn | null {
  const official = zoneAlert(alerts, point, hold)
  if (official) return { kind: official.kind, title: official.title, doNow: official.doNow }
  const air = alerts.find((a) => a.kind === 'air' && !a.stale && (a.lat == null || a.lon == null || distanceKm(point, { lat: a.lat, lon: a.lon }) <= LOCAL_KM))
  return air ? { kind: air.kind, title: air.title, doNow: air.doNow } : null
}
