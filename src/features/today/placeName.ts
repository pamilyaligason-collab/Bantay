import { HOME_ZONES } from '../location/geo'
import type { usePlace } from '../location/useLocation'

/** Short place name for weather text. */
export const placeNameOf = (place: ReturnType<typeof usePlace>): string =>
  place && place.source === 'zone' ? (HOME_ZONES.find((z) => z.id === place.zone)?.name.split(',')[0] ?? 'your area') : 'where you are'
