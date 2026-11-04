import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertTextContrast, fullPageShot, setScheme } from './v13'

// Final gaps (T6, C5 shots): Today's night hero reads as board Main (sky #1C2F57 to #46608A, a bright moon above the veil), white text still AA.
// V13_SHOTS=<dir> writes the full-page 390 shots. All data is invented.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const NIGHT = '2026-10-31T00:30:00+08:00'
const DAY = '2026-10-31T12:00:00+08:00'

async function open(page: Page, at: string) {
  await page.clock.setFixedTime(at)
  await skipOnboarding(page)
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(at), temp: 26, humidity: 70, feels: 27, code: 1, hourlyProb: () => 10 }) }))
  await page.goto('/#today')
  await expect(page.getByTestId('weather-hero')).toBeVisible()
  await page.waitForTimeout(500)
}

/** Reads pixels out of a screenshot of the page (CSS px, scale 1). */
async function pixels(page: Page, pts: [number, number][]): Promise<number[][]> {
  const b64 = (await page.screenshot({ animations: 'disabled' })).toString('base64')
  return page.evaluate(async ({ b64, pts }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0)
    return pts.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3)))
  }, { b64, pts })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`Today night ${scheme}: the sky is the board's, the moon is above the veil, white text is AA`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, NIGHT)
    await setScheme(page, scheme)
    const hero = page.getByTestId('weather-hero')
    const scene = hero.locator('.wxs')
    await expect(scene).toHaveAttribute('data-tod', 'night')
    await expect(scene).toHaveAttribute('data-lite', '1')
    expect(await scene.evaluate((el) => getComputedStyle(el).getPropertyValue('--wxs-scrim').trim())).toBe('0.2')
    const moon = hero.locator('.wxs-moon')
    expect(await moon.evaluate((el) => Number(getComputedStyle(el).zIndex))).toBeGreaterThanOrEqual(1)
    const box = (await hero.boundingBox())!
    const mb = (await moon.boundingBox())!
    const [top, bottom, moonPx] = await pixels(page, [[200, Math.round(box.y) + 3], [200, Math.round(box.y + box.height) - 3], [Math.round(mb.x + mb.width / 2), Math.round(mb.y + mb.height / 2)]])
    // the board's #1C2F57 to #46608A, within 25 per channel; the old .64 veil gave #0F1B35 to #1F2E49
    ;[[top, [0x1c, 0x2f, 0x57]], [bottom, [0x46, 0x60, 0x8a]]].forEach(([got, want]) => (got as number[]).forEach((v, i) => expect(Math.abs(v - (want as number[])[i]!), `sky ${got}`).toBeLessThanOrEqual(25)))
    expect(Math.min(...moonPx!), `moon ${moonPx}`).toBeGreaterThanOrEqual(0xc8) // bright, not the old #4E5567
    await assertTextContrast(page)
    if (process.env.V13_SHOTS) await page.screenshot({ path: `${process.env.V13_SHOTS}/today-night-${scheme}.png`, animations: 'disabled' })
  })

  test(`Today day ${scheme}: keeps the full veil, white text is AA`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, DAY)
    await setScheme(page, scheme)
    const scene = page.getByTestId('weather-hero').locator('.wxs')
    await expect(scene).toHaveAttribute('data-tod', 'day')
    await expect(scene).not.toHaveAttribute('data-lite', '1')
    await assertTextContrast(page)
    if (process.env.V13_SHOTS) await page.screenshot({ path: `${process.env.V13_SHOTS}/today-day-${scheme}.png`, animations: 'disabled' })
  })

  test(`Calm ${scheme}: full page shot of the crisis card`, async ({ page }) => {
    test.skip(!process.env.V13_SHOTS, 'shots only')
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, NIGHT)
    await page.goto('/#calm')
    await expect(page.getByTestId('calm-crisis')).toBeVisible()
    await setScheme(page, scheme)
    await page.waitForTimeout(400)
    await fullPageShot(page, `${process.env.V13_SHOTS}/calm-${scheme}.png`)
  })
}
