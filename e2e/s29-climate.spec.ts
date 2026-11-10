import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S29 lane C: "Climate outlook" directly above "Plant this month" on Today, from PAGASA's real Bohol outlook (issued 3 Nov 2026) saved in IndexedDB (the e2e build has no Supabase,
// so the app reads its saved copy). Screenshots are written only when S29_C_SHOTS names a folder (never into the repo).
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const CLOCK = '2026-11-10T12:00:00+08:00'
const BOHOL = {
  province: 'Bohol', issued_at: '2026-11-03',
  months: [['2026-10', 'not_affected', 'assessment'], ['2026-11', 'not_affected', 'outlook'], ['2026-12', 'dry_condition', 'outlook'], ['2027-01', 'dry_spell', 'outlook'], ['2027-02', 'drought', 'outlook'], ['2027-03', 'drought', 'outlook'], ['2027-04', 'drought', 'outlook']]
    .map(([month, level, kind]) => ({ month, level, kind }))
}

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

for (const [w, h, scheme] of [[390, 844, 'light'], [390, 844, 'dark'], [360, 780, 'light'], [360, 780, 'dark']] as const) {
  test(`Climate outlook sits above Plant this month at ${w}x${h}, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.clock.setFixedTime(CLOCK)
    await skipOnboarding(page)
    await stubWindy(page)
    await page.route('**/open.er-api.com/**', (r) => r.abort())
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(CLOCK), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
    await page.goto('/#today')
    await expect(page.getByTestId('myday')).toBeVisible()
    await setScheme(page, scheme)
    await seedKv(page, [{ key: 'garden.drought.Bohol', value: BOHOL }, { key: 'garden.climate', value: 4 }])
    await page.reload()
    await setScheme(page, scheme)
    const dir = process.env.S29_C_SHOTS

    const cl = page.getByTestId('today-climate')
    await expect(cl).toBeVisible()
    await expect(cl.locator('.clm-chip')).toHaveCount(7)
    await expect(cl).toContainText('Dry spell expected from January; drought possible February to April.')
    await expect(cl.getByRole('link', { name: /PAGASA Drought Monitor/ })).toHaveAttribute('href', /pagasa\.dost\.gov\.ph/)
    expect((await cl.getByRole('link', { name: /PAGASA Drought Monitor/ }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await expect(page.getByTestId('pagasa-map-section')).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0) // the PANaHON frame is gone from Today

    // Climate directly above Plant, as one group: Plant starts right below Climate (one section gap)
    const pl = page.getByTestId('today-plant')
    await expect(pl).toBeVisible()
    await expect(pl).toContainText('Because of the dry spell in Bohol, these crops cope with less water.')
    const a = (await cl.boundingBox())!, b = (await pl.boundingBox())!
    expect(b.y).toBeGreaterThan(a.y + a.height - 1)
    expect(b.y - (a.y + a.height)).toBeLessThanOrEqual(40)

    // the six month chips sit in two even rows of three, and the Now chip spans the row above them
    const boxes = await cl.locator('.clm-chip').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }))
    const grid = boxes.slice(1)
    expect(new Set(grid.map((x) => Math.round(x.w))).size).toBe(1)
    expect(new Set(grid.map((x) => Math.round(x.h))).size).toBe(1)
    expect(new Set(grid.map((x) => Math.round(x.y))).size).toBe(2)
    expect(Math.abs(boxes[0]!.w - (grid[2]!.x + grid[2]!.w - grid[0]!.x))).toBeLessThanOrEqual(1) // Now spans all three columns
    const card = (await cl.getByTestId('climate-card').boundingBox())!
    expect(Math.abs((grid[0]!.x - card.x) - (card.x + card.width - (grid[2]!.x + grid[2]!.w)))).toBeLessThanOrEqual(1) // equal left and right padding
    expect(await overflow(page, '[data-testid="today-climate"] *')).toEqual([])
    expect(await overflow(page, '[data-testid="today-plant"] *')).toEqual([])
    if (dir) { await cl.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${dir}/climate-${w}x${h}-${scheme}.png` }) }
  })
}
