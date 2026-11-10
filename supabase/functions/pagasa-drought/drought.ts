// pagasa-drought core (S29 lane C): PAGASA's drought outlook per province, read from the public Droughtcaster JSON (undocumented, so never called from the phone) into public.pagasa_drought.
// PAGASA stays the authority: the app shows one sentence and month chips and links to PAGASA. Nothing is guessed: a status or month that is not recognised is dropped, and an answer with no usable outlook month stores nothing.
export const DROUGHT_URL = 'https://droughtcaster.pagasa.dost.gov.ph/proxy.php?endpoint=drought&location='
export const REQUEST_GAP_MS = 1000
export const BUDGET_MS = 100_000 // Supabase Free edge functions stop at 150 s: reserve one worst-case province (8 s fetch + write) and the heartbeat (ML-24)
export const FETCH_TIMEOUT_MS = 8000

export type Level = 'not_affected' | 'dry_condition' | 'dry_spell' | 'drought'
export interface Month { month: string; level: Level; kind: 'assessment' | 'outlook' }
export interface DroughtRow { province: string; issued_at: string; months: Month[] }
export interface Port {
  /** province -> fetched_at ISO of the rows already stored (so the oldest are refreshed first, ML-23) */
  stored(): Promise<Record<string, string>>
  upsert(row: DroughtRow & { fetched_at: string }): Promise<void>
}

/** The only province PAGASA files under another name (checked on all 83 on 10 Nov 2026): asking for Metro Manila answers with the region. */
const ANSWERED_AS: Record<string, string> = { 'metro manila': 'national capital region (ncr)' }
const LEVELS: Record<string, Level> = { 'not affected': 'not_affected', 'dry condition': 'dry_condition', 'dry spell': 'dry_spell', drought: 'drought' }
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const ISSUED = /^(\d{4})-(\d{2})-(\d{2})T[\d:.]+\+08:00$/ // PAGASA writes Manila time; the date part is the Manila day

/** One Droughtcaster answer (an array with one province) to a row, or null when it is not the province asked for or holds no usable outlook month. */
export function parseDrought(json: unknown, province: string): DroughtRow | null {
  const want = ANSWERED_AS[province.toLowerCase()] ?? province.toLowerCase()
  const item = Array.isArray(json) ? json.find((x) => x && typeof x === 'object' && String((x as { name?: unknown }).name ?? '').trim().toLowerCase() === want) as { issuedAt?: unknown; data?: unknown } | undefined : undefined
  if (!item || !Array.isArray(item.data)) return null
  const m = ISSUED.exec(String(item.issuedAt ?? ''))
  if (!m) return null
  const issued = `${m[1]}-${m[2]}-${m[3]}`
  if (Number.isNaN(Date.parse(`${issued}T00:00:00Z`)) || new Date(`${issued}T00:00:00Z`).toISOString().slice(0, 10) !== issued) return null
  const byMonth = new Map<string, Month>()
  for (const d of item.data as { date?: unknown; type?: unknown; status?: unknown }[]) {
    const level = LEVELS[String(d?.status ?? '').trim().toLowerCase()]
    const kind = d?.type === 'assessment' || d?.type === 'outlook' ? d.type : null
    if (!level || !kind || typeof d.date !== 'string' || !MONTH.test(d.date)) continue
    byMonth.set(d.date, { month: d.date, level, kind })
  }
  const months = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-12)
  if (!months.some((x) => x.kind === 'outlook')) return null
  return { province, issued_at: issued, months }
}

export interface Result { ok: boolean; rows: number; failed: number; skipped: number }

/** One request per province, a second apart, oldest stored first; stops before the time budget so a slow day never runs past the platform limit. A failed province stores nothing (its old row stays until the app judges it too old). */
export async function runDrought(
  port: Port,
  fetchJson: (url: string) => Promise<unknown>,
  provinces: readonly string[],
  nowMs: number,
  opts: { sleep?: (ms: number) => Promise<void>; clock?: () => number; budgetMs?: number } = {}
): Promise<Result> {
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
  const clock = opts.clock ?? Date.now
  const budget = opts.budgetMs ?? BUDGET_MS
  const start = clock()
  let seen: Record<string, string> = {}
  try { seen = await port.stored() } catch { /* unknown order: alphabetical */ }
  const order = [...provinces].sort((a, b) => (Date.parse(seen[a] ?? '') || 0) - (Date.parse(seen[b] ?? '') || 0))
  let rows = 0, failed = 0, attempted = 0
  for (const p of order) {
    if (clock() - start > budget) break
    if (attempted > 0) await sleep(REQUEST_GAP_MS)
    attempted++
    try {
      const row = parseDrought(await fetchJson(`${DROUGHT_URL}${encodeURIComponent(p)}`), p)
      if (!row) { failed++; continue }
      await port.upsert({ ...row, fetched_at: new Date(nowMs).toISOString() })
      rows++
    } catch { failed++ }
  }
  return { ok: attempted === 0 || rows * 2 >= attempted, rows, failed, skipped: order.length - attempted }
}
