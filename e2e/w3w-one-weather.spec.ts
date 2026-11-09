import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Lane W3W (D-163): Today hero, Safety and Weather read one forecast; place label, credit, "NN% rain" slots. Made-up forecast, no network.
// Shots go to W3W_SHOTS (outside the repo); without it nothing is written.
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
const NOON = '2026-10-31T12:00:00+08:00'
const SHOTS = process.env.W3W_SHOTS

async function open(page: Page, hash: string) {
  await page.clock.setFixedTime(NOON)
  await skipOnboarding(page)
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(NOON), code: 61, temp: 29, humidity: 80, hourlyProb: () => 40 }) }))
  await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))
  await page.goto(hash)
}

for (const [w, scheme] of [[390, 'light'], [390, 'dark'], [195, 'light']] as const) {
  test(`one source at ${w} ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await setScheme(page, scheme)
    await open(page, '/#today')
    const hero = page.getByTestId('weather-hero')
    await expect(hero).toContainText('29°')
    await expect(hero.getByTestId('forecast-note')).toHaveText(/^Forecast for .+ · Weather data by Open-Meteo\.com$/)
    await expect(page.locator('.td-hs-p, .td-wxh-sp').first()).toHaveText(/^\d+% rain$/)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-${w}-${scheme}.png`, fullPage: true })
    await page.goto('/#weather')
    await expect(page.locator('.wx-temp')).toHaveText('29°')
    await expect(page.locator('.wx-hero').getByTestId('forecast-note')).toBeVisible()
    await expect(page.locator('.wx-strip .wx-rp').first()).toHaveText(/^\d+% rain$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/weather-${w}-${scheme}.png`, fullPage: true })
    await page.goto('/#safety')
    await expect(page.getByTestId('right-now')).toBeVisible()
    await expect(page.getByTestId('forecast-note')).toHaveText(/^Forecast for .+ · Weather data by Open-Meteo\.com$/)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/safety-${w}-${scheme}.png`, fullPage: true })
  })
}
