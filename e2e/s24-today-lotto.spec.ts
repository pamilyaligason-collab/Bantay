import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S24 lane C: Today News (5 rows) and the Lotto results card from invented rows saved in IndexedDB (the e2e build has no Supabase env, so both read their saved copy).
// Screenshots are written only when S24_SHOTS names a folder (never into the repo).
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const NOW = new Date(FIXED_CLOCKS[1]).getTime()
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString()
const news = [
  { id: 'n1', title: 'Invented harbour council posts the new ferry timetable', url: 'https://news.example/n1', source: 'Example Daily', kind: 'article', published_at: h(1), zone: null },
  { id: 'n2', title: 'Invented typhoon signal raised over the northern coast', url: 'https://news.example/n2', source: 'Example Daily', kind: 'article', published_at: h(2), zone: null },
  { id: 'n3', title: 'Invented health office reminds families about dengue and clean water', url: 'https://news.example/n3', source: 'Example Wire', kind: 'article', published_at: h(3), zone: null, topic: 'health' },
  { id: 'n4', title: 'Invented market opens early on Saturday', url: 'https://news.example/n4', source: 'Example Wire', kind: 'article', published_at: h(4), zone: null },
  { id: 'n5', title: 'Invented school schedule update for the week', url: 'https://news.example/n5', source: 'Example Wire', kind: 'article', published_at: h(5), zone: null },
  { id: 'n6', title: 'Invented bridge repair finishes ahead of plan', url: 'https://news.example/n6', source: 'Example Wire', kind: 'article', published_at: h(6), zone: null }
]
const lotto = [
  { game: 'Ultra Lotto 6/58', draw_date: '2026-11-03', combination: '03-11-24-35-41-57', jackpot_php: 49500000, winners: 0 },
  { game: 'Grand Lotto 6/55', draw_date: '2026-11-07', combination: '05-12-23-34-45-51', jackpot_php: 31200000, winners: 0 },
  { game: 'Super Lotto 6/49', draw_date: '2026-11-05', combination: '01-09-17-28-36-44', jackpot_php: 22400000, winners: 1 },
  { game: 'Mega Lotto 6/45', draw_date: '2026-11-06', combination: '02-14-21-30-38-43', jackpot_php: 9800000, winners: 0 },
  { game: 'Lotto 6/42', draw_date: '2026-11-07', combination: '04-10-19-27-33-40', jackpot_php: 12600000, winners: 2 },
  { game: '3D Lotto 9PM', draw_date: '2026-11-07', combination: '7-2-9', jackpot_php: null, winners: null }
]

async function seedKv(page: Page, list: { key: string; value: unknown }[]) {
  await expect.poll(() => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'bantay')) return false
    return new Promise<boolean>((res) => { const o = indexedDB.open('bantay'); o.onerror = () => res(false); o.onsuccess = () => { const ok = o.result.objectStoreNames.contains('kv'); o.result.close(); res(ok) } })
  })).toBe(true)
  await page.evaluate(async (l) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); for (const r of l) tx.objectStore('kv').put(r); tx.oncomplete = () => { open.result.close(); res() }; tx.onerror = () => rej(tx.error) }
    })
  }, list)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`Today News (5 rows) and Lotto results at 390x844, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.setFixedTime(FIXED_CLOCKS[1])
    await skipOnboarding(page)
    await stubWindy(page)
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(NOW), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
    await page.goto('/#today')
    await expect(page.getByTestId('myday')).toBeVisible()
    await setScheme(page, scheme)
    await seedKv(page, [{ key: 'discover.news', value: { savedAt: NOW, zone: null, items: news } }, { key: 'today.lotto', value: { savedAt: NOW, rows: lotto } }])
    await page.reload()
    await setScheme(page, scheme)
    const card = page.getByTestId('today-lotto')
    const feed = page.getByTestId('today-news')
    await expect(feed.locator('.tn-row')).toHaveCount(5)
    await expect(card).toBeVisible()
    await expect(card.locator('.lotto-row')).toHaveCount(3) // newest three draws first
    await expect(card).toContainText('Source: lottopcso.com (unofficial). Check your ticket with PCSO.')
    expect(await page.evaluate(() => { const a = document.querySelector('[data-testid="today-news"]'), b = document.querySelector('[data-testid="today-lotto"]'); return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) }), 'Lotto sits right after News').toBe(true)
    // health first, then weather: the dengue row leads, the typhoon row is second
    await expect(feed.locator('.tn-row').nth(0)).toContainText('health office')
    await expect(feed.locator('.tn-row').nth(1)).toContainText('typhoon')
    const more = card.getByRole('button', { name: 'More games' })
    const box = await more.boundingBox()
    expect(box!.height, 'More games is a 44px target').toBeGreaterThanOrEqual(43.5)
    expect(await card.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>('*')).filter((n) => n.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((n) => String(n.className)))).toEqual([])
    expect(await card.locator('.lotto-ball').first().evaluate((b) => b.getBoundingClientRect().width)).toBeGreaterThanOrEqual(30)
    const dir = process.env.S24_SHOTS
    if (dir) {
      await feed.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${dir}/today-news-${scheme}.png` })
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${dir}/today-lotto-${scheme}.png` })
    }
    await more.click()
    await expect(card.locator('.lotto-row')).toHaveCount(6)
    if (dir) { await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${dir}/today-lotto-all-${scheme}.png` }) }
  })
}
