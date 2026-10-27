import { pickLocalSet } from '../location/geo'
import { placeLabel } from '../safety/alerts'
import type { usePlace } from '../location/useLocation'

type Place = ReturnType<typeof usePlace>

/** The local rule: the zone's name, or the area the phone is in; else 'where you are'. */
const localName = (place: Place): string => {
  if (!place) return 'where you are'
  const set = place.source === 'gps' ? pickLocalSet(place.weather) : null
  return set?.where === 'area' ? set.area.name : 'where you are'
}

/** Short place name for weather text. A chosen zone gives the same string as the Safety header and AlertBand; a phone with GPS gives the local area it is in. */
export const placeNameOf = (place: Place): string => (place?.source === 'zone' ? placeLabel(place) : localName(place))
