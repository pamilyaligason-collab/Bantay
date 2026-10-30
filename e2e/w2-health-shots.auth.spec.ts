import { expect, test } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// W2-HEALTH fix round: signed in (auth project, so the viewer can log for themselves), the nudge card shows its one-tap buttons.
// The filename ends in .auth.spec because only that project builds with Supabase env; the empty/partial/done shots stay in w2-health-shots.spec.ts.
const SHOTS = shotPath('docs/session-9/shots/w2-health')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await mock(page)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`nudge buttons and the Add BP sheet, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#health')
    await expect(page.locator('h1')).toHaveText('Health')
    const nudge = page.getByTestId('nudge')
    await expect(nudge).toBeVisible()
    await expect(nudge.getByRole('button', { name: 'Log' })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/health-home-nudge-buttons-${scheme}.png` })
    await nudge.getByRole('button', { name: 'Log' }).click()
    await expect(page.getByLabel('Top')).toBeVisible()
    await expect(page.getByText('Example: 120 on top, 80 on the bottom.')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/health-add-bp-sheet-${scheme}.png` })
  })
}
