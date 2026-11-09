import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S26 lane W3T: lotto jackpot banner, market prices card, Plant this month card + poster page + All prices, from invented values saved in IndexedDB (the e2e build has no Supabase).
// Screenshots are written only when S26_W3T_SHOTS names a folder (never into the repo).
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const CLOCK = '2026-11-09T12:00:00+08:00'
const NOW = new Date(CLOCK).getTime()
const lotto = [
  { game: 'Ultra Lotto 6/58', draw_date: '2026-11-08', combination: '03-11-24-35-41-57', jackpot_php: null, winners: 0 },
  { game: 'Grand Lotto 6/55', draw_date: '2026-11-07', combination: '05-12-23-34-45-51', jackpot_php: null, winners: 0 },
  { game: '3D Lotto 9PM', draw_date: '2026-11-08', combination: '7-2-9', jackpot_php: null, winners: null }
]
const next = [{ game: 'Ultra Lotto 6/58', draw_date: '2026-11-10', jackpot_php: 486_000_000 }, { game: 'Grand Lotto 6/55', draw_date: '2026-11-11', jackpot_php: 120_500_000 }]
const row = (commodity: string, price_php: number, specification = '') => ({ price_date: '2026-11-08', commodity, specification, unit: 'kg', price_php })
const prices = [row('Regular Milled Rice', 52), row('Galunggong (Round Scad), Local', 260), row('Pork Liempo, Local', 380.5), row('Red Onion, Local', 250), row('Pole Sitao', 109.3), row('Bitter Gourd (Ampalaya)', 109.77, '4-5 pcs/kg'), row('Cucumber, Native/Local', 111.23), row('Cabbage (Rare Ball), Local', 168.75), row('Bottle Gourd (Upo)', 57.28), row('Chayote, Local', 49.46, 'Medium (301-400 gm)')]

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
const overflow = (page: Page, sel: string) => page.evaluate((s) => Array.from(document.querySelectorAll<HTMLElement>(s)).filter((n) => n.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((n) => String(n.className)), sel)

for (const [w, h, scheme] of [[390, 844, 'light'], [390, 844, 'dark'], [195, 844, 'light']] as const) {
  test(`Today data cards and pages at ${w}x${h}, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.clock.setFixedTime(CLOCK)
    await skipOnboarding(page)
    await stubWindy(page)
    await page.route('**/open.er-api.com/**', (r) => r.abort())
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(NOW), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
    await page.goto('/#today')
    await expect(page.getByTestId('myday')).toBeVisible()
    await setScheme(page, scheme)
    await seedKv(page, [
      { key: 'today.lotto', value: { savedAt: NOW, rows: lotto } },
      { key: 'today.lotto.next', value: { savedAt: NOW, rows: next } },
      { key: 'today.daPrices', value: { savedAt: NOW, date: '2026-11-08', rows: prices } },
      { key: 'garden.climate', value: 4 }
    ])
    await page.reload()
    await setScheme(page, scheme)
    const dir = process.env.S26_W3T_SHOTS

    // lotto
    const lot = page.getByTestId('today-lotto')
    await expect(lot).toBeVisible()
    await expect(lot.getByTestId('lotto-big')).toHaveCount(0)
    await expect(lot.locator('.lotto-next').first()).toHaveText('Next draw estimate: ₱486 million')
    expect(await overflow(page, '[data-testid="today-lotto"] *')).toEqual([])
    if (dir) { await lot.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${dir}/lotto-${w}-${scheme}.png` }) }

    // prices card
    const pc = page.getByTestId('today-prices')
    await expect(pc).toBeVisible()
    await expect(pc).toContainText('Metro Manila prices (DA), Nov 8')
    await expect(pc).toContainText('Local prices may differ.')
    await expect(pc.locator('.dpc-row')).toHaveCount(4)
    await expect(pc).toContainText('₱52.00/kg')
    expect((await pc.getByRole('link', { name: 'All prices' }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    expect(await overflow(page, '[data-testid="today-prices"] *')).toEqual([])
    if (dir) { await pc.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${dir}/prices-${w}-${scheme}.png` }) }

    // plant card
    const pl = page.getByTestId('today-plant')
    await expect(pl).toBeVisible()
    await expect(pl.locator('.gpl-tile')).toHaveCount(3)
    await expect(pl.locator('.gpl-tile').first()).toContainText('Sitaw₱109.30/kg')
    expect(await pl.locator('.gpl-tile img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), 'photo loaded').toBe(true)
    expect(await overflow(page, '[data-testid="today-plant"] *')).toEqual([])
    if (dir) { await pl.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${dir}/plant-card-${w}-${scheme}.png` }) }

    // poster page
    await pl.getByTestId('plant-card').click()
    await expect(page).toHaveURL(/#garden\/plant$/)
    const pg = page.getByTestId('plant-page')
    await expect(pg.locator('article.gpl-poster')).toHaveCount(6)
    await expect(pg.getByTestId('poster-Chayote')).toContainText('Grows best in cool upland areas')
    await expect(pg.getByTestId('poster-Yardlong bean')).toContainText('45 to 50 days')
    await expect(pg).toContainText('General guide from the Bureau of Plant Industry planting calendar (PCAARRD bulletin 200, 2000).')
    expect(await overflow(page, '[data-testid="plant-page"] *')).toEqual([])
    for (const a of await pg.locator('.gpl-credit a').all()) expect((await a.boundingBox())!.height, 'credit link target').toBeGreaterThanOrEqual(43.5)
    if (dir) { await page.screenshot({ path: `${dir}/poster-top-${w}-${scheme}.png` }); await pg.getByTestId('poster-Chayote').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${dir}/poster-sayote-${w}-${scheme}.png` }) }

    // all prices
    await page.goto('/#garden/prices')
    const ap = page.getByTestId('prices-page')
    await expect(ap).toContainText('Rice and corn')
    await expect(ap).toContainText('Vegetables')
    await expect(ap).toContainText('Chayote, Local')
    expect(await overflow(page, '[data-testid="prices-page"] *')).toEqual([])
    if (dir) await page.screenshot({ path: `${dir}/all-prices-${w}-${scheme}.png` })
  })
}
