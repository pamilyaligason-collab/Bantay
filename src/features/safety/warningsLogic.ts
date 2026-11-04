import { affectsUs, distanceKm, freshness, freshText, newestChecked, NO_STALE, quakeFeltKm, quakeMag, type Alert, type LatLon, type StaleSources } from './alerts'

import { HOME_ZONES } from '../location/geo'
import { placeWords, type PlaceLike } from '../location/placeWords'

const TSUNAMI_MAG = 6.5 // same cut-off as affectsUs
const TSUNAMI_TAIL = ' If you live near the sea, watch for a tsunami warning.'

/** The calibrated line under the hero. Inside the felt radius: "You may have felt this". Beyond it: affectsUs's own line. It reassures only as quietQuakeWords allows: the radius is a rough strong-shaking figure. */
export function feltLine(a: Alert, here: LatLon | null, placeName: string, now = Date.now(), place?: PlaceLike | null): string {
  const f = affectsUs(a, here, now, place)
  if (a.kind !== 'quake' || f.km === null || a.lat == null || a.lon == null) return f.line
  const mag = quakeMag(a)
  const tail = mag !== null && mag >= TSUNAMI_MAG ? TSUNAMI_TAIL : ''
  const radius = quakeFeltKm(a)
  const away = here ? Math.round(distanceKm(here, { lat: a.lat, lon: a.lon })) : f.km
  if (away <= radius) return `You may have felt this in ${placeName}. If you did, follow the steps below.${tail}`
  return f.line // beyond the radius: affectsUs's wording, including a home zone that is the near one
}

/** "11 h ago" from an ISO time. */
export function agoText(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'time unknown'
  const m = Math.max(0, Math.floor((now - t) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ago`
  const d = Math.floor(m / (24 * 60))
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

/** The place to name in a safety sentence whose distance is measured from `alertRef(place)`: with a GPS fix, the area the phone is in or "your area" (never a home zone it is not in); otherwise the zone, which is what the distance is measured from. */
export function placeName(place: PlaceLike): string {
  if (place.source === 'gps' || place.source === 'last') { const t = placeWords(place).title.split(' · ')[0]!; return t === 'where you are' ? 'your area' : t }
  return (HOME_ZONES.find((z) => z.id === place.zone) ?? HOME_ZONES[0]).name.split(',')[0]!
}

export interface SourceRow { title: string; sub: string; live: boolean; never: boolean } // never: no check was ever recorded (not the same as checks that stopped)
const SOURCES: [string, (a: Alert) => boolean][] = [
  ['PAGASA', (a) => /pagasa/i.test(a.source)],
  ['USGS', (a) => /usgs/i.test(a.source)],
  ['GDACS', (a) => a.kind === 'gdacs' || /gdacs/i.test(a.source)]
]
const PHIVOLCS: [string, (a: Alert) => boolean] = ['PHIVOLCS', (a) => /phivolcs/i.test(a.source)]

/** One freshness row per feed we read. `live` = checked within the hour. `checkedAt` = lastCheck(alerts, saved pull time), the same time the Safety root shows: a pull that found nothing still counts as a check.
 *  A source's own newest row can only make the check later, never earlier. Nothing ever checked says "Never checked". `failed` is the stale list from the pull, whose keys are these titles. */
export function sourceRows(alerts: Alert[], now: number = Date.now(), phivolcs = false, checkedAt: string | null = null, failed: StaleSources = NO_STALE): SourceRow[] {
  return (phivolcs ? [...SOURCES, PHIVOLCS] : SOURCES).map(([title, match]) => {
    const mine = alerts.filter(match)
    const own = [newestChecked(mine), failed[title]].filter((t): t is string => !!t).sort().pop() ?? null
    const down = mine.some((a) => a.stale) || title in failed // the ingest could not reach this source last run: only its own last good time counts, never the shared check
    const at = own && (down || !checkedAt || Date.parse(own) > Date.parse(checkedAt)) ? own : down ? null : checkedAt
    const f = freshness(at, now)
    return { title, sub: freshText(f), live: f.tone === 'ok' && !down, never: f.ageMin === null }
  })
}
