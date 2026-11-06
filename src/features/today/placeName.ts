import { placeLine, placeWords } from '../location/placeWords'
import type { usePlace } from '../location/useLocation'

type Place = ReturnType<typeof usePlace>

/** Short place name for weather text: the one wording from placeWords, the same string as the Safety chip and the alert band. */
export const placeNameOf = (place: Place): string => placeWords(place).title
/** The place LINE (card kicker, hero kicker): adds 'around' for a rough fix. Sentences use placeNameOf. */
export const placeLineOf = (place: Place): string => placeLine(placeWords(place))
