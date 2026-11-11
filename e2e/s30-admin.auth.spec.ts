import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { assertTargets, assertTextContrast, assertJackClear, setScheme } from './v13'
import { admin, member, NAME } from './fixtures/s16/settings'

// S30 L4: the Admin dashboard row in Settings. Admins see it and it opens the web admin members page; members do not.
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S30_SHOTS ?? 'docs/s30/shots/L4'

for (const scheme of ['light', 'dark'] as const) {
  test(`admin sees the Admin dashboard row, straight to members (${scheme})`, async ({ page }) => {
    await admin(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#me')
    await setScheme(page, scheme)
    await expect(page.locator('.st-account b')).toHaveText(NAME)
    const row = page.getByTestId('admin-dashboard-row')
    await expect(row).toHaveAttribute('href', '/admin#/members')
    await expect(row).toContainText('Add, edit or remove members')
    expect(await page.locator('.st-list .st-row b').first().textContent()).toBe('Family admin tools') // the existing first row stays first
    expect(await page.locator('.st-overview .sh-sub').evaluateAll((els) => els.filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent))).toEqual([]) // every sub is one line
    await assertTargets(page); await assertTextContrast(page); await assertJackClear(page)
    if (process.env.S30_SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/settings-admin-${scheme}.png` }) }
  })
}

test('a member does not see the Admin dashboard row', async ({ page }) => {
  await member(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#me')
  await expect(page.locator('.st-account b')).toHaveText(NAME)
  await expect(page.getByTestId('admin-dashboard-row')).toHaveCount(0)
  await expect(page.getByText('Admin dashboard')).toHaveCount(0)
})
