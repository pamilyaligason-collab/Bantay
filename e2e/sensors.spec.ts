import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

test.describe('movement on Today (web, no step counter)', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Log a walk' }).click() // the Walk button in the quick-log row opens a sheet
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

test('Family shows the phone health explainer on the web', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#family')
  await expect(page.getByRole('heading', { name: 'Phone health data' })).toBeVisible()
  await expect(page.getByText(/need the Bantay app/)).toBeVisible()
})
