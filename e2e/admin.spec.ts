import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

test('onboarding tells members what the admin can see', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Turn on alerts')
  await expect(page.getByText('Your admin can see which screens you use, never your health values.')).toBeVisible()
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
