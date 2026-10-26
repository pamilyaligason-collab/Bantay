import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

test.describe('movement on Today (web, no step counter)', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'More things to log' }).click() // Walk is behind More in the quick-log row
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Walk' }).click()
    await expect(page.getByRole('heading', { name: 'Did you walk today?' })).toBeVisible()
  })

  // The e2e build has no Supabase env, so nobody is signed in (D-21). Logging while signed in is covered by the QuickWalk unit tests.
  test('signed out: a tap logs nothing and says to sign in', async ({ page }) => {
    await page.getByRole('button', { name: '20 min' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Sign in to log a walk.' })).toBeVisible()
  })

  test('signed out: custom minutes log nothing either', async ({ page }) => {
    await page.getByLabel('Other number of minutes').fill('35')
    await page.getByRole('button', { name: 'Log', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Sign in to log a walk.' })).toBeVisible()
  })

  test('Today has no serious accessibility violations with the walk sheet open', async ({ page }) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  })
})

test('Me shows the phone health explainer on the web', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#me') // round 3: phone health data moved from Family to Me
  await expect(page.getByRole('heading', { name: 'Phone health data' })).toBeVisible()
  await expect(page.getByText(/need the Bantay app/)).toBeVisible()
})
