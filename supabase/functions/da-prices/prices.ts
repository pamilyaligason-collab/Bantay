// da-prices core (S26, D-164): the DA Daily Price Index PDF (Metro Manila / NCR wet markets) -> da_prices rows.
// Source: https://www.da.gov.ph/price-monitoring/ (public government data, no key). The PDF is read by text-item position, never by a text dump:
// a plain dump (pdftotext -layout) shifts the price column onto the wrong rows. A row is a price cell; its commodity and specification are the
// items of the other two columns that sit on (or, for a wrapped name, vertically around) the same line. Anything unreadable is skipped, never repaired.
export const SOURCE_URL = 'https://www.da.gov.ph/price-monitoring/'
export const KEEP_DAYS = 60
export const MARKET_AREA = 'NCR'
export interface Item { str: string; x: number; y: number; page: number }
export interface PriceRow { price_date: string; commodity: string; specification: string; unit: string; price_php: number; market_area: string; source_url: string }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const ROW_BAND = 9 // pt: a wrapped two-line name sits about 6 pt above and below its price line; a section header sits 16+ pt away
const PRICE = /^\d{1,3}(,\d{3})*\.\d{2}$/

/** "November 8, 2026" parts to yyyy-mm-dd; null when it is not a real calendar day. */
export function isoDate(month: string, day: string, year: string): string | null {
  const mo = MONTHS.indexOf(month.toLowerCase()) + 1
  const y = Number(year), d = Number(day)
  if (!mo || !y || !d) return null
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null
}

/** Price date from the page-1 title line "(Sunday, November 8, 2026)"; null when absent. */
export function titleDate(items: Item[]): string | null {
  for (const it of items) {
    const m = /\b[A-Za-z]+day, ([A-Za-z]+) (\d{1,2}), (\d{4})\b/.exec(it.str)
    if (m) return isoDate(m[1]!, m[2]!, m[3]!)
  }
  return null
}

/** Newest daily PDF link on the listing page (by the date in the file name, not by link order); only https://www.da.gov.ph/ links count. */
export function newestPdf(html: unknown): { url: string; date: string } | null {
  if (typeof html !== 'string') return null
  let best: { url: string; date: string } | null = null
  for (const m of html.matchAll(/href="(https:\/\/www\.da\.gov\.ph\/[^"\s]*?Daily-Price-Index-([A-Za-z]+)-(\d{1,2})-(\d{4})\.pdf)"/g)) {
    const date = isoDate(m[2]!, m[3]!, m[4]!)
    if (date && (!best || date > best.date)) best = { url: m[1]!, date }
  }
  return best
}

const unitOf = (commodity: string) => (/\begg\b/i.test(commodity) ? 'piece' : /\bcooking oil\b/i.test(commodity) ? 'liter' : 'kg') // the PDF's note c): eggs per piece, cooking oil per liter, everything else per kilogram
const join = (xs: Item[]) => xs.sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim()

const HEADER = /^[A-Z][A-Z &,/()-]*$/ // a section line such as "LOCAL COMMERCIAL RICE" (the table's rows are mixed case)
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

/** Rows of one price date from the PDF's text items. Column edges come from each page's header row. Rejects rows with no number or a price outside 1..5000.
 * The same commodity and specification can appear under two sections (Glutinous rice, imported and local): both then carry their section in the commodity name. */
export function parseRows(items: Item[], priceDate: string, sourceUrl: string): PriceRow[] {
  const found: { row: PriceRow; section: string }[] = []
  let section = '' // carries over to the next page
  for (const page of [...new Set(items.map((i) => i.page))].sort((a, b) => a - b)) {
    const its = items.filter((i) => i.page === page && i.str.trim())
    const com = its.find((i) => i.str.trim() === 'COMMODITY')
    const spec = its.find((i) => i.str.trim() === 'SPECIFICATION')
    const price = its.find((i) => i.str.trim().startsWith('PREVAILING'))
    if (!com || !spec || !price) continue // not a table page
    const specMin = (com.x + spec.x) / 2 // commodity text starts left of this, specification text right of it
    const priceMin = price.x // price cells start right of the price header's left edge
    const top = Math.min(com.y, spec.y, price.y) - 1
    const body = its.filter((i) => i.y < top && i.y > 60).sort((a, b) => b.y - a.y || a.x - b.x) // under the header row, above the page footer
    const cells = body.filter((i) => i.x >= priceMin && PRICE.test(i.str.trim()))
    const owner = (i: Item) => { // the nearest price line within the band owns the item
      let best: Item | undefined
      for (const c of cells) if (Math.abs(i.y - c.y) <= ROW_BAND && (!best || Math.abs(i.y - c.y) < Math.abs(i.y - best.y))) best = c
      return best
    }
    let inHeader = false
    for (const i of body) {
      const own = owner(i)
      if (own && i !== own) { inHeader = false; continue } // a name or specification line of a priced row; the row is built when its price cell comes
      if (!own) {
        const t = i.str.trim()
        if (i.x < specMin && HEADER.test(t)) { section = inHeader ? `${section} ${t}` : t; inHeader = true } // a two-line section name is joined
        else inHeader = false
        continue
      }
      inHeader = false
      const commodity = join(body.filter((o) => o.x < specMin && owner(o) === own))
      const specification = join(body.filter((o) => o.x >= specMin && o.x < priceMin && owner(o) === own))
      const price_php = Number(own.str.trim().replace(/,/g, ''))
      if (!commodity || !Number.isFinite(price_php) || price_php < 1 || price_php > 5000) continue
      found.push({ row: { price_date: priceDate, commodity: commodity.slice(0, 120), specification: specification.slice(0, 160), unit: unitOf(commodity), price_php, market_area: MARKET_AREA, source_url: sourceUrl }, section })
    }
  }
  const seen = new Map<string, number>()
  for (const f of found) seen.set(`${f.row.commodity}|${f.row.specification}`, (seen.get(`${f.row.commodity}|${f.row.specification}`) ?? 0) + 1)
  const out = new Map<string, PriceRow>() // a repeat that is still the same after the section is added: the last one wins, so one upsert never names a row twice
  for (const { row, section: s } of found) {
    const r = seen.get(`${row.commodity}|${row.specification}`)! > 1 && s ? { ...row, commodity: `${row.commodity} (${titleCase(s)})`.slice(0, 120) } : row
    out.set(`${r.commodity}|${r.specification}`, r)
  }
  return [...out.values()]
}


export interface Port { upsert(rows: (PriceRow & { fetched_at: string })[]): Promise<void>; purge(beforeDate: string): Promise<void> }
export interface Result { ok: boolean; rows: number }

/** Listing page -> newest PDF -> items -> rows -> upsert, then drop rows older than 60 days. `now` is epoch ms. */
export async function runDaPrices(port: Port, fetchText: (url: string) => Promise<string>, fetchItems: (url: string) => Promise<Item[]>, now: number): Promise<Result> {
  const link = newestPdf(await fetchText(SOURCE_URL))
  if (!link) return { ok: false, rows: 0 } // the page changed or is a block page
  const items = await fetchItems(link.url)
  const date = titleDate(items) ?? link.date
  if (date !== link.date) return { ok: false, rows: 0 } // the file name and the title disagree: do not guess which is right
  const rows = parseRows(items, date, link.url)
  if (!rows.length) return { ok: false, rows: 0 } // a layout change, not "no prices"
  await port.upsert(rows.map((r) => ({ ...r, fetched_at: new Date(now).toISOString() })))
  await port.purge(new Date(now - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)) // only after a readable file, so a failed fetch never empties the table
  return { ok: true, rows: rows.length }
}
