import { expect, test } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { assertBudget, assertJackClear } from './s16'

// S16 L9: Today renders with WebGL off, reduced motion is a still picture, Safety draws no scene and no canvas.
test.use({ viewport: { width: 390, height: 844 } })
const NOW = new Date('2026-10-20T04:00:00Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await skipOnboarding(page)
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: NOW, temp: 28, humidity: 55, feels: 30, code: 63, hourlyProb: () => 10 }) }))
})

for (const scheme of ['light', 'dark'] as const) {
  test(`Today with WebGL disabled: scene renders, no canvas, within budget ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null })
    await page.goto('/#today')
    const scene = page.locator('section[aria-label="Weather"] .wxs')
    await expect(scene).toHaveAttribute('data-cond', 'rain')
    await expect(page.locator('canvas')).toHaveCount(0)
    await assertBudget(page, 1900)
    await assertJackClear(page)
    if (process.env.S16_SHOTS) await page.screenshot({ path: `docs/session-16/shots/L9/today-${scheme}.png` })
  })
}

test('reduced motion: the scene is still (static positions, 8 streaks, no flash, nothing animates)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#today')
  const scene = page.locator('section[aria-label="Weather"] .wxs')
  await expect(scene).toHaveAttribute('data-still', '1')
  await expect(page.locator('.wxs-rain i:visible')).toHaveCount(8)
  expect(await page.locator('.wxs-cloud').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

test('moving: rain falls and the clouds drift at two depths', async ({ page }) => {
  await page.goto('/#today')
  await expect(page.locator('.wxs')).not.toHaveAttribute('data-still', '1')
  expect(await page.locator('.wxs-rain i').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('wxs-fall')
  expect(await page.locator('.wxs-near').first().evaluate((el) => getComputedStyle(el).animationDuration)).toBe('70s')
  expect(await page.locator('.wxs-far').first().evaluate((el) => getComputedStyle(el).animationDuration)).toBe('110s')
})

test('Safety: no canvas, and the Today scene is still once Safety is up (hash change, not a vacuous count)', async ({ page }) => {
  await page.goto('/#today')
  await expect(page.locator('.wxs')).not.toHaveAttribute('data-still', '1')
  await page.evaluate(() => { location.hash = '#safety/warnings' })
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('.wxs[data-still="1"]')).toHaveCount(await page.locator('.wxs').count())
})

test('hold SOS with Aurora allowed: the SOS screen opens and there is no canvas and no moving scene', async ({ page }) => {
  await page.goto('/#safety')
  const btn = page.getByRole('button', { name: /^SOS\./ })
  const c = (await btn.boundingBox())!
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(3400) // HOLD_MS is 3000
  await page.mouse.up()
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('.wxs:not([data-still])')).toHaveCount(0)
})
