import { expect, test } from '@playwright/test'
import { assertJackClear, assertTargets } from './v13'
import { startToday, type Variant } from './fixtures/s16/today'

test.use({ timezoneId: 'Asia/Manila' })

// D-143 + release review: with the Family map on by default, the one-time place notice shows on Today, but never above a warning (D-50 spirit), and Jack stays clear.
for (const variant of ['calm', 'quake', 'storm'] as Variant[]) {
  test(`${variant}: the place notice sits below any warning, targets hold, Jack clear`, async ({ page }) => {
    await startToday(page, variant, { places: true })
    const notice = page.getByTestId('place-notice')
    await expect(notice).toBeVisible()
    const order = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).filter((i) => ['weather-hero', 'warning-card', 'warning-card-storm', 'place-notice'].includes(i ?? '')))
    expect(order.indexOf('place-notice')).toBe(order.length - 1)
    await assertTargets(page)
    await assertJackClear(page, { at: 'end' })
  })
}
