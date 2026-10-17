// alerts-ingest core (D-25): fetch each source, parse, upsert. A failed source keeps its previous rows and marks them stale; nothing is deleted.
import { type AlertRow, parseAir, parseGdacs, parseUsgs, ZONES } from './parse.ts'

// Sources verified WORKS in research (2026-10-17). PHIVOLCS quake and volcano pages, PAGASA bulletins (PDF in an iframe) and BOHECO I are
// HTML or PDF scrape only: skipped on purpose (see docs/ALERTS.md).
// One source can have several urls (air quality: one call per zone, D-27). Payloads reach parse in url order; any failed fetch fails the source. All-or-nothing staleness (one zone failing marks both stale) is conservative by design.
export const SOURCES: { source: string; urls: string[]; json: boolean; parse: (p: unknown[], now: number) => AlertRow[] | null }[] = [
  { source: 'USGS', urls: ['https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'], json: true, parse: ([p], now) => parseUsgs(p, now) },
  { source: 'GDACS', urls: ['https://www.gdacs.org/xml/rss.xml'], json: false, parse: ([p], now) => parseGdacs(p, now) },
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
}
export type Result = Record<string, { ok: boolean; rows: number }>

export async function runIngest(port: Port, fetchText: (url: string) => Promise<string>, now: number): Promise<Result> {
  const result: Result = {}
  for (const s of SOURCES) {
    try {
      const texts = await Promise.all(s.urls.map(fetchText))
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
    } catch {
      // Degraded comms is the design centre (B-4): keep what we had, say it is old. A failing stale-flag write is swallowed: the next run retries.
      await port.setStale(s.source, true).catch(() => undefined)
      result[s.source] = { ok: false, rows: 0 }
    }
  }
  return result
}
