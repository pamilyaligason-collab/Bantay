import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// Weather scene: every condition x time of day at 390x844, light and dark. Made-up forecast, no network.
// Place clock is Manila (UTC+8); the fixture's sunrise is 05:50 and sunset 17:45.
const SHOTS = shotPath('docs/session-9/shots/w1-weather')
const TODS = { night: '2026-10-20T14:00:00Z', dawn: '2026-10-19T22:15:00Z', day: '2026-10-20T04:00:00Z', dusk: '2026-10-20T09:30:00Z' } as const // 22:00, 06:15, 12:00, 17:30 local
const CONDS = { clear: 0, partly: 2, overcast: 3, fog: 45, drizzle: 53, rain: 63, storm: 95 } as const

async function openAt(page: Page, at: string, code: number, path: string, o: { temp?: number; humidity?: number } = {}) {
  const now = new Date(at)
  await page.clock.setFixedTime(now)
  await skipOnboarding(page)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now, temp: o.temp ?? 28, humidity: o.humidity ?? 55, feels: 30, code, hourlyProb: () => 10 }) }))
  await page.goto(path)
}

test.use({ viewport: { width: 390, height: 844 } })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme })
    for (const [tod, at] of Object.entries(TODS)) {
      for (const [cond, code] of Object.entries(CONDS)) {
        test(`scene ${cond} ${tod}`, async ({ page }) => {
          await openAt(page, at, code, '/#today')
          const scene = page.locator('section[aria-label="Weather"] .wxs')
          await expect(scene).toHaveAttribute('data-cond', cond)
          await expect(scene).toHaveAttribute('data-tod', tod)
          await page.getByRole('region', { name: 'Weather' }).screenshot({ path: `${SHOTS}/card-${cond}-${tod}-${scheme}.png` })
        })
      }
    }

    test('hot clear day: heat tint, one feels-like on card and screen; hero repeats no danger label', async ({ page }) => {
      await openAt(page, TODS.day, 0, '/#today', { temp: 33, humidity: 70 })
      await expect(page.locator('section[aria-label="Weather"] .wxs')).toHaveAttribute('data-hot', '1')
      await expect(page.getByRole('region', { name: 'Weather' })).toContainText(/Feels 4\d° · Danger/)
      await page.screenshot({ path: `${SHOTS}/today-hot-day-${scheme}.png` })
      await page.goto('/#weather')
      await expect(page.getByRole('region', { name: 'Now' })).toContainText(/Feels like 4\d°/)
      await expect(page.getByRole('region', { name: 'Now' })).not.toContainText('Danger')
      await expect(page.getByText(/Danger/)).toHaveCount(2) // action line band and heat scale chip; the hero adds none
      await expect(page.getByRole('region', { name: 'Now' }).locator('.wxs')).toHaveAttribute('data-tod', 'day')
      await page.screenshot({ path: `${SHOTS}/weather-hot-day-${scheme}.png` })
    })

    test('weather screen rain night', async ({ page }) => {
      await openAt(page, TODS.night, 63, '/#weather')
      await expect(page.getByRole('region', { name: 'Now' }).locator('.wxs')).toHaveAttribute('data-cond', 'rain')
      await page.screenshot({ path: `${SHOTS}/weather-rain-night-${scheme}.png` })
    })
  })
}

test('reduced motion: static streaks, no lightning flash, nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openAt(page, TODS.dusk, 95, '/#today')
  await expect(page.locator('section[aria-label="Weather"] .wxs')).toHaveAttribute('data-cond', 'storm')
  await expect(page.locator('.wxs-rain i:visible')).toHaveCount(8) // static streaks, not falling
  await expect(page.locator('.wxs-flash')).toBeHidden()
  expect(await page.locator('.wxs-cloud').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

test('no sideways scroll with the scene on Today and Weather', async ({ page }) => {
  await openAt(page, TODS.day, 63, '/#today')
  await expect(page.locator('.wxs')).toBeVisible()
  for (const hash of ['/#today', '/#weather']) {
    await page.goto(hash)
    await expect(page.locator('.wxs').first()).toBeVisible()
    expect(await page.evaluate(() => (document.querySelector('main.scroll') as Element).scrollWidth - (document.querySelector('main.scroll') as Element).clientWidth)).toBe(0)
  }
})
