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

// Credit text is meta: at least 15 px and 4.5:1 against the first solid background above it (the Today and Weather notes sit on a scene, so only the font size is checked there)
const noteStyle = (page: Page) => page.getByTestId('forecast-note').first().evaluate((el) => {
  const rgb = (c: string) => (c.match(/[0-9.]+/g) ?? []).map(Number)
  const lum = (c: number[]) => { const [r, g, b] = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
  let bg = el as Element | null
  while (bg && (rgb(getComputedStyle(bg).backgroundColor)[3] ?? 1) === 0) bg = bg.parentElement
  const fg = rgb(getComputedStyle(el).color), back = rgb(bg ? getComputedStyle(bg).backgroundColor : 'rgb(255,255,255)')
  const [hi, lo] = [lum(fg), lum(back)].sort((a, b) => b - a)
  return { size: parseFloat(getComputedStyle(el).fontSize), ratio: (hi! + 0.05) / (lo! + 0.05) }
})

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
    await expect(hero.getByTestId('forecast-note')).toHaveText(/^Weather data by Open-Meteo\.com$/) // no fix: the card says "Location off: showing <place>" once, so its credit has no place
    await expect(page.locator('.td-hs-p, .td-wxh-sp').first()).toHaveText('Raining') // S29: code 61 is raining now, so the first slot says Raining, not a percent
    await expect(page.locator('.td-hs-p, .td-wxh-sp').filter({ hasText: /^\d+% rain$/ }).first()).toBeAttached() // later slots keep NN% rain
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-${w}-${scheme}.png`, fullPage: true })
    await page.goto('/#weather')
    await expect(page.locator('.wx-temp')).toHaveText('29°')
    await expect(page.locator('.wx-hero').getByTestId('forecast-note')).toBeVisible()
    expect((await noteStyle(page)).size).toBeGreaterThanOrEqual(15)
    await expect(page.locator('.wx-strip .wx-rp').first()).toHaveText('Raining') // S29: raining-now chip in the Now cell
    await expect(page.locator('.wx-strip .wx-rp').filter({ hasText: /^\d+% rain$/ }).first()).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/weather-${w}-${scheme}.png`, fullPage: true })
    await page.goto('/#safety')
    await expect(page.getByTestId('right-now')).toBeVisible()
    await expect(page.getByTestId('forecast-note')).toHaveText(/^Forecast for .+ · Weather data by Open-Meteo\.com$/)
    const sf = await noteStyle(page)
    expect(sf.size).toBeGreaterThanOrEqual(15)
    expect(sf.ratio).toBeGreaterThanOrEqual(4.5)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/safety-${w}-${scheme}.png`, fullPage: true })
  })
}
