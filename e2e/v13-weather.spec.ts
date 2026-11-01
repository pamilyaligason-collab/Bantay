import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { seed } from './fixtures/s16/today'
import { assertHero, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

// v13 lane W: the Weather screen per board Weather. Made-up forecast, no network (Open-Meteo and the Windy embed are both answered here).
// V13_SHOTS=<dir> also writes the 390x844 light and dark set (docs/redesign-2026-10-31/shots/weather).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const seedLast = (page: Page) => seed(page, 'bantay', 'kv', [{ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } }])

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(FIXED_CLOCKS[1]), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: (h) => (h >= 20 ? 80 : 10) }) }))
  await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toHaveText('26°')
})

test('hero first, one [data-hero], Now above Official above What to do', async ({ page }) => {
  await assertHero(page)
  const top = async (loc: ReturnType<Page['locator']>) => (await loc.first().boundingBox())!.y
  const now = await top(page.getByRole('region', { name: 'Now' }))
  const official = await top(page.getByRole('link', { name: /Official/ }))
  const todo = await top(page.getByRole('region', { name: 'What to do' }))
  expect(now).toBeLessThan(official)
  expect(official).toBeLessThan(todo)
})

for (const [w, h] of [[390, 844], [360, 740]] as const) {
  test(`44 px targets and no sideways scroll at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await assertTargets(page)
    await assertNoSideways(page)
    await assertNoWrappedButtons(page)
  })
}

test('195 px (200% text zoom)', async ({ page }) => {
  await assertNarrow(page)
})

test('contrast, light and dark', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // no colour transition, so the dark read is the settled colour
  for (const s of ['light', 'dark'] as const) {
    await setScheme(page, s)
    await assertTextContrast(page)
  }
})

test('map: no fix shows the prompt, a last fix centres the map', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open live map' })).toHaveCount(0)
  await expect(page.getByText(/nothing to centre on/)).toBeVisible()
  await seedLast(page)
  await page.reload()
  await expect(page.getByTestId('place-last')).toBeVisible()
  await page.getByRole('button', { name: 'Open live map' }).click()
  const frame = page.locator('iframe').first()
  await expect(frame).toHaveAttribute('src', /lat=10\.32/)
  await expect(frame).not.toHaveAttribute('src', /9\.65/)
})

test('reduced motion: the scene is still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.locator('.wx-hero .wxs')).toHaveAttribute('data-still', '1')
})

test('shots', async ({ page }) => {
  await shotsLightDark(page, 'weather')
  await seedLast(page)
  await page.reload()
  await page.getByRole('button', { name: 'Open live map' }).click()
  await expect(page.locator('iframe').first()).toBeVisible()
  await shotsLightDark(page, 'weather-map')
})
