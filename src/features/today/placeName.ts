import { placeWords } from '../location/placeWords'
import type { usePlace } from '../location/useLocation'

type Place = ReturnType<typeof usePlace>

/** Short place name for weather text: the one wording from placeWords, the same string as the Safety chip and the alert band. */
export const placeNameOf = (place: Place): string => placeWords(place).title
