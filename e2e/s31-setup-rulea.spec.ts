import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackClear, assertNoSideways, assertTargets, settled } from './v13'

// S31 L1 round 2: Rule A (D-184) for #setup/all at the four sizes. Jack is not on this screen (it has its own header, off the five tabs), so there is nothing to
// overlap; the checks prove that, that no control is under where he would sit, no sideways scroll, and 44 px targets at rest and at the end.
// Runs in the chromium project (no sign-in).
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 780 }, { width: 360, height: 740 }, { width: 390, height: 720 }]

for (const size of SIZES) {
  test.describe(`#setup/all Rule A ${size.width}x${size.height}`, () => {
    test.use({ viewport: size })
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.route('**/medlib/**', (r) => r.abort())
    })
    test('Jack hidden, no control under his corner at rest or at the end, no sideways scroll, 44 px targets', async ({ page }) => {
      await page.goto('/#setup/all')
      await settled(page)
      await expect(page.getByTestId('setup-all')).toBeVisible()
      await expect(page.getByTestId('jack')).toHaveCount(0)
      await assertJackClear(page)
      await assertNoSideways(page)
      await assertTargets(page, { skip: '.sa a' })
    })
  })
}
