import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertNoSideways, assertOrder, assertTargets, FIXED_CLOCKS, setScheme } from './v13'

// v13 lane T: the Today tab root per board Main. Hero, order, header, honest empty states; geometry helpers come from e2e/v13.ts.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  const now = new Date(FIXED_CLOCKS[1])
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
  await page.goto('/#today')
  await expect(page.getByTestId('myday')).toBeVisible()
})

test('header: the greeting is the h1, the date is the kicker, bell and avatar are 44 px links', async ({ page }) => {
  const head = page.getByTestId('today-head')
  await expect(head.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)/)
  await expect(head.locator('.lt-kicker')).not.toBeEmpty()
  for (const name of [/^Notifications/, 'You and settings']) {
    const box = (await head.getByRole('link', { name }).boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await expect(page.locator('.sh-top')).toHaveCount(0) // the shell top bar is off on the Today root
})

test('order: hero, My day, Calm, Your numbers; no SOS pill, no quick-log grid, no family feed', async ({ page }) => {
  await assertOrder(page, ['weather-hero', 'myday', 'calm', 'numbers'])
  await expect(page.locator('.td-sos, .td-quick, [data-testid="family-feed"]')).toHaveCount(0)
})

test('the hero is one link to Weather', async ({ page }) => {
  await expect(page.getByTestId('weather-hero').getByRole('link').first()).toHaveAttribute('href', /#weather/)
})

test('My day: ring, the three rows and the breath row', async ({ page }) => {
  const day = page.getByTestId('myday')
  await expect(day.getByRole('img', { name: /of \d+ done/ })).toBeVisible()
  await expect(day.getByRole('button', { name: "I'm OK" })).toBeVisible()
  await expect(day.getByRole('link', { name: 'Log' })).toBeVisible()
  await expect(day.getByRole('button', { name: 'Add a glass of water' })).toBeVisible()
  await expect(day.getByTestId('selfcare')).toBeVisible()
})

test('Your numbers: empty tiles are honest, and the radio row is off by default', async ({ page }) => {
  const nums = page.getByTestId('numbers')
  await expect(nums.getByText('--/--')).toBeVisible()
  await expect(nums.getByText('Log now').first()).toBeVisible()
  await expect(page.getByText('Relaxing radio')).toHaveCount(0)
})

test('Calm card opens the breath sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Breathe for 1 minute' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: targets and no sideways scroll at 360 px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await setScheme(page, scheme)
    await assertTargets(page)
    await assertNoSideways(page)
  })
}
