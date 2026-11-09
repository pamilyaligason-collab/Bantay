// pagasa-warnings core (S26, D-163): PAGASA stays the authority; this only reads its public HTML pages and keeps the latest warnings so the app can show a card
// that links to the original. No API or feed exists (source check 9 Nov 2026), so the pages are read by markup. Nothing is guessed: a page whose markup is not recognised
// stores nothing and counts as a failed source; a bulletin whose wind signal cannot be read is dropped (never shown as "no signal").
// Sources: the tropical cyclone bulletin page (one tab per active cyclone), the weather advisory page, and the "Active Warnings" block of the home page (rainfall / thunderstorm / flood labels).
export const BULLETIN_URL = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'
export const ADVISORY_URL = 'https://www.pagasa.dost.gov.ph/weather/weather-advisory'
export const HOME_URL = 'https://www.pagasa.dost.gov.ph/'
export const KEEP_DAYS = 14
export type Kind = 'tropical_cyclone' | 'rainfall' | 'advisory'
export interface Signal { level: number; areas: string }
export interface WarningRow { kind: Kind; title: string; issued_at: string | null; areas: string; signals: Signal[]; source_url: string }
export interface DbRow extends WarningRow { dedupe_key: string; fetched_at: string }
/** `rows` read from the page; `errors` counts parts of a recognised page that could not be read (those parts store nothing). */
export interface Parsed { rows: WarningRow[]; errors: number }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const ENTITY: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' }

/** Visible text of an HTML fragment: comments, scripts and styles dropped (the pages keep old markup in comments), entities decoded, spaces collapsed. */
export function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&(quot|amp|lt|gt|apos|nbsp);/g, (_, n: string) => ENTITY[n]!)
    .replace(/\s+/g, ' ')
    .trim()
}

/** "11:00 am, 09 November 2026" parts (Philippine time, UTC+8) to an ISO instant; null when it is not a real clock time and calendar day. */
export function manilaIso(hour: string, minute: string, ampm: string, day: string, month: string, year: string): string | null {
  const mo = MONTHS.indexOf(month.toLowerCase()) + 1
  const h = Number(hour), mi = Number(minute), d = Number(day), y = Number(year)
  if (!mo || !y || !d || h < 1 || h > 12 || mi > 59) return null
  const h24 = (h % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0)
  const t = new Date(Date.UTC(y, mo - 1, d, h24 - 8, mi))
  const local = new Date(t.getTime() + 8 * 3_600_000) // the day must exist in Manila, not roll over
  return local.getUTCFullYear() === y && local.getUTCMonth() === mo - 1 && local.getUTCDate() === d ? t.toISOString() : null
}

