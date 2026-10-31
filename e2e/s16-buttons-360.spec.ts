import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertNoWrappedButtons, ROUTES } from './s16'

// S16 L-6 gate: no `.btn` wraps to a second line at 360 px, on every route in the IA map (contracts.md C-3).
test.use({ viewport: { width: 360, height: 740 }, serviceWorkers: 'block' })

for (const route of ROUTES) {
  test(`${route}: no button wraps at 360`, async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/' + route)
    await expect(page.locator('.bt .scroll')).toBeVisible()
    await expect(page.locator('h1').first()).toBeVisible() // every screen, redirected or not, draws its own heading
    await assertNoWrappedButtons(page)
  })
}
