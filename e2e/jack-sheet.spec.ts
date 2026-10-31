import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ page }) => { await skipOnboarding(page); await page.goto('/#today') })
test('tap Jack: the sheet opens with Help, Scan, Chat; Back closes it; Today has no SOS block', async ({ page }) => {
  await expect(page.locator('.td-sos')).toHaveCount(0)
  await page.getByTestId('jack').click()
  const sheet = page.getByRole('dialog', { name: 'Jack' })
  await expect(sheet).toBeVisible()
  for (const id of ['jack-sos', 'jack-scan', 'jack-chat', 'jack-safety', 'jack-close']) {
    const box = (await page.getByTestId(id).boundingBox())!; expect(box.height, id).toBeGreaterThanOrEqual(44)
  }
  await page.goBack(); await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jack')).toBeFocused()
})
test('Chat opens the assistant; Escape closes the sheet; a 3 s hold opens the SOS screen', async ({ page }) => {
  await page.getByTestId('jack').click(); await page.getByTestId('jack-chat').click()
  await expect(page.getByRole('dialog', { name: /Jack Jack|Ask/ })).toBeVisible()
  await page.keyboard.press('Escape'); await page.getByTestId('jack').click()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
  await page.getByTestId('jack').click()
  const hold = page.getByTestId('jack-sos').locator('.sos-simple-btn')
  await hold.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true }); await page.waitForTimeout(3100)
  await expect(page.getByTestId('sos-full')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
})
test('reduced motion: the sheet still opens and closes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByTestId('jack').click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toBeVisible(); await page.getByTestId('jack-close').click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
})