const ISSUED = /(?:issued(?: at)?|as of)\s+(\d{1,2}):(\d{2})\s*(am|pm),?\s+(?:on\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i
const issuedAt = (t: string) => {
  const m = ISSUED.exec(t)
  return m ? manilaIso(m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!) : null
}

/** Signal levels with their area text from the Wind Signal block, e.g. "Tropical Cyclone Wind Signal No. 2 Luzon: Batanes ...". Null when no level can be read. */
export function parseSignals(block: string): Signal[] | null {
  const marks = [...block.matchAll(/(?:TCWS|Tropical Cyclone Wind Signals?|Wind Signals?)\s*(?:No\.?|Number|#)?\s*([1-5])\b/gi)]
  const out: Signal[] = []
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1]!.index! : block.length
    const areas = block.slice(m.index! + m[0].length, end).replace(/^[\s:.\-–]+/, '').trim().slice(0, 1500)
    if (areas) out.push({ level: Number(m[1]), areas })
  })
  return out.length && out.length === marks.length ? out.sort((a, b) => b.level - a.level) : null
}

/** The bulletin page: one row per active cyclone tab. Null = the page is not the bulletin page. A page with the shell but no tabs and no signal block is "no active cyclone" (zero rows, zero errors). */
export function parseBulletins(html: unknown): Parsed | null {
  if (typeof html !== 'string' || !html.includes('tropical-cyclone-weather-bulletin-page') || !html.includes('article-header')) return null
  const heads = [...html.matchAll(/<div role="tabpanel" class="tab-pane[^"]*" id="tcwb-(\d+)">/g)]
  const rows: WarningRow[] = []
  let errors = 0
  if (!heads.length) {
    // no tabs: only "no cyclone" when no tab control or signal block is left over either (a layout change must not read as all clear)
    return /data-toggle="tab"|panel-heading">\s*Wind Signal/i.test(html) ? { rows, errors: 1 } : { rows, errors }
  }
  heads.forEach((h, i) => {
    const panel = html.slice(h.index!, i + 1 < heads.length ? heads[i + 1]!.index! : html.length)
    const name = text((/<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(panel.replace(/<!--[\s\S]*?-->/g, ''))?.[1]) ?? '')
    const header = new RegExp(`href="#tcwb-${h[1]}"[^>]*data-header="([^"]*)"`).exec(html)?.[1]
    const t = text(panel)
    const issued = issuedAt(t)
    const at = panel.search(/panel-heading">\s*Wind Signals?\s*<\/div>/i)
    let signals: Signal[] | null = null
    if (at >= 0) {
      const block = text(panel.slice(panel.indexOf('>', at) + 1)).replace(/^Wind Signals?\s*/i, '').split(/Considering these developments/i)[0]!.trim()
      signals = /^No Tropical Cyclone Wind Signals?\.?$/i.test(block) ? [] : parseSignals(block)
    }
    if (!name || !issued || !signals) { errors++; return }
    const where = /Location of Eye\/center\s+(.*?)\s+Movement\b/i.exec(t)?.[1] ?? ''
    rows.push({ kind: 'tropical_cyclone', title: `${name} - ${decodeHeader(header)}`.slice(0, 200), issued_at: issued, areas: where.slice(0, 400), signals, source_url: BULLETIN_URL })
  })
  return { rows, errors }
}
const decodeHeader = (h: string | undefined) => text(h ?? '') || 'Tropical Cyclone Bulletin'

/** The weather advisory page: the sentence "no Weather Advisory issued" = zero rows; any other text = one row holding that text (cut to 1500 characters). Null = not the advisory page. */
export function parseAdvisory(html: unknown): Parsed | null {
  if (typeof html !== 'string') return null
  const at = html.indexOf('weekly-content-adv')
  if (at < 0 || !html.includes('id="weather-advisory"')) return null
  const start = html.indexOf('>', at) + 1 // past the tag, so its attributes are not text
  const end = html.indexOf('We always find ways', start)
  const t = text(html.slice(start, end > start ? end : start + 8000))
  if (/\bno Weather Advisory\b[^.]*\bissued\b/i.test(t)) return { rows: [], errors: 0 }
  if (!t) return { rows: [], errors: 1 } // empty body is not "nothing issued"
  const title = (/<(?:strong|b|h[1-6])\b[^>]*>([\s\S]*?)<\/(?:strong|b|h[1-6])>/i.exec(html.slice(start, end > start ? end : start + 8000))?.[1] ?? '')
  return { rows: [{ kind: 'advisory', title: (text(title) || t).slice(0, 160), issued_at: issuedAt(t), areas: t.slice(0, 1500), signals: [], source_url: ADVISORY_URL }], errors: 0 }
}

/** The home page "Active Warnings" block. Cyclone labels are skipped (the bulletin page is the authority for them); rainfall and thunderstorm labels become `rainfall`, anything else `advisory`. Null = block not found. */
export function parseHome(html: unknown): Parsed | null {
  if (typeof html !== 'string') return null
  const start = html.indexOf('class="active-alerts"')
  if (start < 0) return null
  const stop = html.indexOf('id="news-media"', start)
  const block = html.slice(start, stop > start ? stop : start + 8000)
  const seen = new Set<string>()
  const rows: WarningRow[] = []
  for (const m of block.matchAll(/<h6 class="active-type">\s*<b>([^<]+)<\/b>/g)) {
    const title = text(m[1]!).slice(0, 160)
    if (!title || seen.has(title) || /tropical cyclone/i.test(title)) continue
    seen.add(title)
    rows.push({ kind: /rainfall|thunderstorm/i.test(title) ? 'rainfall' : 'advisory', title, issued_at: null, areas: '', signals: [], source_url: HOME_URL })
  }
  return { rows, errors: 0 }
}

export const dedupeKey = (r: WarningRow) => `${r.kind}|${r.title}|${r.issued_at ?? ''}`.slice(0, 400)

export interface Port { upsert(rows: DbRow[]): Promise<void>; purge(beforeIso: string): Promise<void> }
export interface Result { ok: boolean; rows: number; failed: string[] }

const SOURCES: { name: string; url: string; parse: (html: unknown) => Parsed | null }[] = [
  { name: 'bulletin', url: BULLETIN_URL, parse: parseBulletins },
  { name: 'advisory', url: ADVISORY_URL, parse: parseAdvisory },
  { name: 'home', url: HOME_URL, parse: parseHome }
]

/** Each source on its own: one that cannot be fetched or read is listed in `failed` and stores nothing; the others still store. Rows older than 14 days are dropped after a run that read at least one page.
 * The app treats a row as current only while `fetched_at` is recent (a run refreshes every row it still sees), so a cyclone that left the page, or a source that broke, stops showing. `now` is epoch ms. */
export async function runPagasa(port: Port, fetchText: (url: string) => Promise<string>, now: number): Promise<Result> {
  const failed: string[] = []
  const rows: WarningRow[] = []
  for (const s of SOURCES) {
    let p: Parsed | null = null
    try { p = s.parse(await fetchText(s.url)) } catch { p = null }
    if (!p || p.errors) failed.push(s.name)
    if (p) rows.push(...p.rows)
  }
  const at = new Date(now).toISOString()
  const byKey = new Map<string, DbRow>()
  for (const r of rows) byKey.set(dedupeKey(r), { ...r, dedupe_key: dedupeKey(r), fetched_at: at })
  if (byKey.size) await port.upsert([...byKey.values()])
  if (failed.length < SOURCES.length) await port.purge(new Date(now - KEEP_DAYS * 86_400_000).toISOString())
  return { ok: !failed.length, rows: byKey.size, failed }
}
