import { affectsUs, freshness, freshText, newestChecked, quakeFeltKm, quakeMag, type Alert, type LatLon } from './alerts'

const TSUNAMI_MAG = 6.5 // same cut-off as affectsUs
const TSUNAMI_TAIL = ' If you live near the sea, watch for a tsunami warning.'

/** The calibrated line under the hero: how far, and whether anyone could have felt it. */
export function feltLine(a: Alert, here: LatLon | null, placeName: string): string {
  const f = affectsUs(a, here)
  if (a.kind !== 'quake' || f.km === null) return f.line
  if (f.km > quakeFeltKm(a)) return `Too far to feel in ${placeName}. Nothing to do now.`
  const mag = quakeMag(a)
  return `You may have felt this in ${placeName}. If you did, follow the steps below.${mag !== null && mag >= TSUNAMI_MAG ? TSUNAMI_TAIL : ''}`
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
