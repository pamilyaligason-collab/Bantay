import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

test('setup tells members what the admin can see', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#me/phone') // the setup card moved to Settings > Phone (S16)
  await page.getByRole('button', { name: /^Next: / }).click() // since S6a first launch is start-done; the setup steps open from the setup card on Me
  await page.getByRole('button', { name: /: Sharing$/ }).click()
  await expect(page.getByRole('dialog', { name: 'Finish setting up' }).locator('h1')).toHaveText('Sharing')
  await expect(page.getByText(/Your records stay private until you or a family admin share them and the person accepts\. Family admins can see them\./)).toBeVisible() // CONSENT_LINE (D-86)
})

test('app still opens normally without an admin session', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Today')
  // no admin entry point is shown to a normal member
  await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0)
})

// #admin is shown only when getMember().role === 'admin'. Unconfigured or non-admin: the normal app, never the admin screen.
test('#admin is not reachable without an admin session', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#admin')
  await expect(page.locator('h1')).toHaveText('Today')
  await expect(page.getByRole('heading', { name: 'Safety broadcast' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)
})
