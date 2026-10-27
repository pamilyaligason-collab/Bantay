import { HOME_ZONES, pickLocalSet } from '../location/geo'
import type { usePlace } from '../location/useLocation'

type Place = ReturnType<typeof usePlace>

// SHIM (lane J): lane D's `placeLabel(place)` (S10: one place name on Today, the Safety header and AlertBand) is not in this base. The glob finds it in safety/alerts.ts once D merges
// and uses it; until then, and whenever it gives nothing, the local rule below answers. The orchestrator can replace this with a static import of D's placeLabel at merge.
const dMods = import.meta.glob('../safety/alerts.ts', { eager: true }) as Record<string, { placeLabel?: (p: Place) => string | null | undefined }>
const placeLabelD = Object.values(dMods)[0]?.placeLabel

/** The local rule: the zone's name, or the area the phone is in; else 'where you are'. */
const localName = (place: Place): string => {
  if (!place) return 'where you are'
  if (place.source === 'zone') return HOME_ZONES.find((z) => z.id === place.zone)?.name.split(',')[0] ?? 'your area'
  const set = place.source === 'gps' ? pickLocalSet(place.weather) : null
  return set?.where === 'area' ? set.area.name : 'where you are'
}

/** Short place name for weather text. Same string as the Safety header and AlertBand once D's placeLabel exists. */
export const placeNameOf = (place: Place): string => {
  const d = placeLabelD?.(place)
  return typeof d === 'string' && d.trim() ? d : localName(place)
}
