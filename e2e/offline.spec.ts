import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

test('offline bar appears when the phone goes offline and goes when it is back', async ({ page, context }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.getByTestId('offline-bar')).toHaveCount(0)
  await context.setOffline(true)
  const bar = page.getByTestId('offline-bar')
  await expect(bar).toBeVisible()
  await expect(bar).toHaveText(/^Offline · showing data from \d{1,2}:\d{2} (AM|PM) · will sync$/)
  // it is a thin strip, not a wall: the page does not scroll sideways
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide).toBe(0)
  await context.setOffline(false)
  await expect(bar).toHaveCount(0)
})
