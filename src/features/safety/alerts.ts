import { HOME_ZONES } from '../location/geo'

export interface LatLon { lat: number; lon: number }
export type AlertKind = 'tcws' | 'rainfall' | 'thunderstorm' | 'heat' | 'quake' | 'tsunami' | 'utility' | 'local' | 'gdacs' | 'volcano' | 'air'

export interface Alert {
  id: string
  kind: AlertKind
  level: string | null // e.g. "Signal No. 2", "Orange"
  title: string
  what: string
  where: string
  when: string
  doNow: string
  source: string
  sourceUrl: string | null
  issuedAt: string // ISO
  lat: number | null // null = area-wide, no point
  lon: number | null
  bulletin: string
  previousBulletin?: string | null
  checklist?: string[]
  timeline?: { at: string; text: string }[]
  stale?: boolean // the ingest could not reach this alert's source on its last run; the text is the last known
  checkedAt?: string | null // ISO, when the server last fetched it
}

export const ALERTS_KEY = 'safety.alerts' // Dexie kv key: the sync layer replaces this list, SafetyBrief reads it

// First home zone (Dampas, D-11): the default map centre when there is no phone location. Conel is the second zone (D-27).
export const HOME: LatLon = HOME_ZONES[0]

export const NOT_A_SIREN =
  'Bantay is not an earthquake or tsunami siren. If you feel strong shaking near the coast, move to high ground now. Do not wait for a message.'

// Lower tier shows first: PAGASA warnings, then PHIVOLCS (quake, tsunami, volcano), utilities and air quality, city/province, GDACS context.
// air is tier 2, not 0: it is a model estimate (Open-Meteo), not an official warning, so it must never outrank PAGASA or PHIVOLCS.
const TIER: Record<AlertKind, number> = { tcws: 0, rainfall: 0, thunderstorm: 0, heat: 0, quake: 1, tsunami: 1, volcano: 1, utility: 2, air: 2, local: 3, gdacs: 4 }
export const tierOf = (k: AlertKind) => TIER[k]

export function distanceKm(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Priority tier first, then nearest to `loc` (the nearer of the two home zones when null), then newest. Area-wide alerts (no point) count as distance 0 inside their tier.
 *  Does not mutate the input. */
export function rankAlerts(alerts: Alert[], loc: LatLon | null): Alert[] {
  const refs: LatLon[] = loc ? [loc] : [...HOME_ZONES]
  const d = (a: Alert) => (a.lat == null || a.lon == null ? 0 : Math.min(...refs.map((r) => distanceKm(r, { lat: a.lat!, lon: a.lon! }))))
  return [...alerts].sort((a, b) => TIER[a.kind] - TIER[b.kind] || d(a) - d(b) || b.issuedAt.localeCompare(a.issuedAt))
}

const lines = (s: string) => s.split(/(?<=[.!?])(?<!\b(?:No|Nos|St|Mt)\.)\s+|\n+/).map((x) => x.trim()).filter(Boolean)

/** What changed between two bulletin texts, by sentence. */
export function diffBulletin(prev: string | null | undefined, cur: string): { added: string[]; removed: string[] } | null {
  if (!prev) return null
  const p = lines(prev)
  const c = lines(cur)
  return { added: c.filter((x) => !p.includes(x)), removed: p.filter((x) => !c.includes(x)) }
}

export const hazardOf = (k: AlertKind): string | null =>
  ({ tcws: 'typhoon', rainfall: 'flood', thunderstorm: 'flood', heat: 'heat', quake: 'earthquake', tsunami: 'tsunami' } as Partial<Record<AlertKind, string>>)[k] ?? null
