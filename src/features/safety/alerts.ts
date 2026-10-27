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

/** Only a rounded location (about 1 km) goes to map hosts. */
export const r2 = (n: number) => n.toFixed(2)

export const ALERTS_KEY = 'safety.alerts' // Dexie kv key: the sync layer replaces this list, SafetyBrief reads it

// First home zone (Dampas, D-11): the map centre when there is no position and no zone chosen yet (D-33). Conel is the second zone (D-27).
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

// ---- D (session 12): honest freshness, honest sources, "does it affect us?" ----

/** One sentence for every place that says where alerts come from (ML-12): never claim more than the ingest reads. */
export const SOURCES_LINE = 'Quakes: USGS. Storms, floods, volcanoes and tsunamis: GDACS and the PAGASA public alert feed. Air quality: Open-Meteo. Checked every 10 minutes. PAGASA bulletins are links you can open.'

export const FRESH_AMBER_MIN = 60 // the ingest runs every 10 minutes; over an hour means something is wrong
export const FRESH_RED_MIN = 24 * 60 // shortcut: a one-day cut-off for red, no per-source rule; the cron gap of 2026-10-17..27 would have shown red here
export interface Fresh { ageMin: number | null; tone: 'ok' | 'amber' | 'red' }

/** Age of the last check. Over 60 min is amber (60 exactly is ok), over a day red. Unknown or unreadable is null and red: never "fresh" by default (ML-05). */
export function freshness(checkedAt: string | null | undefined, now: Date | number = Date.now()): Fresh {
  const t = checkedAt ? Date.parse(checkedAt) : NaN
  if (Number.isNaN(t)) return { ageMin: null, tone: 'red' }
  const ms = Math.max(0, (typeof now === 'number' ? now : now.getTime()) - t)
  return { ageMin: Math.floor(ms / 60_000), tone: ms > FRESH_RED_MIN * 60_000 ? 'red' : ms > FRESH_AMBER_MIN * 60_000 ? 'amber' : 'ok' }
}

/** The newest `checkedAt` in the list (ISO), or null when no row has one. */
export function newestChecked(alerts: Alert[]): string | null {
  let best: string | null = null
  for (const a of alerts) if (a.checkedAt && !Number.isNaN(Date.parse(a.checkedAt)) && (best === null || Date.parse(a.checkedAt) > Date.parse(best))) best = a.checkedAt
  return best
}

export function freshText(f: Fresh): string {
  const m = f.ageMin
  if (m === null) return 'Never checked'
  if (m < 1) return 'Checked just now'
  if (m < 60) return `Checked ${m} min ago`
  if (m < 24 * 60) return `Checked ${Math.floor(m / 60)} h ago`
  const d = Math.floor(m / (24 * 60))
  return `Checked ${d} ${d === 1 ? 'day' : 'days'} ago`
}

/** The amber line (canvas board 4b). Shown when the last check is over an hour old, even if no row is marked stale. */
export function outdatedLine(checkedAt: string | null | undefined): string {
  const t = checkedAt ? new Date(checkedAt) : null
  const tail = 'They may be out of date. Check PAGASA or listen to the radio.'
  if (!t || Number.isNaN(t.getTime())) return `Alerts have not been checked on this phone yet. ${tail}`
  return `Alerts last checked ${t.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}. ${tail}`
}

/** Same string on Today, the Safety header and the alert band (S10). Twin of the chip text in ZonePicker. */
export function placeLabel(place: { source: string; zone: string }): string {
  const zone = HOME_ZONES.find((z) => z.id === place.zone) ?? HOME_ZONES[0]
  const name = zone.name.split(',')[0]!
  return place.source === 'gps' ? `Near you · ${name}` : place.source === 'gps-abroad' ? `Away · ${name}` : name
}

// shortcut: flat radii for everything but quakes, and a rough felt-radius by magnitude for quakes; upgrade when the ingest sends a shake model.
const LOCAL_KM = 50 // an air reading or utility notice only matters close by
const WIDE_KM = 150 // storms, floods, heat, tsunami and volcano ash reach further (same as ALERT_RADIUS_KM on Today)
const LOCAL_KINDS = new Set<AlertKind>(['air', 'utility', 'local'])
/** How far a quake of this size is often felt. Unknown size counts as 100 km. Errs wide: a quake row only exists because the ingest found it near enough to matter. */
export function quakeFeltKm(a: Pick<Alert, 'level' | 'what' | 'title'>): number {
  const m = /(?:magnitude|M)\s*([0-9]+(?:\.[0-9]+)?)/i.exec(`${a.level ?? ''} ${a.title ?? ''} ${a.what ?? ''}`)
  const mag = m ? Number(m[1]) : NaN
  if (!Number.isFinite(mag)) return 100
  return mag >= 7 ? 800 : mag >= 6 ? 400 : mag >= 5 ? 200 : mag >= 4 ? 100 : 50
}
/** steps: show the do-now steps. A quake always shows them: people may have felt it even when it is "far". Bantay never says "no action needed". */
export interface Affects { affects: boolean; km: number | null; line: string; steps: boolean }

/** Does this alert touch the family? `here` is where warnings are ranked from (the phone in the Philippines, else the zone); the two home zones always count too.
 *  An alert with no point covers the whole area. */
export function affectsUs(a: Alert, here: LatLon | null): Affects {
  if (a.lat == null || a.lon == null) return { affects: true, km: null, line: 'Covers your area. Follow the steps below.', steps: true }
  const p = { lat: a.lat, lon: a.lon }
  const quake = a.kind === 'quake'
  const limit = quake ? quakeFeltKm(a) : LOCAL_KINDS.has(a.kind) ? LOCAL_KM : WIDE_KM
  const dHere = here ? distanceKm(here, p) : Infinity
  const zone = HOME_ZONES.map((z) => ({ z, d: distanceKm(z, p) })).sort((x, y) => x.d - y.d)[0]!
  if (dHere <= limit) return { affects: true, km: Math.round(dHere), line: 'Near you. Follow the steps below.', steps: true }
  if (zone.d <= limit) return { affects: true, km: Math.round(zone.d), line: `Near home (${zone.z.name.split(',')[0]}). Follow the steps below.`, steps: true }
  const km = Math.round(Math.min(dHere, zone.d))
  return quake
    ? { affects: false, km, line: 'Probably too far to feel strongly. If you felt shaking, follow the steps below.', steps: true }
    : { affects: false, km, line: 'Far from you. Watch for updates.', steps: false }
}

/** GDACS writes statistics in a machine voice ("Population affected by Category 1 (120 km/h) wind speeds or higher is 0.291 million."). Say it in plain words,
 *  and drop any such sentence we cannot read rather than show the raw string. */
export function plainWhat(a: Pick<Alert, 'kind' | 'what'>): string {
  if (a.kind !== 'gdacs' && !/population affected/i.test(a.what)) return a.what
  const out = a.what.split(/(?<=\.)\s+/).flatMap((s) => {
    const m = /^population affected by .+? is ([\d.]+)\s*(million|thousand)?\.?$/i.exec(s.trim())
    if (!m) return /population affected/i.test(s) ? [] : [s]
    const n = Math.round(Number(m[1]) * (m[2]?.toLowerCase() === 'million' ? 1e6 : m[2]?.toLowerCase() === 'thousand' ? 1e3 : 1))
    return Number.isFinite(n) && n > 0 ? [`About ${n.toLocaleString('en-US')} people live where the strongest winds or water are expected.`] : []
  })
  return out.join(' ')
}
