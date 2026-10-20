import { HOME_ZONES, pickLocalSet } from '../location/geo'
import type { usePlace } from '../location/useLocation'

/** Short place name for weather text: the zone's name, or the area the phone is in; else 'where you are'. */
export const placeNameOf = (place: ReturnType<typeof usePlace>): string => {
  if (!place) return 'where you are'
  if (place.source === 'zone') return HOME_ZONES.find((z) => z.id === place.zone)?.name.split(',')[0] ?? 'your area'
  const set = place.source === 'gps' ? pickLocalSet(place.weather) : null
  return set?.where === 'area' ? set.area.name : 'where you are'
}
