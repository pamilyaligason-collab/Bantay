import { isRough } from './freshness'
import { pickLocalSet, type LatLon } from './geo'
import { nearestPlace, placeLabel, zoneLabel } from './nearestPlace'
import { agoWords } from '../today/timeWords'

export interface PlaceWords { title: string; approx?: boolean; sub?: string; stale: boolean } // approx: the fix is rough, so only the place LINE reads 'around <title>' (placeLine); sentences use the plain title // stale -> callers add data-testid="place-last"
/** What usePlace() returns, as far as the words need it. `settled: false` = the first position is still being found (unknown is not the home zone). `picked: false` = no zone was chosen by hand, so the zone is only the home fallback. */
export interface PlaceLike { source: string; zone: string; weather?: LatLon; fixAt?: number; accuracy?: number; picked?: boolean; settled?: boolean }

const short = (zone: string) => zoneLabel(zone) // S28: '<barangay>, <town>' for a home zone
/** The area the phone is in. Outside every named area it is 'where you are': a home zone 500 km away is not the phone's place. */
const areaOf = (p: PlaceLike) => { const s = p.weather ? pickLocalSet(p.weather) : null; return s?.where === 'area' ? s.area.name : 'where you are' }
/** S28: the exact place when the fix is good enough to name a barangay (not rough), else the area. */
const exactOf = (p: PlaceLike) => { const n = p.weather && !isRough(p.accuracy) ? nearestPlace(p.weather) : null; return n ? placeLabel(n) : areaOf(p) }
const roughOf = (p: PlaceLike) => areaOf(p) !== 'where you are' && isRough(p.accuracy)
/** The place LINE (chip, card kicker, hero kicker): 'around <place>' for a rough fix. Never put this inside a sentence. */
export const placeLine = (w: PlaceWords): string => (w.approx ? `around ${w.title}` : w.title)

/** The one wording of "where" for Today, Safety, Weather and the zone chip (contract 3.1). */
export function placeWords(place: PlaceLike | null, now: number = Date.now()): PlaceWords {
  if (!place || place.settled === false) return { title: 'where you are', stale: false }
  switch (place.source) {
    case 'gps': return { title: exactOf(place), approx: roughOf(place) || undefined, stale: false }
    case 'last': { const a = place.fixAt == null ? '' : agoWords((now - place.fixAt) / 60_000); return { title: `${exactOf(place)} · last known${a ? `, ${a}` : ''}`, approx: roughOf(place) || undefined, stale: true } }
    case 'gps-abroad': return { title: `Away · ${short(place.zone)}`, stale: false }
    default: return { title: place.picked === false ? `${short(place.zone)} · your home area` : short(place.zone), stale: false }
  }
}
