import { HOME_ZONES, pickLocalSet, type LatLon } from './geo'

export interface PlaceWords { title: string; sub?: string; stale: boolean } // stale -> callers add data-testid="place-last"
/** What usePlace() returns, as far as the words need it. `settled: false` = the first position is still being found (unknown is not the home zone). `picked: false` = no zone was chosen by hand, so the zone is only the home fallback. */
export interface PlaceLike { source: string; zone: string; weather?: LatLon; fixAt?: number; picked?: boolean; settled?: boolean }

const short = (zone: string) => (HOME_ZONES.find((z) => z.id === zone) ?? HOME_ZONES[0]).name.split(',')[0]!
const ago = (at: number | undefined, now: number) => {
  if (at == null) return ''
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
/** The area the phone is in. Outside every named area it is 'where you are': a home zone 500 km away is not the phone's place. */
const areaOf = (p: PlaceLike) => { const s = p.weather ? pickLocalSet(p.weather) : null; return s?.where === 'area' ? s.area.name : 'where you are' }

/** The one wording of "where" for Today, Safety, Weather and the zone chip (contract 3.1). */
export function placeWords(place: PlaceLike | null, now: number = Date.now()): PlaceWords {
  if (!place || place.settled === false) return { title: 'where you are', stale: false }
  switch (place.source) {
    case 'gps': return { title: areaOf(place), stale: false }
    case 'last': { const a = ago(place.fixAt, now); return { title: `${areaOf(place)} · last known${a ? `, ${a}` : ''}`, stale: true } }
    case 'gps-abroad': return { title: `Away · ${short(place.zone)}`, stale: false }
    default: return { title: place.picked === false ? `${short(place.zone)} · your home area` : short(place.zone), stale: false }
  }
}
