import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { full } from './fixtures/s16/family'
import { assertTargets, assertTextContrast, assertNoWrappedButtons, setScheme } from './v13'

// v13 lane F moved the root checks to e2e/v13-family.auth.spec.ts. Kept here: the week calendar (now on #family/calendar, D-152), the Papers redirect, no wrapped buttons.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    })
    const go = async (page: Page) => { await full(page); await setScheme(page, scheme) }

    test('Calendar page holds the week calendar; Week and Month switch; targets and contrast', async ({ page }) => {
      await go(page)
      await page.goto('/#family/calendar')
      const cal = page.getByTestId('calendar')
      await expect(cal.getByRole('group', { name: 'Days of this week' })).toBeVisible() // week is the default
      await expect(cal.getByText('School program')).toBeVisible()
      await cal.getByRole('button', { name: 'Month' }).click()
      await expect(cal.getByRole('group', { name: /days$/ })).toBeVisible()
      await cal.getByRole('button', { name: 'Week' }).click()
      await assertTargets(page); await assertTextContrast(page)
    })

    test('Papers lives at #family/papers', async ({ page }) => {
      await go(page)
      await page.goto('/#records')
      await expect(page).toHaveURL(/#family\/papers$/)
      await expect(page.locator('h1')).toHaveText('Papers')
      await expect(page.getByText('Read by Bantay, checked by a person')).toBeVisible()
    })

    test('no button wraps at 360', async ({ page }) => {
      await go(page)
      await page.setViewportSize({ width: 360, height: 740 })
      await assertNoWrappedButtons(page)
    })
  })
}
