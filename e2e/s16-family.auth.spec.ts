import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { emptyNeeds, full } from './fixtures/s16/family'
import { assertBudget, assertJackClear, assertNoWrappedButtons, setScheme } from './s16'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = process.env.S16_SHOTS // shots only when set, so a gate rerun leaves the tree clean (ML-32)

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    })
    const go = async (page: Page, fixture: (p: Page) => Promise<void>) => { await fixture(page); await setScheme(page, scheme) }

    test('family root: ID card, faces with rings and legend, Messages and Plan rows, week calendar, within budget', async ({ page }) => {
      await go(page, full)
      await expect(page.getByTestId('profilecard')).toBeVisible()
      await expect(page.getByText('Needs you now')).toBeVisible()
      await expect(page.getByText(/missed a medicine/)).toBeVisible()
      const order = await page.locator('[data-testid="profilecard"], .fm-sech, [data-testid="face-ring"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? 'needs'))
      expect(order[0]).toBe('profilecard') // Needs you now is the second block, under the ID card and above the faces
      expect(order[1]).toBe('needs')
      const rings = page.getByTestId('face-ring')
      await expect(rings.first()).toBeVisible()
      expect(await rings.evaluateAll((els) => els.map((e) => e.getAttribute('data-k')).sort())).toEqual(['none', 'none', 'ok', 'ok'])
      await expect(page.getByLabel('Legend')).toContainText('Needs a look')
      await expect(page.getByTestId('msgs')).toBeVisible()
      await expect(page.getByTestId('planrow')).toContainText('0 of 1 done today')
      const cal = page.getByTestId('calendar')
      await expect(cal.getByRole('group', { name: 'Days of this week' })).toBeVisible() // week is the default
      await expect(cal.getByText('School program')).toBeVisible()
      await cal.getByRole('button', { name: 'Month' }).click()
      await expect(cal.getByRole('group', { name: /days$/ })).toBeVisible()
      await cal.getByRole('button', { name: 'Week' }).click()
      await assertBudget(page, 1650)
      await assertJackClear(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      if (SHOTS) {
        await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = 0 })
        await page.screenshot({ path: `docs/session-16/shots/L4/family-${scheme}.png` })
        await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = el.scrollHeight })
        await page.screenshot({ path: `docs/session-16/shots/L4/family-end-${scheme}.png` })
      }
    })

    test('empty needs: Needs you now is not drawn at all, within the 1500 budget', async ({ page }) => {
      await go(page, emptyNeeds)
      await expect(page.getByTestId('profilecard')).toBeVisible()
      await expect(page.getByRole('button', { name: /^Papa Ben, OK / })).toBeVisible()
      await expect(page.getByText('Needs you now')).toHaveCount(0)
      await expect(page.getByTestId('msgs')).toBeVisible()
      await assertBudget(page, 1500)
      await assertJackClear(page)
    })

    test('a face sheet offers Send a message and the chat opens with @name ready; Papers lives at #family/papers', async ({ page }) => {
      await go(page, emptyNeeds)
      await page.getByRole('button', { name: /^Papa Ben, OK / }).click()
      await page.getByRole('link', { name: 'Send a message' }).click()
      await expect(page).toHaveURL(/#family\/messages$/)
      await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('@Papa ')
      await page.goto('/#records')
      await expect(page).toHaveURL(/#family\/papers$/)
      await expect(page.locator('h1')).toHaveText('Papers')
      await expect(page.getByText('Read by Bantay, checked by a person')).toBeVisible()
    })

    test('no button wraps at 360', async ({ page }) => {
      await go(page, full)
      await page.setViewportSize({ width: 360, height: 740 })
      await assertNoWrappedButtons(page)
    })
  })
}
