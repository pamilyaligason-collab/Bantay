import { HOME_ZONES } from '../location/geo'
import { placeLine, placeWords, type PlaceLike } from '../location/placeWords'

export interface LatLon { lat: number; lon: number }
export type AlertKind = 'tcws' | 'rainfall' | 'thunderstorm' | 'heat' | 'quake' | 'tsunami' | 'utility' | 'local' | 'gdacs' | 'volcano' | 'air' | 'eonet'

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
const TIER: Record<AlertKind, number> = { tcws: 0, rainfall: 0, thunderstorm: 0, heat: 0, quake: 1, tsunami: 1, volcano: 1, utility: 2, air: 2, local: 3, gdacs: 4, eonet: 5 }
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
export const SOURCES_LINE = 'From PAGASA, USGS, GDACS. Checked every 10 min.'
/** The full list, for a "Sources" disclosure (ML-12). */
export const SOURCES_FULL = 'Quakes: USGS. Storms, floods, volcanoes and tsunamis: GDACS and the PAGASA public alert feed. Air quality: Open-Meteo. Checked every 10 minutes. PAGASA bulletins are links you can open.'

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

/** Dexie kv key: when the last successful pull finished. A pull that returns zero rows has no row to carry a time, so this keeps a quiet day from reading "never checked". */
export const CHECKED_KEY = 'alerts:checkedAt'
/** The later of the saved pull time and the newest row time (ISO), or null when neither is readable. */
export function lastCheck(alerts: Alert[], saved: unknown): string | null {
  const s = typeof saved === 'string' && !Number.isNaN(Date.parse(saved)) ? saved : null
  const n = newestChecked(alerts)
  return s && (!n || Date.parse(s) > Date.parse(n)) ? s : n
}

/** Dexie kv key: the newest quake row and newest cyclone row the pull ever saw, kept after they expire (Last event, Last storm). */
export const LAST_SEEN_KEY = 'alerts:lastSeen'
/** Dexie kv key: every source with a stale row, expired rows too, and its newest fetched_at (the ingest's source names: USGS, GDACS, PAGASA, Open-Meteo). Empty when all are healthy. */
export const STALE_KEY = 'alerts:staleSources'
export type StaleSources = Record<string, string | null>
export const NO_STALE: StaleSources = {}
/** One test for every all-clear: true when there is no fresh check of the official feeds (over an hour old, never, or a source the ingest marked stale). Say "not checked", never "none". */
export const feedStale = (alerts: Alert[], saved: unknown, down: StaleSources, now: Date | number = Date.now()): boolean =>
  freshness(lastCheck(alerts, saved), now).tone !== 'ok' || alerts.some((a) => a.stale) || Object.keys(down).length > 0
/** The check time to print: while a source is down, the oldest last good run among the down sources (another feed's fresh row must not read as a check of it), else lastCheck. */
export const shownCheck = (alerts: Alert[], saved: unknown, down: StaleSources): string | null =>
  Object.values(down).filter((t): t is string => !!t).sort()[0] ?? lastCheck(alerts, saved)

/** The newest `checkedAt` in the list (ISO), or null when no row has one. */
export function newestChecked(alerts: Alert[]): string | null {
  let best: string | null = null
  for (const a of alerts) if (a.checkedAt && !Number.isNaN(Date.parse(a.checkedAt)) && (best === null || Date.parse(a.checkedAt) > Date.parse(best))) best = a.checkedAt
  return best
}

/** The check time to print for one warning: its own, else the newest in the list. A row the feed stopped refreshing must read old on every screen. */
export const checkedOf = (a: Pick<Alert, 'checkedAt'>, alerts: Alert[]): string | null => a.checkedAt || newestChecked(alerts)

/** The place of a USGS-style "where" without its epicentre distance: "207 km ESE of Sarangani, Philippines" reads "Sarangani, Philippines". The distance from home is the one that matters and is shown beside it. Other wording is returned as it came. */
export const placeOnly = (where: string): string => where.replace(/^\s*\d+(?:\.\d+)?\s*km\s+(?:[NSEW]{1,3}|[NS]\s*\d+°\s*[EW])\s+of\s+/i, '')

/** " (N km away)" for a line that does not already say the distance, else "". */
export const kmTail = (who: Pick<Affects, 'km' | 'line'>, suffix = ' km away'): string => who.km == null || who.line.includes(`${who.km} km`) ? '' : ` (${who.km}${suffix})`

