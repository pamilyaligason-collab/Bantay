import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S26 lane L2: Talk hero card, US dollar card (saved rate, offline chip, one GET a day) and the Lotto layout, from invented values saved in IndexedDB.
// Screenshots are written only when S26_L2_SHOTS names a folder (never into the repo).
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const NOW = new Date(FIXED_CLOCKS[0]).getTime()
const lotto = [
  { game: 'Ultra Lotto 6/58', draw_date: '2026-11-03', combination: '03-11-24-35-41-57', jackpot_php: null, winners: 0 },
  { game: 'Grand Lotto 6/55', draw_date: '2026-11-07', combination: '05-12-23-34-45-51', jackpot_php: null, winners: 0 },
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

const noOverflow = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="today-talk"] *, [data-testid="today-fx"] *, [data-testid="today-lotto"] *')).filter((n) => n.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((n) => String(n.className)))

for (const [w, h, scheme] of [[390, 844, 'light'], [390, 844, 'dark'], [195, 844, 'light']] as const) {
  for (const mode of ['today-rate', 'offline'] as const) {
    test(`Talk, US dollar (${mode}) and Lotto at ${w}x${h}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await page.clock.setFixedTime(FIXED_CLOCKS[0])
      await skipOnboarding(page)
      await stubWindy(page)
      let fxCalls = 0
      await page.route('**/open.er-api.com/**', (r) => { fxCalls++; return r.abort() }) // the saved rate is what shows; a failed GET is the offline case
      await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(NOW), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
      await page.goto('/#today')
      await expect(page.getByTestId('myday')).toBeVisible()
      await setScheme(page, scheme)
      const day = 86_400_000
      await seedKv(page, [
        { key: 'today.lotto', value: { savedAt: NOW, rows: lotto } },
        { key: 'fx.usd', value: mode === 'today-rate' ? { php: 63.1, at: NOW - 3_600_000, prev: 63.02, prevAt: NOW - day } : { php: 63.1, at: NOW - 2 * day, prev: null, prevAt: null } }
      ])
      fxCalls = 0 // the first load (nothing saved yet) asked once; count only after the seed
      await page.reload()
      await setScheme(page, scheme)
      const talk = page.getByTestId('today-talk'), fx = page.getByTestId('today-fx'), card = page.getByTestId('today-lotto')
      await expect(talk).toBeVisible()
      await expect(talk.getByRole('link', { name: /See hotlines/ })).toHaveAttribute('href', '#calm')
      expect((await talk.getByRole('link').boundingBox())!.height).toBeGreaterThanOrEqual(47.5)
      expect(await talk.evaluate((el) => getComputedStyle(el).boxShadow), 'not the hero: resting shadow, not --shadow-hero').not.toBe(await page.evaluate(() => { const d = document.createElement('div'); d.style.boxShadow = 'var(--shadow-hero)'; document.body.appendChild(d); const v = getComputedStyle(d).boxShadow; d.remove(); return v }))
      await expect(fx).toBeVisible()
      await expect(fx).toContainText('₱63.10')
      await expect(fx).toContainText('Market rate, not the BSP reference rate.')
      await expect(fx).toContainText('Rates from open.er-api.com (ExchangeRate-API)')
      if (mode === 'today-rate') {
        await expect(fx.getByTestId('fx-change')).toContainText('Up ₱0.08 since yesterday')
        await expect(fx.getByRole('status')).toHaveCount(0)
        expect(fxCalls, 'saved today: no GET').toBe(0)
      } else {
        await expect(fx.getByRole('status')).toContainText(/^Offline · rate from \d{1,2}:\d{2} (AM|PM)$/)
      }
      await expect(card).toBeVisible()
      const row = card.locator('.lotto-row').first()
      const [head, balls] = [await row.locator('.lotto-head').boundingBox(), await row.locator('.lotto-balls').boundingBox()]
      expect(balls!.y, 'balls sit below the name and date').toBeGreaterThanOrEqual(head!.y + head!.height - 1)
      const ball0 = await row.locator('.lotto-ball').first().boundingBox()
      const rowBox = await row.boundingBox()
      expect(ball0!.x - rowBox!.x, 'balls left-aligned').toBeLessThan(2)
      expect((await card.getByRole('link', { name: 'Check your ticket with PCSO' }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
      expect(await noOverflow(page)).toEqual([])
      const dir = process.env.S26_L2_SHOTS
      if (dir) {
        await talk.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `${dir}/today-talk-fx-${mode}-${w}-${scheme}.png` })
        await card.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `${dir}/today-lotto-${mode}-${w}-${scheme}.png` })
      }
    })
  }
}
