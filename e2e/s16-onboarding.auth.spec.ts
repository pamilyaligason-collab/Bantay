import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { assertBudget, assertNoWrappedButtons, setScheme } from './s16'
import { deniedTwice, noMeds, signInMama } from './fixtures/s16/onboarding'

// S16 L8: onboarding screens 3 to 5 after the first sign-in (390x844, budget 700 each, D-102). Screens 1 and 2 are covered by s12-join.auth and s6a-onboard-shots.auth.
// Filename ends in .auth.spec: only that project builds with Supabase env. Shots are written only when S16_SHOTS is set (ML-32).
const SHOTS = 'docs/session-16/shots/L8'
const shot = async (page: Page, name: string, scheme: string) => { if (process.env.S16_SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) }
const BUDGET = 700

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }) })

for (const scheme of ['light', 'dark'] as const) {
  test(`screens 3, 4 and 5 fit one screen, no wrapped buttons, ${scheme}`, async ({ page }) => {
    await noMeds(page)
    await setScheme(page, scheme)
    await signInMama(page)
    await expect(page.getByRole('heading', { name: 'Medicine reminders' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Step 3 of 5' })).toBeVisible()
    await expect(page.getByText('No medicines yet. Your carer can add them.')).toBeVisible()
    await assertBudget(page, BUDGET); await assertNoWrappedButtons(page)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await shot(page, 'onboard-3', scheme)
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(page.getByRole('heading', { name: 'Where are you most days?' })).toBeVisible()
    await assertBudget(page, BUDGET); await assertNoWrappedButtons(page)
    await shot(page, 'onboard-4', scheme)
    await page.getByRole('button', { name: 'Dampas, Tagbilaran' }).click()
    await expect(page.getByRole('heading', { name: "Let's test it." })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn on reminders first' })).toBeVisible() // screen 3 was skipped
    await assertBudget(page, BUDGET); await assertNoWrappedButtons(page)
    await shot(page, 'onboard-5', scheme)
    await page.getByRole('button', { name: 'Turn on reminders first' }).click()
    await expect(page.getByRole('heading', { name: 'Medicine reminders' })).toBeVisible()
  })
}

test('after two refusals the button opens the app settings', async ({ page }) => {
  await noMeds(page)
  await signInMama(page)
  await expect(page.getByRole('heading', { name: 'Medicine reminders' })).toBeVisible()
  await deniedTwice(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Open app settings' })).toBeVisible()
  await expect(page.getByText('Android needs you to allow notifications there.')).toBeVisible()
  await assertNoWrappedButtons(page)
})

test.describe('reminders allowed', () => {
  test.use({ permissions: ['notifications'] })
  test('the test reminder rings in 5 seconds, the check draws, Open Today lands on Today', async ({ page }) => {
    // Headless Chromium grants the permission but still reports Notification.permission as "denied", which the web plugin reads.
    await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'granted' }))
    await noMeds(page)
    await signInMama(page)
    await page.getByRole('button', { name: 'Skip' }).click()
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(page.getByRole('heading', { name: "Let's test it." })).toBeVisible()
    await page.getByRole('button', { name: 'Send a test reminder' }).click()
    await expect(page.getByRole('heading', { name: "It works. You're set, Mama." })).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText(/Change this in Settings > Family and sharing\./)).toBeVisible()
    await expect(page.locator('img.jack')).toHaveCount(0) // success is the check alone (D-103)
    await page.getByRole('button', { name: 'Open Today' }).click()
    await expect(page.locator('h1')).toHaveText('Today')
  })
})
