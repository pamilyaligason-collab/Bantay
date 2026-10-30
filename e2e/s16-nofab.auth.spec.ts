import { expect, test } from '@playwright/test'
import { startToday } from './fixtures/s16/today'

// S16 D-91: the floating Jack button is absent while a storm or quake warning is on Today, present on a calm Today.
// The real path: the alert is served as a safety_alerts row, WarningCard marks data-nofab, JackFab reads it. Closing the warning must bring the button back,
// which also proves the button is gated by the warning and not merely still loading when we look (ML-25).
test.use({ timezoneId: 'Asia/Manila' })

test('calm Today shows the Jack button', async ({ page }) => {
  await startToday(page, 'calm')
  await expect(page.locator('.sh-jackfab')).toHaveCount(1)
  await expect(page.locator('[data-nofab]')).toHaveCount(0)
})

test('a quake warning hides the Jack button; hiding the warning brings it back', async ({ page }) => {
  await startToday(page, 'quake')
  await expect(page.locator('[data-nofab]')).toHaveCount(1)
  await expect(page.locator('.sh-jackfab')).toHaveCount(0)
  await page.getByRole('button', { name: /Hide this warning/ }).click()
  await expect(page.getByRole('region', { name: 'Active warning' })).toHaveCount(0)
  await expect(page.locator('.sh-jackfab')).toHaveCount(1)
})

test('a storm warning hides the Jack button; hiding the warning brings it back', async ({ page }) => {
  await startToday(page, 'storm')
  await expect(page.locator('[data-nofab]')).toHaveCount(1)
  await expect(page.locator('.sh-jackfab')).toHaveCount(0)
  await page.getByRole('region', { name: 'Storm mode' }).getByRole('button', { name: /Hide this warning/ }).click()
  await expect(page.getByRole('region', { name: 'Storm mode' })).toHaveCount(0)
  await expect(page.locator('.sh-jackfab')).toHaveCount(1)
})