export function freshText(f: Fresh): string {
  const m = f.ageMin
  if (m === null) return 'Never checked'
  if (m < 1) return 'Checked just now'
  if (m < 60) return `Checked ${m} min ago`
  if (m < 24 * 60) return `Checked ${Math.floor(m / 60)} h ago`
  const d = Math.floor(m / (24 * 60))
  return `Checked ${d} ${d === 1 ? 'day' : 'days'} ago`
}

/** Dexie kv key: NASA EONET awareness rows. Written by the pull only while FLAGS.eonet is on, and never mixed into ALERTS_KEY, so the warning counts, Today and the Safety hub stay official-only. */
export const EONET_KEY = 'safety.eonet'
/** The pulled list split in two: official rows, and EONET rows (awareness only, tier 2 in the server's words: never a notification). */
export const splitEonet = (list: Alert[]): { official: Alert[]; eonet: Alert[] } => ({ official: list.filter((a) => a.kind !== 'eonet'), eonet: list.filter((a) => a.kind === 'eonet') })

/** The amber line (canvas board 4b). Shown when the last check is over an hour old, even if no row is marked stale. */
export function outdatedLine(checkedAt: string | null | undefined): string {
  const t = checkedAt ? new Date(checkedAt) : null
  const tail = 'They may be out of date. Check PAGASA or listen to the radio.'
  if (!t || Number.isNaN(t.getTime())) return `Alerts have not been checked on this phone yet. ${tail}`
  return `Alerts last checked ${t.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}. ${tail}`
}

/** Same string on Today, the Safety header and the alert band (S4): the one wording lives in location/placeWords. */
export const placeLabel = (place: PlaceLike): string => placeLine(placeWords(place))

// shortcut: flat radii for everything but quakes, and a rough strong-shaking radius by magnitude for quakes; upgrade when the ingest sends a shake model.
export const LOCAL_KM = 50 // an air reading or utility notice only matters close by
export const NEAR_KM = 150 // a storm, flood, tsunami or volcano this close is "near you"; further out it is "about N km away"
/** D-88: storm, flood, tsunami, volcano and GDACS rows count as affecting the family out to the ingest's own limit (GDACS_MAX_KM in alerts-ingest). */
export const WIDE_KM = 1000
const LOCAL_KINDS = new Set<AlertKind>(['air', 'utility', 'local'])
export const TSUNAMI_MAG = 6.5
const TSUNAMI_LINE = ' If you live near the sea, watch for a tsunami warning.'
/** The magnitude written in a quake row, or null when none is readable (never guessed). */
export function quakeMag(a: Pick<Alert, 'level' | 'what' | 'title'>): number | null {
  const m = /(?:magnitude|M)\s*([0-9]+(?:\.[0-9]+)?)/i.exec(`${a.level ?? ''} ${a.title ?? ''} ${a.what ?? ''}`)
  return m && Number.isFinite(Number(m[1])) ? Number(m[1]) : null
}
const DAY_MS = 86_400_000
/** A tsunami, or a quake of M6 or more, under 24 h old: it outranks every other warning on every list that shows a "top" alert.
 *  A quake must also be inside its felt radius of `here` or the nearest home zone (the ingest keeps M6+ out to 1,500 km, which is not "urgent" for a local flood). */
export function urgent(a: Alert, here: LatLon | null, now = Date.now()): boolean {
  const age = now - Date.parse(a.issuedAt)
  if (Number.isFinite(age) && age > DAY_MS) return false
  if (a.kind === 'tsunami') return true
  if (a.kind !== 'quake' || (quakeMag(a) ?? 0) < 6) return false
  if (a.lat == null || a.lon == null) return true // no point: it covers the whole area, as affectsUs counts it
  const p = { lat: a.lat, lon: a.lon }
  const d = Math.min(here ? distanceKm(here, p) : Infinity, ...HOME_ZONES.map((z) => distanceKm(z, p)))
  return d <= quakeFeltKm(a)
}
/** The urgent alerts first, the rest in their ranked order. */
export const urgentFirst = (list: Alert[], here: LatLon | null, now = Date.now()): Alert[] => [...list.filter((a) => urgent(a, here, now)), ...list.filter((a) => !urgent(a, here, now))]
/** How far strong shaking from a quake of this size is often felt (D-87 table). Unknown size counts as 100 km. */
export function quakeFeltKm(a: Pick<Alert, 'level' | 'what' | 'title'>): number {
  const mag = quakeMag(a)
  if (mag === null) return 100
  return mag >= 7 ? 800 : mag >= 6 ? 400 : mag >= 5 ? 200 : mag >= 4 ? 100 : 50
}
/** steps: show the do-now steps. A quake shows them unless quietQuakeWords says otherwise, and so does any hazard row inside the wide radius. */
export interface Affects { affects: boolean; km: number | null; line: string; steps: boolean }

