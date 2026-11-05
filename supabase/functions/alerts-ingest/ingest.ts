// alerts-ingest core (D-25): fetch each source, parse, upsert. A failed source keeps its previous rows and marks them stale; nothing is deleted.
// S5 (D-78): PAGASA public alert feed (wind signals = tier 1, flood advisories = tier 2) and an in-app hazard row per member for each live tier-1 row.
import { type AlertRow, gdacsCurrentIds, parseAir, parseGdacs, parseUsgs, ZONES } from './parse.ts'
import { capUrls, FEED_URL, parseFeed, parsePagasa, signalOf } from './pagasa.ts'
import { EONET_URL, parseEonet } from './eonet.ts'

// Sources verified WORKS in research (2026-10-17, PAGASA feed 2026-10-26, EONET 2026-11-04). PHIVOLCS quake and volcano pages and PAGASA bulletin PDFs are
// HTML or PDF scrape only: skipped on purpose (see docs/ALERTS.md). phivolcs.ts has parsers for them that are NOT listed here; wiring them is a change to this list, made only when the owner says so. GDACS and Open-Meteo keep running when the PAGASA feed fails.
// One source can have several urls (air quality: one call per zone, D-27). Payloads reach parse in url order; any failed fetch fails the source. All-or-nothing staleness (one zone failing marks both stale) is conservative by design.
// `endsDropped` (D-121): returns the ids the RAW feed still lists (before any zone or age filter, so a filtered row keeps its TTL); a row it does not list is ended once the read worked. Only for a feed that lists every live row; never a rolling time window (USGS all_day: a quake leaves it by getting older), never PAGASA (it writes its own lifted/ended rows), never Open-Meteo (always lists both zones) or EONET (awareness only, already limited by its own TTL).
// `more` names a second round of urls from the first payloads (PAGASA: the index lists the CAP files); their texts are appended to the payloads.
export const SOURCES: { source: string; urls: string[]; json: boolean; more?: (texts: string[], now: number) => string[]; parse: (p: unknown[], now: number) => AlertRow[] | null; endsDropped?: (payloads: unknown[]) => Set<string> }[] = [
  { source: 'USGS', urls: ['https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'], json: true, parse: ([p], now) => parseUsgs(p, now) },
  { source: 'GDACS', urls: ['https://www.gdacs.org/xml/rss.xml'], json: false, endsDropped: ([p]) => gdacsCurrentIds(p), parse: ([p], now) => parseGdacs(p, now) },
  { source: 'PAGASA', urls: [FEED_URL], json: false, more: ([index], now) => capUrls(parseFeed(index) ?? [], now), parse: parsePagasa },
  { source: 'Open-Meteo', urls: ZONES.map((z) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${z.lat}&longitude=${z.lon}&current=pm2_5,us_aqi`),
    json: true,
    parse: (ps, now) => {
      const per = ps.map((p, i) => parseAir(p, now, ZONES[i]))
      return per.some((r) => r === null) ? null : per.flatMap((r) => r!)
    }
  },
  { source: 'EONET', urls: [EONET_URL], json: true, parse: ([p], now) => parseEonet(p, now) } // last on purpose: awareness only (tier 2, never notifies), so a slow EONET cannot eat the official feeds' run time
]
/** D-121: a dropped row is ended only when its own fetched_at is older than this, so one or two missed reads (runs are minutes apart) do not end a real warning. */
export const DROP_GRACE_MS = 2 * 3_600_000
/** A new-tier notice (tsunami, quake, flood, volcano) is pushed only while its row is this young: a first run or an outage must not announce yesterday's quake. Wind signals keep their old rule (no age limit). */
export const NEW_TIER_MAX_AGE_MS = 2 * 3_600_000
/** After this much run time no flush is started (it can wait 15 s and the platform stops the run at 150 s, ML-24); the rows are already written and the 15-minute dose-watch run offers them. Wind and other urgent pushes flush at any earlier time. */
export const FLUSH_BUDGET_MS = 130_000
/** Past this much run time Open-Meteo air and EONET (awareness only) are not fetched, so the official rows and the heartbeat always land inside the 150 s limit. */
/** First-round fetches retry only while the run is younger than this: a retry on every slow source could push the run past 130 s (flush budget) and the 150 s platform limit. CAP files always retry. */
export const RETRY_FIRST_ROUND_MS = 30_000
export const SKIP_AFTER_MS = 100_000
const SKIPPABLE = ['Open-Meteo', 'EONET']

/** Order of the levels that can be raised: a tsunami colour or a PHIVOLCS alert level. -1 = unknown or not ranked (other kinds have no "rise" rule). */
const levelRank = (kind: string, level: string | null | undefined): number => {
  if (kind === 'tsunami') return ['green', 'orange', 'red'].indexOf((level ?? '').toLowerCase())
  if (kind === 'volcano') { const n = Number(/Alert Level (\d)\b/.exec(level ?? '')?.[1]); return Number.isFinite(n) ? n : -1 }
  return -1
}

export type Existing = Map<string, { bulletin: string; previous_bulletin: string | null; level?: string | null; fetched_at?: string | null; expires_at?: string | null; stale?: boolean }>
export type UpsertRow = AlertRow & { previous_bulletin: string | null; fetched_at: string; stale: false }
export interface Port {
  existing(source: string): Promise<Existing>
  upsert(rows: UpsertRow[]): Promise<void>
  setStale(source: string, stale: boolean): Promise<void>
  /** D-121: set expires_at = endedAt on these ids (never a delete, no push). Optional so older fakes still type. */
  end?(ids: string[], endedAt: string): Promise<void>
  /** Person ids of members with a login (the family watches both home zones, D-27). */
  members(): Promise<string[]>
  /** notify_family(person, 'hazard', template, ref, 'self') with the service role: rows inserted (0 for a repeated ref). */
  notify(personId: string, template: string, ref: string): Promise<number>
  /** dose-watch {mode:'flush'}: Web Push for the new rows (browser users only). */
  flush(): Promise<void>
}
export type Result = Record<string, { ok: boolean; rows: number }>

/** Where a quake counts for tier 1: the Philippines and its seas (a box, not a border). */
const PH_BOX = { minLat: 4, maxLat: 21.5, minLon: 116, maxLon: 127 }

/** Live tier-1 rows, the five cases of URGENT_TEXT (src/features/world/prefs.ts): a wind signal (every signal, as before), a tsunami warning, a quake of M6 or more
 *  inside the Philippine box, a red rainfall level, a volcano at alert level 3 or higher. A new level is a new ref, so a change of level notifies once more and a rerun does not.
 *  A row without a readable level for its rule never notifies (unknown is not urgent). Air, GDACS storm and EONET rows are tier 2. A GDACS tsunami at Green stays in the app (Orange, Red or no level push).
 *  The four new cases also need a row issued within NEW_TIER_MAX_AGE_MS, except a tsunami or volcano row whose level ROSE since the stored row (`prior`, the level kept in safety_alerts):
 *  issued_at is the event start, so an old event re-rated upward is still new news. A drop writes nothing; an unchanged level or a first sighting keeps the age limit. */
export function tier1(rows: AlertRow[], now: number, prior: Map<string, { level?: string | null }> = new Map()): { ref: string; template: string }[] {
  return rows.flatMap((r) => {
    if (r.expires_at === null || !(Date.parse(r.expires_at) > now)) return [] // an unreadable time is not live
    if (r.kind === 'tcws') {
      const n = signalOf(r.level)
      return n !== null ? [{ ref: `${r.id}:s${n}`, template: 'storm_warning' }] : []
    }
    const before = prior.get(r.id)
    const was = before ? levelRank(r.kind, before.level) : -1
    const is = levelRank(r.kind, r.level)
    if (before && was > is) return [] // a downgrade (Red to Orange, level 4 to 3): the higher ref was written earlier, nothing new to say
    const rose = !!before && is > was // an unreadable old level counts as lower: a row now rated is news
    if (!rose && !(now - Date.parse(r.issued_at) <= NEW_TIER_MAX_AGE_MS)) return [] // too old, or an unreadable time: never announce it as new
    if (r.kind === 'tsunami') return /^green$/i.test(r.level ?? '') ? [] : [{ ref: `${r.id}:${(r.level ?? 'any').toLowerCase()}`, template: 'tsunami_warning' }]
    if (r.kind === 'quake') {
      const mag = Number(/Magnitude (\d+(?:\.\d+)?)/.exec(r.level ?? '')?.[1])
      const inBox = r.lat !== null && r.lon !== null && r.lat >= PH_BOX.minLat && r.lat <= PH_BOX.maxLat && r.lon >= PH_BOX.minLon && r.lon <= PH_BOX.maxLon
      return Number.isFinite(mag) && mag >= 6 && inBox ? [{ ref: `${r.id}:m${Math.floor(mag)}`, template: 'quake_strong' }] : []
    }
    if (r.kind === 'rainfall') {
      // PAGASA's feed words its flood level as the CAP severity; Red, Severe and Extreme are the top of it (Minor and Moderate stay tier 2)
      const lv = /^(red|severe|extreme)$/i.exec(r.level ?? '')?.[1]
      return lv ? [{ ref: `${r.id}:${lv.toLowerCase()}:${new Date(Date.parse(r.issued_at) + 8 * 3_600_000).toISOString().slice(0, 10)}`, template: 'flood_red' }] : [] // the row id is fixed per zone, so the advisory day keeps a later advisory from being dropped as a repeat
    }
    if (r.kind === 'volcano') {
      const n = Number(/Alert Level (\d)\b/.exec(r.level ?? '')?.[1]) // GDACS colours (Green, Orange, Red) are not PHIVOLCS levels: no level, no notice
      return Number.isFinite(n) && n >= 3 ? [{ ref: `${r.id}:l${n}`, template: 'volcano_raised' }] : []
    }
    return []
  })
}

/** One hazard row per member per live tier-1 notice (the database drops a repeated ref), then one flush when anything new was written. Never throws. */
export async function notifyTier1(port: Port, rows: AlertRow[], now: number, mayFlush: () => boolean = () => true, prior?: Existing): Promise<number> {
  const notices = tier1(rows, now, prior)
  return (await sendNotices(port, notices, mayFlush)).written
}

/** failed = any member lookup or notify threw (a flush failure does not count: the rows are written and dose-watch offers them within 15 min). */
async function sendNotices(port: Port, notices: { ref: string; template: string }[], mayFlush: () => boolean): Promise<{ written: number; failed: boolean }> {
  if (!notices.length) return { written: 0, failed: false }
  let written = 0
  let failed = false
  try {
    for (const person of await port.members()) {
      for (const n of notices) {
        try { written += await port.notify(person, n.template, n.ref) } catch { failed = true /* one member failing must not stop the others */ }
      }
    }
  } catch { return { written, failed: true } }
  try { if (written > 0 && mayFlush()) await port.flush() } catch { /* the rows are already in safety_alerts */ }
  return { written, failed }
}

export async function runIngest(port: Port, fetchText: (url: string) => Promise<string>, now: number, clock: () => number = Date.now): Promise<Result> {
  const result: Result = {}
  const started = clock()
  const mayFlush = () => clock() - started <= FLUSH_BUDGET_MS
  const retry = async (u: string) => fetchText(u).catch(() => fetchText(u)) // a missed CAP file could read as "signal lifted": one retry, then fail the source. The first-round urls retry too while the run is young (GDACS failed ~13 of 30 live runs)
  for (const s of SOURCES) {
    // Fetches have no deadline of their own, so a slow run could be killed at 150 s before the heartbeat is written. The two awareness-only sources are skipped (recorded as not ok, marked stale) past this point.
    if (SKIPPABLE.includes(s.source) && clock() - started > SKIP_AFTER_MS) {
      await port.setStale(s.source, true).catch(() => undefined)
      result[s.source] = { ok: false, rows: 0 }
      continue
    }
    try {
      let texts = await Promise.all(s.urls.map((u) => (clock() - started < RETRY_FIRST_ROUND_MS ? retry(u) : fetchText(u))))
      if (s.more) texts = [...texts, ...(await Promise.all(s.more(texts, now).map(retry)))]
      const payloads = texts.map((t) => (s.json ? JSON.parse(t) : t))
      const parsed = s.parse(payloads, now)
      if (parsed === null) throw new Error('unexpected payload')
      const rows = [...new Map(parsed.map((r) => [r.id, r])).values()] // one row per id (last wins): a duplicate id would make Postgres reject the whole batch
      const old = await port.existing(s.source)
      // A raised level on an event past the age limit is only news because the stored level is still the old one. Send it BEFORE the upsert stores the new level: if it fails
      // the source fails (marked stale, nothing stored), the next run sees the rise again and retries; a repeated ref is dropped by the database, so there is no double push.
      // Every row whose level rose goes this way, young or old: a raise on a row 1 h 55 min old would otherwise be sent after the upsert, fail quietly, and be over the limit next run.
      const rose = rows.filter((r) => { const b = old.get(r.id); return !!b && levelRank(r.kind, r.level) > levelRank(r.kind, b.level) })
      if ((await sendNotices(port, tier1(rose, now, old), mayFlush)).failed) throw new Error('notify')
      const stamp = new Date(now).toISOString()
      await port.upsert(rows.map((r) => {
        const o = old.get(r.id)
        const previous_bulletin = o && o.bulletin !== r.bulletin ? o.bulletin : o?.previous_bulletin ?? null
        return { ...r, previous_bulletin, fetched_at: stamp, stale: false as const }
      }))
      const listed = s.endsDropped?.(payloads)
      // Ends nothing when the raw feed is empty (a hiccup), or when an old row of this source is still marked stale (the previous read failed: after an outage every row is past the grace, and one partial response must not end them all). `old` is read before setStale below.
      if (listed && listed.size > 0 && ![...old.values()].some((o) => o.stale)) {
        const gone = [...old].filter(([id, o]) => !listed.has(id) && Date.parse(o.expires_at ?? '') > now && now - Date.parse(o.fetched_at ?? '') > DROP_GRACE_MS).map(([id]) => id) // unreadable time: left alone
        await port.end?.(gone, stamp).catch(() => undefined) // a failed end is retried next run; it must not fail the read
      }
      await port.setStale(s.source, false)
      result[s.source] = { ok: true, rows: rows.length }
      await notifyTier1(port, rows, now, mayFlush, old) // every source: tier1() picks only the five urgent cases
    } catch {
      // Degraded comms is the design centre (B-4): keep what we had, say it is old. A failing stale-flag write is swallowed: the next run retries.
      await port.setStale(s.source, true).catch(() => undefined)
      result[s.source] = { ok: false, rows: 0 }
    }
  }
  return result
}
