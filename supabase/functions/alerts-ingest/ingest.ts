// alerts-ingest core (D-25): fetch each source, parse, upsert. A failed source keeps its previous rows and marks them stale; nothing is deleted.
// S5 (D-78): PAGASA public alert feed (wind signals = tier 1, flood advisories = tier 2) and an in-app hazard row per member for each live tier-1 row.
import { type AlertRow, parseAir, parseGdacs, parseUsgs, ZONES } from './parse.ts'
import { capUrls, FEED_URL, parseFeed, parsePagasa, signalOf } from './pagasa.ts'

// Sources verified WORKS in research (2026-10-17, PAGASA feed 2026-10-26). PHIVOLCS quake and volcano pages and PAGASA bulletin PDFs are
// HTML or PDF scrape only: skipped on purpose (see docs/ALERTS.md). GDACS and Open-Meteo keep running when the PAGASA feed fails.
// One source can have several urls (air quality: one call per zone, D-27). Payloads reach parse in url order; any failed fetch fails the source. All-or-nothing staleness (one zone failing marks both stale) is conservative by design.
// `more` names a second round of urls from the first payloads (PAGASA: the index lists the CAP files); their texts are appended to the payloads.
export const SOURCES: { source: string; urls: string[]; json: boolean; more?: (texts: string[], now: number) => string[]; parse: (p: unknown[], now: number) => AlertRow[] | null }[] = [
  { source: 'USGS', urls: ['https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'], json: true, parse: ([p], now) => parseUsgs(p, now) },
  { source: 'GDACS', urls: ['https://www.gdacs.org/xml/rss.xml'], json: false, parse: ([p], now) => parseGdacs(p, now) },
  { source: 'PAGASA', urls: [FEED_URL], json: false, more: ([index], now) => capUrls(parseFeed(index) ?? [], now), parse: parsePagasa },
  { source: 'Open-Meteo', urls: ZONES.map((z) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${z.lat}&longitude=${z.lon}&current=pm2_5,us_aqi`),
    json: true,
    parse: (ps, now) => {
      const per = ps.map((p, i) => parseAir(p, now, ZONES[i]))
      return per.some((r) => r === null) ? null : per.flatMap((r) => r!)
    }
  }
]

export type Existing = Map<string, { bulletin: string; previous_bulletin: string | null }>
export type UpsertRow = AlertRow & { previous_bulletin: string | null; fetched_at: string; stale: false }
export interface Port {
  existing(source: string): Promise<Existing>
  upsert(rows: UpsertRow[]): Promise<void>
  setStale(source: string, stale: boolean): Promise<void>
  /** Person ids of members with a login (the family watches both home zones, D-27). */
  members(): Promise<string[]>
  /** notify_family(person, 'hazard', template, ref, 'self') with the service role: rows inserted (0 for a repeated ref). */
  notify(personId: string, template: string, ref: string): Promise<number>
  /** dose-watch {mode:'flush'}: Web Push for the new rows (browser users only). */
  flush(): Promise<void>
}
export type Result = Record<string, { ok: boolean; rows: number }>

/** Live tier-1 rows: a wind signal in force for a home zone. The ref carries the signal, so a raised signal notifies again and a rerun does not. */
export function tier1(rows: AlertRow[], now: number): { ref: string; template: string }[] {
  return rows.flatMap((r) => {
    const n = signalOf(r.level)
    return r.kind === 'tcws' && n !== null && r.expires_at !== null && Date.parse(r.expires_at) > now ? [{ ref: `${r.id}:s${n}`, template: 'storm_warning' }] : []
  })
}

/** One hazard row per member per live tier-1 notice (the database drops a repeated ref), then one flush when anything new was written. Never throws. */
export async function notifyTier1(port: Port, rows: AlertRow[], now: number): Promise<number> {
  const notices = tier1(rows, now)
  if (!notices.length) return 0
  let written = 0
  try {
    for (const person of await port.members()) {
      for (const n of notices) {
        try { written += await port.notify(person, n.template, n.ref) } catch { /* one member failing must not stop the others; the next run retries */ }
      }
    }
    if (written > 0) await port.flush()
  } catch { /* the rows are already in safety_alerts; the next run retries */ }
  return written
}

export async function runIngest(port: Port, fetchText: (url: string) => Promise<string>, now: number): Promise<Result> {
  const result: Result = {}
  const retry = async (u: string) => fetchText(u).catch(() => fetchText(u)) // a missed CAP file could read as "signal lifted": one retry, then fail the source
  for (const s of SOURCES) {
    try {
      let texts = await Promise.all(s.urls.map(fetchText))
      if (s.more) texts = [...texts, ...(await Promise.all(s.more(texts, now).map(retry)))]
      const parsed = s.parse(texts.map((t) => (s.json ? JSON.parse(t) : t)), now)
      if (parsed === null) throw new Error('unexpected payload')
      const rows = [...new Map(parsed.map((r) => [r.id, r])).values()] // one row per id (last wins): a duplicate id would make Postgres reject the whole batch
      const old = await port.existing(s.source)
      const stamp = new Date(now).toISOString()
      await port.upsert(rows.map((r) => {
        const o = old.get(r.id)
        const previous_bulletin = o && o.bulletin !== r.bulletin ? o.bulletin : o?.previous_bulletin ?? null
        return { ...r, previous_bulletin, fetched_at: stamp, stale: false as const }
      }))
      await port.setStale(s.source, false)
      result[s.source] = { ok: true, rows: rows.length }
      if (s.source === 'PAGASA') await notifyTier1(port, rows, now)
    } catch {
      // Degraded comms is the design centre (B-4): keep what we had, say it is old. A failing stale-flag write is swallowed: the next run retries.
      await port.setStale(s.source, true).catch(() => undefined)
      result[s.source] = { ok: false, rows: 0 }
    }
  }
  return result
}
