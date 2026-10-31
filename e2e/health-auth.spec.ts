import { expect, test } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> }

// Runs in the "auth" project (build WITH test Supabase env). Signed in as a made-up member; PostgREST is mocked; all data is invented.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await mock(page)
})

test('signed in: Health has no Papers door (D-100) and the old Papers link lands under Family', async ({ page }) => {
  await page.goto('/#health')
  await expect(page.locator('h1')).toHaveText('Health')
  await expect(page.getByTestId('browse')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Papers/ })).toHaveCount(0)
  await page.goto('/#health/papers')
  await expect(page).toHaveURL(/#family\/papers$/)
})

test('signed in: Add reading previews the colour and line, and the reading lands in the chart list', async ({ page }) => {
  await page.goto('/#health/metric/bp_systolic')
  await page.getByRole('button', { name: 'Add reading' }).click()
  await page.getByLabel('Top').fill('138')
  await page.getByLabel('Bottom').fill('86')
  await expect(page.getByTestId('reading-preview')).toHaveAttribute('data-state', 'above')
  await expect(page.getByTestId('reading-preview')).toContainText('Rest for 5 minutes')
  if (process.env.M7A_SHOTS) await page.screenshot({ path: `${process.env.M7A_SHOTS}/add-reading-light.png` })
  await page.getByRole('button', { name: 'Save reading' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toBeVisible()
  await expect(page.getByTestId('recent')).toContainText('138')
  await expect(page.getByTestId('metric-chart')).toBeVisible()
})
