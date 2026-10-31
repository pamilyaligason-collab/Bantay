import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Phase 1 lane S. Local helpers until F0-D's e2e/v13.ts lands, then swap these for its imports.
test.use({ viewport: { width: 390, height: 844 } })

export const targets44 = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, button, input, [role=switch]')]
  .map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44)).map(({ e }) => e.outerHTML.slice(0, 80)))
export const noSideways = (page: Page) => page.evaluate(() => { const s = document.querySelector('.bt .scroll'); return !s || s.scrollWidth <= s.clientWidth })
export const oneHero = (page: Page) => page.locator('[data-hero]').count()

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
})

for (const h of ['#safety/firstaid', '#safety/firstaid/cpr', '#safety/world', '#safety/offline', '#safety/alerts']) {
  test(`${h}: renders main and a way back or the Near me | World switch`, async ({ page }) => {
    await page.goto(`/${h}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('a[aria-label^="Back"], [role=group][aria-label="Show"]').first()).toBeVisible()
  })
}
