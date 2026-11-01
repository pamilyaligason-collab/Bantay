import { affectsUs, distanceKm, freshness, freshText, newestChecked, quakeFeltKm, quakeMag, type Alert, type LatLon } from './alerts'

const TSUNAMI_MAG = 6.5 // same cut-off as affectsUs
const TSUNAMI_TAIL = ' If you live near the sea, watch for a tsunami warning.'

/** The calibrated line under the hero. Inside the felt radius: "You may have felt this". Beyond it: affectsUs's own line, as on Today. Never reassures: the radius is a rough strong-shaking figure. */
export function feltLine(a: Alert, here: LatLon | null, placeName: string): string {
  const f = affectsUs(a, here)
  if (a.kind !== 'quake' || f.km === null || a.lat == null || a.lon == null) return f.line
  const mag = quakeMag(a)
  const tail = mag !== null && mag >= TSUNAMI_MAG ? TSUNAMI_TAIL : ''
  const radius = quakeFeltKm(a)
  const away = here ? Math.round(distanceKm(here, { lat: a.lat, lon: a.lon })) : f.km
  if (away <= radius) return `You may have felt this in ${placeName}. If you did, follow the steps below.${tail}`
  return f.line // beyond the radius: the same D-88 wording Today uses (affectsUs), including a home zone that is the near one
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

export interface SourceRow { title: string; sub: string; live: boolean }
const SOURCES: [string, (a: Alert) => boolean][] = [
  ['PAGASA', (a) => /pagasa/i.test(a.source)],
  ['USGS', (a) => /usgs/i.test(a.source)],
  ['GDACS', (a) => a.kind === 'gdacs' || /gdacs/i.test(a.source)]
]
const PHIVOLCS: [string, (a: Alert) => boolean] = ['PHIVOLCS', (a) => /phivolcs/i.test(a.source)]

/** One freshness row per feed we read. `live` = checked within the hour. */
export function sourceRows(alerts: Alert[], now: number = Date.now(), phivolcs = false): SourceRow[] {
  return (phivolcs ? [...SOURCES, PHIVOLCS] : SOURCES).map(([title, match]) => {
    const mine = alerts.filter(match)
    if (!mine.length) return { title, sub: 'No rows yet', live: false }
    const f = freshness(newestChecked(mine), now)
    return { title, sub: freshText(f), live: f.tone === 'ok' }
  })
}
