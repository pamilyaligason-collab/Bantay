import { expect, test } from '@playwright/test'
import { openChat, skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// S10 JACK-CLIENT shots (390x844, light and dark): ask-emergency (local 911 card, nothing leaves the phone) and ask-offline (what still works, the question kept).
// Run with PW_PORT=5457: PW_PORT=5457 npx playwright test e2e/jack-gate.spec.ts
const SHOTS = shotPath('docs/session-10/shots/S10')

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ colorScheme: scheme })
    })

    test('ask-emergency: the 911 card shows on this phone and no request leaves it', async ({ page }) => {
      const sent: string[] = []
      page.on('request', (r) => { if (r.method() === 'POST') sent.push(r.url()) })
      await page.goto('/')
      await openChat(page)
      await page.getByLabel('Your question').fill('masakit dibdib ko tapos hirap huminga')
      await page.getByRole('button', { name: 'Send' }).click()
      const card = page.getByRole('alert')
      await expect(card).toContainText('This may be an emergency')
      await expect(card).toContainText('Chest pain needs help now')
      await expect(card.getByRole('button', { name: 'Call 911' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Tell my family (SOS)' })).toBeVisible()
      expect(sent).toEqual([])
      await page.screenshot({ path: `${SHOTS}/ask-emergency-${scheme}.png` })
    })

    test('ask-offline: says so, lists what still works, keeps the question; an emergency still gets the card', async ({ page, context }) => {
      await page.goto('/')
      await openChat(page)
      await context.setOffline(true)
      await expect(page.getByText('Jack needs the internet. You are offline.')).toBeVisible()
      await expect(page.getByPlaceholder('Jack is waiting for signal')).toBeVisible()
      await page.getByLabel('Your question').fill('what is hba1c')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(page.getByText('Waiting for signal')).toBeVisible()
      for (const n of ['First aid', 'Medical ID', 'Call 911']) await expect(page.getByRole('button', { name: new RegExp(n) })).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/ask-offline-${scheme}.png` })
      await page.getByLabel('Your question').fill('hindi makahinga si nanay')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(page.getByRole('alert')).toContainText('Trouble breathing needs help now')
    })
  })
}
