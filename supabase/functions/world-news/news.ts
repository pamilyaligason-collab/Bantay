// world-news core: GDELT DOC 2.0 article lists -> world_news rows. Headlines are third-party text: stored as plain strings, never interpreted.
// A failed query keeps the rows already stored; nothing is deleted except rows older than 7 days (purge).
export const KEEP_DAYS = 7
export const GAP_MS = 5_500 // GDELT asks for one request per 5 seconds
export const QUERIES: { theme: string; q: string }[] = [
  { theme: 'prices', q: '(inflation OR "fuel price" OR "rice price" OR "power rate") sourcecountry:RP' },
  { theme: 'economy', q: '(economy OR "interest rate" OR "central bank" OR peso) sourcecountry:RP' },
  { theme: 'world', q: '("oil price" OR tariffs OR "global economy") sourcelang:english' }
]
export const gdeltUrl = (q: string) => `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=15&timespan=1d&sort=datedesc`

export interface NewsRow { id: string; title: string; url: string; source_domain: string; seen_at: string; lang: string; theme: string }

/** Plain text, one line, at most 200 characters; control characters are dropped. */
export const cleanTitle = (s: string) => Array.from(s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 200).join('')

/** GDELT seendate "20261104T013000Z" -> ISO, or null. */
export function seenIso(s: unknown): string | null {
  const m = typeof s === 'string' ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s) : null
  if (!m) return null
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

async function idOf(url: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)))
  return `gdelt-${Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Null when the payload is not a GDELT article list at all (the source failed); an empty list is a valid quiet answer. */
export async function parseGdelt(payload: unknown, theme: string, now: number): Promise<NewsRow[] | null> {
  const list = (payload as { articles?: unknown } | null)?.articles
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || (list !== undefined && !Array.isArray(list))) return null
  const out = new Map<string, NewsRow>()
  for (const a of (list ?? []) as Record<string, unknown>[]) {
    const url = typeof a?.url === 'string' ? a.url : ''
    const title = typeof a?.title === 'string' ? cleanTitle(a.title) : ''
    const seen = seenIso(a?.seendate)
    if (!title || !seen || url.length > 2000 || !/^https?:\/\/[^\s]+$/i.test(url)) continue
    if (Date.parse(seen) > now + 3_600_000) continue // a date in the future is a bad row
    const id = await idOf(url)
    if (out.has(id)) continue
    out.set(id, { id, title, url, source_domain: typeof a.domain === 'string' ? a.domain.slice(0, 100) : '', seen_at: seen, lang: typeof a.language === 'string' ? a.language.toLowerCase().slice(0, 30) : '', theme })
  }
  return [...out.values()]
}

export interface Port {
  upsert(rows: NewsRow[]): Promise<void>
  /** Deletes world_news rows seen before this ISO time. */
  purge(beforeIso: string): Promise<void>
}
export type Result = { ok: boolean; rows: number; queries_ok: number; queries_failed: number }

export async function runNews(port: Port, fetchJson: (url: string) => Promise<unknown>, now: number, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<Result> {
  const seen = new Set<string>()
  const rows: NewsRow[] = []
  let ok = 0, failed = 0
  for (const [i, { theme, q }] of QUERIES.entries()) {
    if (i > 0) await sleep(GAP_MS)
    try {
      const got = await parseGdelt(await fetchJson(gdeltUrl(q)), theme, now)
      if (got === null) { failed++; continue }
      ok++
      for (const r of got) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r) }
    } catch { failed++ }
  }
  if (rows.length) await port.upsert(rows)
  if (ok > 0) await port.purge(new Date(now - KEEP_DAYS * 86_400_000).toISOString()) // only after a good read, so a dead feed does not empty the table early
  return { ok: ok > 0, rows: rows.length, queries_ok: ok, queries_failed: failed }
}
