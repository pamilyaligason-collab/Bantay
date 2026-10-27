import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// S6a shots of the static Get Bantay page (public/get): start-get (Android) and start-iphone, 390x844, light and dark.
// start-invite is a Messenger chat outside the app and start-dependent is the Family person page (S4/S7), so neither has a shot here.
const SHOTS = 'docs/session-10/shots/S6a'

for (const scheme of ['light', 'dark'] as const) {
  test(`get page: start-get and start-iphone, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/get/')
    await expect(page.getByRole('heading', { name: 'Get the Bantay app' })).toBeVisible()
    await expect(page.getByText('Next: the invite link.')).toBeVisible()
    await expect(page.getByRole('link', { name: /^Download Bantay/ })).toBeVisible() // /latest.json is served by the build
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/start-get-${scheme}.png`, fullPage: true })

    await page.getByRole('button', { name: 'On an iPhone? See the iPhone steps' }).click()
    await expect(page.getByRole('heading', { name: 'Bantay on iPhone stays a web app' })).toBeVisible()
    await expect(page.getByText(/Face ID or Touch ID through a passkey/)).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/start-iphone-${scheme}.png`, fullPage: true })
  })
}
