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

// Runs once the orchestrator wires #admin in App.tsx (see the lane A3 report). Enable with ADMIN_WIRED=1.
// The build has no Supabase env, so the screen must show its clear "Not connected yet" state and never throw.
test('wired #admin shows Not connected yet when unconfigured', async ({ page }) => {
  test.skip(process.env.ADMIN_WIRED !== '1', 'needs the #admin route wired in App.tsx')
  await page.route('**/functions/v1/admin-members', (r) => r.fulfill({ json: { ok: true, members: [] } }))
  await skipOnboarding(page)
  await page.goto('/#admin')
  await expect(page.locator('h1')).toHaveText('Admin')
  await expect(page.getByText(/Not connected yet/).first()).toBeVisible()
  for (const t of ['Members', 'Usage', 'Safety data', 'Safety broadcast', 'Import status', 'System health']) await expect(page.getByRole('heading', { name: t })).toBeVisible()
})
