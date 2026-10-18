import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'

test.describe('android phone', () => {
  test.use({ userAgent: ANDROID })

  test('safety card: android steps only, self-report survives reload', async ({ page }) => {
    await page.goto('/#safety')
    await expect(page.getByText('Phone warnings check')).toBeVisible()
    await expect(page.getByText('Android Earthquake Alerts')).toBeVisible()
    await expect(page.getByText('Government Alerts')).toHaveCount(0)
    await expect(page.getByText('Not checked')).toBeVisible()
    await page.getByRole('button', { name: 'Done on this phone' }).first().click()
    await expect(page.getByText('1 to check')).toBeVisible()
    await page.getByRole('button', { name: 'Done on this phone' }).nth(1).click()
    await expect(page.getByText('All on')).toBeVisible()
    await page.reload()
    await expect(page.getByText('All on')).toBeVisible()
  })

  for (const [w, h] of [[375, 812], [320, 640]] as const) {
    test(`no sideways scroll at ${w}px, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/#safety')
      await expect(page.getByText('Phone warnings check')).toBeVisible()
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
      expect(await page.evaluate(() => { const e = document.querySelector('.pw')!; return e.scrollWidth <= e.clientWidth })).toBe(true)
      expect((await new AxeBuilder({ page }).include('.pw').analyze()).violations.map((v) => v.id)).toEqual([])
    })
  }
})

test('the setup wizard has the phone warnings step, and it can be passed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /: Your phone's warnings$/ }).click()
  await expect(page.locator('h1')).toHaveText("Your phone's warnings")
  await expect(page.getByText('Phone warnings check')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('h1')).toHaveText('SOS text contacts')
})
