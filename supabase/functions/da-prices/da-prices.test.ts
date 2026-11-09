// @vitest-environment node
// The fixture is the text items (str, x, y, page) of pages 9-10 of the public DA Daily Price Index for 8 Nov 2026, plus its page-1 title line (public government data, no personal data).
// Expected values are hand-read from the PDF page, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { type Item, newestPdf, parseRows, runDaPrices, SOURCE_URL, titleDate } from './prices.ts'

const items = JSON.parse(readFileSync(new URL('./fixtures/items-nov8.json', import.meta.url), 'utf8')) as Item[]
const URL8 = 'https://www.da.gov.ph/wp-content/uploads/2026/11/Daily-Price-Index-November-8-2026.pdf'
const rows = parseRows(items, '2026-11-08', URL8)
const find = (commodity: string, specification?: string) => rows.filter((r) => r.commodity === commodity && (specification === undefined || r.specification === specification))

describe('parseRows', () => {
  it('reads the six named rows with their own price (not the neighbour row)', () => {
    const want: [string, number][] = [['Bitter Gourd (Ampalaya)', 109.77], ['Bottle Gourd (Upo)', 57.28], ['Cabbage (Rare Ball), Local', 168.75], ['Chayote, Local', 49.46], ['Cucumber, Native/Local', 111.23], ['Pole Sitao', 109.3]]
    for (const [name, price] of want) {
      const r = find(name)
      expect(r.length, name).toBe(1)
      expect(r[0]).toMatchObject({ price_php: price, price_date: '2026-11-08', market_area: 'NCR', unit: 'kg', source_url: URL8 })
    }
  })
  it('reads the specification, including a row with none and wrapped names and specifications', () => {
    expect(find('Bitter Gourd (Ampalaya)')[0]!.specification).toBe('4-5 pcs/kg')
    expect(find('Bottle Gourd (Upo)')[0]!.specification).toBe('')
    expect(find('Habichuelas/Baguio Beans, Local')[0]).toMatchObject({ price_php: 120.7, specification: '' })
    expect(find('Lettuce (Iceberg), Local')[0]).toMatchObject({ price_php: 216.84, specification: 'Medium (301-450 cm diam./bunch hd)' })
    expect(find('Garlic, Native/Local')[0]).toMatchObject({ price_php: 382.86, specification: 'Whole, covered with outer skin, 3.0 cm and 3.9 cm in diam.' })
    expect(find('Garlic, Imported')[0]!.price_php).toBe(148.36)
  })
  it('keeps one row per commodity and specification; the same commodity with another specification is its own row', () => {
    expect(find('White Onion, Imported').map((r) => [r.specification, r.price_php])).toEqual([['Medium (13-15 pcs/kg)', 152.59], ['Large', 142.94]])
  })
  it('skips n/a rows, section headers, the table header and the page footer; 44 priced rows on the two pages (23 + 21, counted by hand)', () => {
    expect(find('Bell Pepper (Green), Imported')).toEqual([])
    expect(find('Red Onion, Imported')).toEqual([])
    expect(rows.some((r) => /^(LOWLAND|HIGHLAND) VEGETABLES$|^SPICES$|^FRUITS$|^COMMODITY$|^Page$/.test(r.commodity))).toBe(false)
    expect(rows).toHaveLength(44)
    expect(rows.every((r) => r.price_php >= 1 && r.price_php <= 5000 && r.commodity)).toBe(true)
  })
  it('rejects a price outside 1..5000 and a cell that is not a number', () => {
    const swap = (str: string, to: string) => items.map((i) => (i.str === str && i.page === 9 ? { ...i, str: to } : i))
    expect(find('Okra').length).toBe(1)
    expect(parseRows(swap('124.06', '0.99'), 'd', 'u').some((r) => r.commodity === 'Okra')).toBe(false)
    expect(parseRows(swap('124.06', '5,000.01'), 'd', 'u').some((r) => r.commodity === 'Okra')).toBe(false)
    expect(parseRows(swap('124.06', '5,000.00'), 'd', 'u').find((r) => r.commodity === 'Okra')!.price_php).toBe(5000)
    expect(parseRows(swap('124.06', 'abc'), 'd', 'u').some((r) => r.commodity === 'Okra')).toBe(false)
  })
  it('uses the header of each page: a page without one is skipped, never guessed', () => {
    expect(parseRows(items.filter((i) => i.str !== 'COMMODITY' || i.page !== 9), 'd', 'u').some((r) => r.commodity === 'Okra')).toBe(false)
  })
  it('the same commodity and specification under two sections keeps both, each named by its section (imported and local glutinous rice)', () => {
    const t = (str: string, x: number, y: number): Item => ({ str, x, y, page: 1 })
    const hdr = [t('COMMODITY', 115, 741), t('SPECIFICATION', 269, 741), t('PREVAILING RETAIL PRICE PER', 402, 747)]
    const two = [...hdr, t('IMPORTED COMMERCIAL', 77, 700), t('RICE', 77, 688), t('Glutinous', 77, 670), t('61.03', 462, 670), t('LOCAL COMMERCIAL RICE', 77, 640), t('Glutinous', 77, 620), t('70.29', 462, 620), t('Basmati', 77, 600), t('170.00', 459, 600)]
    expect(parseRows(two, 'd', 'u').map((r) => [r.commodity, r.price_php])).toEqual([['Glutinous (Imported Commercial Rice)', 61.03], ['Glutinous (Local Commercial Rice)', 70.29], ['Basmati', 170]])
  })
  it('units follow the PDF note: eggs per piece, cooking oil per liter', () => {
    const hdr: Item[] = [{ str: 'COMMODITY', x: 115, y: 741, page: 1 }, { str: 'SPECIFICATION', x: 269, y: 741, page: 1 }, { str: 'PREVAILING RETAIL PRICE PER', x: 402, y: 747, page: 1 },
      { str: 'Chicken Egg (White, Large)', x: 77, y: 700, page: 1 }, { str: '8.83', x: 465, y: 700, page: 1 }, { str: 'Cooking Oil (Palm)', x: 77, y: 680, page: 1 }, { str: '1 Liter/bottle', x: 223, y: 680, page: 1 }, { str: '101.41', x: 459, y: 680, page: 1 }]
    expect(parseRows(hdr, 'd', 'u').map((r) => [r.commodity, r.unit, r.price_php])).toEqual([['Chicken Egg (White, Large)', 'piece', 8.83], ['Cooking Oil (Palm)', 'liter', 101.41]])
  })
})

