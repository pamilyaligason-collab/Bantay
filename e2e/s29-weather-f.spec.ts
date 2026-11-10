import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding, stubWindy } from './helpers'
import { setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S29 lane F fix round: the air, sun and rain-alert cards at the two phone sizes, light and dark. Shots only land in S29_SHOTS (default: test-results/s29-shots, repo-relative).
const DIR = process.env.S29_SHOTS ?? 'test-results/s29-shots'
const NOW = '2026-11-10T04:00:00Z' // 12:00 in Manila: the sun is up
const SIZES = [{ w: 390, h: 844 }, { w: 360, h: 780 }] as const

async function mock(page: Page) {
  await stubWindy(page)
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(NOW), temp: 31, humidity: 70 }) }))
  await page.route('https://air-quality-api.open-meteo.com/**', (r) => {
    const end = Date.parse(NOW)
    const time = Array.from({ length: 48 }, (_, i) => new Date(end - (47 - i) * 3600_000).toISOString().slice(0, 16)) // utc_offset 0: the place clock is UTC
    return r.fulfill({ json: { utc_offset_seconds: 0, hourly: { time, pm2_5: time.map(() => 50) } } }) // 50 ug/m3 is level 4, Very Unhealthy
  })
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled' })
/** Scroll the card to the middle of the screen and prove its whole box sits above the bottom nav. */
async function inView(page: Page, testId: string) {
  const card = page.getByTestId(testId)
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const [b, nav] = await Promise.all([card.boundingBox(), page.getByTestId('tabbar').boundingBox()])
  expect(b!.y).toBeGreaterThanOrEqual(0)
  expect(b!.y + b!.height).toBeLessThanOrEqual(nav!.y)
  return b!
}

for (const { w, h } of SIZES) for (const scheme of ['light', 'dark'] as const) {
  test(`${w}x${h} ${scheme}: air, sun and privacy cards`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.clock.setFixedTime(NOW)
    await skipOnboarding(page); await mock(page)
    await page.goto('/#weather')
    await setScheme(page, scheme)
    await expect(page.getByRole('heading', { name: 'Weather', level: 1 })).toBeVisible()
    await shot(page, `weather-top-${w}x${h}-${scheme}`)

    await expect(page.getByTestId('wx-aqi')).toContainText('Very Unhealthy')
    await expect(page.getByTestId('wx-aqi')).toContainText('Postpone trips you do not need.')
    await inView(page, 'wx-aqi'); await shot(page, `air-${w}x${h}-${scheme}`)

    const sun = page.getByTestId('wx-sun')
    await expect(sun).toContainText('Sun rises'); await expect(sun).toContainText('Sun sets')
    await expect(page.getByTestId('wx-sun-dot')).toHaveAttribute('data-state', 'up')
    await inView(page, 'wx-sun'); await shot(page, `sun-${w}x${h}-${scheme}`)

    const made = page.locator('.wx-made')
    await expect(made).toContainText('Air quality is asked from Open-Meteo directly, with the place rounded to about 1 km.')
    await expect(page.getByText(/from Open-Meteo\. Its global/)).toHaveCount(0)
    await made.evaluate((el) => el.scrollIntoView({ block: 'center' })); await shot(page, `made-${w}x${h}-${scheme}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test(`${w}x${h} ${scheme}: the rain alert chance row (native mocked), 60 then 80 saved`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.clock.setFixedTime(NOW)
    await page.addInitScript(() => { (window as unknown as { androidBridge: unknown }).androidBridge = { postMessage() {} } }) // Capacitor reads this as an Android phone
    await skipOnboarding(page); await mock(page)
    await page.goto('/#weather')
    await setScheme(page, scheme)
    await page.getByTestId('wx-remind').click() // the switch is saved first; the permission ask has nobody to answer and is left hanging
    const row = page.getByTestId('wx-thresh')
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: '60%' })).toHaveAttribute('aria-pressed', 'true')
    await expect(row).toHaveCSS('background-color', 'rgba(5, 12, 28, 0.45)') // a dark track under white labels on the sky page
    await inView(page, 'wx-thresh'); await shot(page, `thresh-60-${w}x${h}-${scheme}`)
    await row.getByRole('button', { name: '80%' }).click()
    await expect(row.getByRole('button', { name: '80%' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => page.evaluate(() => new Promise<unknown>((res) => {
      const o = indexedDB.open('bantay')
      o.onsuccess = () => { const g = o.result.transaction('kv').objectStore('kv').get('wx.rainThreshold'); g.onsuccess = () => { o.result.close(); res(g.result?.value) } }
    }))).toBe(80)
    await inView(page, 'wx-thresh'); await shot(page, `thresh-80-${w}x${h}-${scheme}`)
  })
}