/** A quake beyond its felt radius whose size is known and under M6. Unknown size or distance is never "far". */
function quakeTooFar(a: Alert, km: number | null): boolean {
  const mag = quakeMag(a)
  return a.kind === 'quake' && km !== null && km > quakeFeltKm(a) && mag !== null && mag < 6
}
export const RECENT_MS = 3_600_000
const LIVE_FIX_MS = 30 * 60_000 // the browser may hand back a fix up to 10 min older than this stamp (gpsOpts)
/** Far, small and over an hour old (an unreadable time counts as recent). A quiet row may lead a list only when nothing else is on it. */
export const quakeQuiet = (a: Alert, km: number | null, now = Date.now()): boolean => quakeTooFar(a, km) && Date.parse(a.issuedAt) < now - RECENT_MS
/** Every listed row is a quiet quake: nothing worse is listed. Only then may a surface pass `place` to affectsUs, so "No action needed" never sits beside a worse row. */
export const allQuiet = (list: Alert[], here: LatLon | null, now = Date.now()): boolean => list.every((a) => quakeQuiet(a, affectsUs(a, here, now).km, now))
/** The one rule for a quiet quake's words. "No action needed" is said only from a live phone position (not a home zone, not an old last fix) in an area we can name: the radius is a strong-shaking figure measured from there.
 *  Everywhere else the soft line, true in every location state, with the steps. Null: not a quiet quake. */
export function quietQuakeWords(a: Alert, km: number | null, place: PlaceLike | null | undefined, now = Date.now()): { line: string; steps: boolean } | null {
  if (!quakeQuiet(a, km, now)) return null
  const live = place?.source === 'gps' && place.fixAt != null && Math.abs(now - place.fixAt) <= LIVE_FIX_MS
  const name = live ? placeWords(place).title : 'where you are'
  return name === 'where you are'
    ? { line: 'Probably too far to feel strongly. If you felt shaking, follow the steps below.', steps: true }
    : { line: `Too far to feel in ${name}. No action needed.`, steps: false }
}
/** Does this alert touch the family? `here` is where warnings are ranked from (the phone in the Philippines, else the zone); the two home zones always count too.
 *  An alert with no point covers the whole area. Every quake the ingest kept counts (D-88): it is only on the list because it was big enough for its distance.
 *  `place`: pass it only on a surface that prints the line beside no "Warning" label, and only when allQuiet holds for its list; left out, a quiet quake gets the soft line. */
export function affectsUs(a: Alert, here: LatLon | null, now = Date.now(), place?: PlaceLike | null): Affects {
  if (a.lat == null || a.lon == null) return { affects: true, km: null, line: 'Covers your area. Follow the steps below.', steps: true }
  const p = { lat: a.lat, lon: a.lon }
  const quake = a.kind === 'quake'
  const local = LOCAL_KINDS.has(a.kind)
  const dHere = here ? distanceKm(here, p) : Infinity
  const zone = HOME_ZONES.map((z) => ({ z, d: distanceKm(z, p) })).sort((x, y) => x.d - y.d)[0]!
  const km = Math.round(Math.min(dHere, zone.d))
  const mag = quake ? quakeMag(a) : null
  const tail = mag !== null && mag >= TSUNAMI_MAG ? TSUNAMI_LINE : '' // unknown size: no tsunami line, never a guessed 0 (ML-05)
  const near = quake ? quakeFeltKm(a) : local ? LOCAL_KM : NEAR_KM
  if (dHere <= near) return { affects: true, km: Math.round(dHere), line: 'Near you. Follow the steps below.' + tail, steps: true }
  if (zone.d <= near) return { affects: true, km: Math.round(zone.d), line: `Near home (${zone.z.name.split(',')[0]}). Follow the steps below.` + tail, steps: true }
  const quiet = quietQuakeWords(a, km, place, now)
  if (quiet) return { affects: true, km, ...quiet }
  if (quake) return { affects: true, km, line: `About ${km} km away. You may feel it. If you feel shaking, follow the steps below.` + tail, steps: true }
  // heat is a city reading: it counts near you (NEAR_KM), never 1,000 km away
  if (!local && a.kind !== 'heat' && km <= WIDE_KM) return { affects: true, km, line: `About ${km} km away. Follow the steps below.`, steps: true }
  return { affects: false, km, line: 'Far from you. Watch for updates.', steps: false }
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
