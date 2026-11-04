// Daily safety digest (Phase 2 lane A, D-108): pure logic, no network and no Deno APIs (vitest imports this file).
// Built at 06:45 Asia/Manila from the last 24 h of safety_alerts. Counts and public alert titles only: no person, no health value, no position (B-7).
// body = { day, counts, top, sources } (the contract with the World digest card) plus `summary`, one plain sentence the card can show as is.

export const KINDS = ['tcws', 'rainfall', 'thunderstorm', 'heat', 'quake', 'tsunami', 'utility', 'local', 'gdacs', 'volcano', 'air', 'eonet'] as const
export type Kind = (typeof KINDS)[number]
export interface DigestRow { id: string; kind: string; level: string | null; title: string; source: string; issued_at: string; expires_at?: string | null }
/** The newest alerts-ingest run (job_runs): when it ran and how many of the official feeds (PAGASA, USGS, GDACS) failed; EONET and Open-Meteo do not count. Air rows are rewritten every run, so row times cannot say whether PAGASA, USGS and GDACS were read. */
export interface Run { at: string | null; failed: number; /** From the heartbeat's eonet_ok / air_ok. Unknown (an older heartbeat) is not claimed as checked. */ eonetOk?: boolean; airOk?: boolean }
export interface Digest {
  day: string
  counts: Record<Kind, number>
  top: { id: string; title: string; kind: Kind; level: string | null; source: string }[]
  sources: string
  summary: string
}

const H = 3_600_000
export const WINDOW_H = 24
export const TOP_N = 5
/** The ingest runs every 10 minutes; if nothing was fetched for this long, "no warnings" would be a guess. */
export const FRESH_H = 3
/** The three feeds whose success the heartbeat always records; EONET and Open-Meteo are named only when it says they passed. */
const OFFICIAL_FEEDS = ['PAGASA', 'USGS', 'GDACS']
const checkedLine = (run: Run | null): string => {
  const all = [...OFFICIAL_FEEDS, ...(run?.eonetOk === true ? ['EONET'] : []), ...(run?.airOk === true ? ['Open-Meteo'] : [])]
  return `Checked: ${all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all[0]}.`
}
// Same order as TIER in src/features/safety/alerts.ts (lower first): official weather, then quake/tsunami/volcano, utilities and air, local, GDACS context, EONET last.
const RANK: Record<Kind, number> = { tcws: 0, rainfall: 0, thunderstorm: 0, heat: 0, quake: 1, tsunami: 1, volcano: 1, utility: 2, air: 2, local: 3, gdacs: 4, eonet: 5 }

const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k)

/** The Manila calendar day (YYYY-MM-DD) of an instant. Same rule as manilaDay in dose-watch/logic.ts (a test keeps them equal). */
export const manilaDay = (ms: number): string => new Date(ms + 8 * H).toISOString().slice(0, 10)

/** A row that was a real notice in the window: not an air reading under the threshold, not a "lifted" or "ended" row (the ingest writes those already expired, with no level). */
function counts_(r: DigestRow): boolean {
  if (r.kind === 'air' && /no warning/i.test(r.title)) return false
  if ((r.kind === 'tcws' || r.kind === 'rainfall') && r.level === null) return false
  return true
}

/** `run` is the newest alerts-ingest run: it tells "nothing happened" from "nobody looked". A row counts when it was issued in the last 24 h or is still in force (expires_at in the future), so a live cyclone issued 3 days ago is not lost. */
export function buildDigest(rows: DigestRow[], run: Run | null, now: number): Digest {
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>
  const since = now - WINDOW_H * H
  const mine = rows
    .filter((r) => {
      const t = Date.parse(r.issued_at)
      const inForce = r.expires_at != null && Date.parse(r.expires_at) > now
      return isKind(r.kind) && counts_(r) && t <= now + H && (t >= since || inForce)
    })
    .sort((a, b) => RANK[a.kind as Kind] - RANK[b.kind as Kind] || b.issued_at.localeCompare(a.issued_at) || a.id.localeCompare(b.id))
  for (const r of mine) counts[r.kind as Kind] += 1
  const ran = run?.at ? Date.parse(run.at) : NaN
  const unchecked = !Number.isFinite(ran) || now - ran > FRESH_H * H || run!.failed > 0 // any failed source: a quiet day cannot be claimed
  const names = [...new Set(mine.map((r) => r.source))].sort()
  // GDACS rows are context, never an official warning (the app says so): any GDACS cyclone/flood row, and a GDACS tsunami or volcano row at Green. The ingest keeps only GDACS events naming the Philippines or within 1000 km of a zone. EONET is awareness and not counted here.
  const gdacs = (r: DigestRow) => r.kind === 'gdacs' || (r.source === 'GDACS' && /^green$/i.test(r.level ?? ''))
  const n = mine.filter((r) => r.kind !== 'eonet' && !gdacs(r)).length
  const g = mine.filter(gdacs).length
  const gd = g ? `${g} GDACS ${g === 1 ? 'event' : 'events'} in or near the Philippines in the last 24 h (not an official warning).` : ''
  const stale = 'Some warning feeds were not checked recently, so this may be missing some.'
  const summary = unchecked
    ? [n ? `${n} ${n === 1 ? 'warning' : 'warnings'} in the last 24 h.` : '', gd, stale].filter(Boolean).join(' ')
    : n ? [`${n} ${n === 1 ? 'warning' : 'warnings'} in the last 24 h.`, gd].filter(Boolean).join(' ')
      : g ? `${gd} No other warnings listed.` : 'No warnings in the last 24 h.'
  return {
    day: manilaDay(now),
    counts,
    top: mine.slice(0, TOP_N).map((r) => ({ id: r.id, title: r.title.slice(0, 160), kind: r.kind as Kind, level: r.level, source: r.source })),
    sources: names.length ? `From ${names.join(', ')}.` : unchecked ? 'No feed check could be confirmed.' : checkedLine(run),
    summary
  }
}

export interface Port {
  /** safety_alerts rows issued at or after `sinceIso`, plus any still in force at `nowIso`. */
  rows(sinceIso: string, nowIso: string): Promise<DigestRow[]>
  lastRun(): Promise<Run | null>
  upsert(day: string, body: Digest): Promise<void>
  /** Delete digest rows older than this Manila day (the table's own retention; alert rows are never deleted). */
  prune(beforeDay: string): Promise<void>
}

export const KEEP_DAYS = 30

/** How many of PAGASA, USGS and GDACS failed in a run, from the alerts-ingest heartbeat summary (booleans pagasa_ok, usgs_ok, gdacs_ok). An older run without them falls back to its
 *  failed-source count; a summary with neither is not a clean run. */
export function officialFailed(summary: Record<string, unknown> | null | undefined): number {
  const flags = ['pagasa_ok', 'usgs_ok', 'gdacs_ok'].map((k) => summary?.[k])
  if (flags.every((f) => typeof f === 'boolean')) return flags.filter((f) => f === false).length
  const old = summary?.sources_failed
  return typeof old === 'number' && Number.isFinite(old) ? old : 1
}

/** One digest row per Manila day; running twice the same day rewrites that day's row. Throws on a read or write error so the caller can fail the run. */
export async function runDigest(port: Port, now: number): Promise<Digest> {
  const d = buildDigest(await port.rows(new Date(now - WINDOW_H * H).toISOString(), new Date(now).toISOString()), await port.lastRun(), now)
  await port.upsert(d.day, d)
  await port.prune(manilaDay(now - KEEP_DAYS * 24 * H)).catch(() => undefined) // a failed prune must not fail the digest
  return d
}