describe('titleDate and newestPdf', () => {
  it('reads the date from the page-1 title line; null when absent or not a real day', () => {
    expect(titleDate(items)).toBe('2026-11-08')
    expect(titleDate([{ str: '(Sunday, February 30, 2026)', x: 0, y: 0, page: 1 }])).toBeNull()
    expect(titleDate([])).toBeNull()
  })
  it('picks the newest dated link whatever the link order, and only da.gov.ph links', () => {
    const a = (u: string) => `<a href="${u}">x</a>`
    const html = [a('https://www.da.gov.ph/wp-content/uploads/2026/10/Daily-Price-Index-October-31-2026.pdf'), a('https://evil.example/Daily-Price-Index-December-1-2026.pdf'),
      a('https://www.da.gov.ph/wp-content/uploads/2026/11/Daily-Price-Index-November-8-2026.pdf'), a('https://www.da.gov.ph/wp-content/uploads/2026/11/Daily-Price-Index-November-7-2026.pdf')].join('')
    expect(newestPdf(html)).toEqual({ url: URL8, date: '2026-11-08' })
    expect(newestPdf('<html>nothing</html>')).toBeNull()
    expect(newestPdf(null)).toBeNull()
  })
})

describe('index.ts wiring (source guard; the Deno entry cannot load under vitest)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('checks the secret before any work, upserts on the table key, never chains .catch on a supabase builder, and records the run', () => {
    expect(src.indexOf('not_configured')).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain("onConflict: 'price_date,commodity,specification'")
    expect(src).toContain("from('da_prices')")
    expect(src).toContain("heartbeat(sb, 'da-prices'")
    expect(src).not.toMatch(/\.(catch|finally)\(/)
  })
})

describe('runDaPrices', () => {
  const NOW = Date.parse('2026-11-09T02:00:00Z')
  const page = `<a href="${URL8}">Nov 8</a>`
  const port = () => ({ upsert: vi.fn(async () => {}), purge: vi.fn(async () => {}) })

  it('upserts every row and purges 60 days back (2026-09-10)', async () => {
    const p = port()
    const r = await runDaPrices(p, async (u) => (u === SOURCE_URL ? page : ''), async (u) => (u === URL8 ? items : []), NOW)
    expect(r).toEqual({ ok: true, rows: 44 })
    expect(p.upsert).toHaveBeenCalledTimes(1)
    expect((p.upsert.mock.calls[0] as unknown as [{ fetched_at: string }[]])[0]).toHaveLength(44)
    expect(p.purge).toHaveBeenCalledWith('2026-09-10')
  })
  it('writes and purges nothing when the listing has no link, the file name and title disagree, or no row parses', async () => {
    const cases: [string, Item[]][] = [['<html></html>', items], [page, items.map((i) => (i.str.startsWith('(Sunday') ? { ...i, str: '(Saturday, November 7, 2026)' } : i))], [page, []]]
    for (const [html, its] of cases) {
      const p = port()
      expect(await runDaPrices(p, async () => html, async () => its, NOW)).toEqual({ ok: false, rows: 0 })
      expect(p.upsert).not.toHaveBeenCalled()
      expect(p.purge).not.toHaveBeenCalled()
    }
  })
})
