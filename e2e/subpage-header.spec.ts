import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

// A-05: a sub-page hides the avatar/bell top bar, so it must draw its own way back.
const SUB = ['#weather', '#medid', '#gobag', '#safety/dial', '#safety/warnings', '#safety/hazards', '#safety/storms', '#safety/cards', '#safety/sources',
  '#health/meds', '#health/visits', '#health/summary', '#health/papers', '#health/refill', '#health/library', '#health/body']

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }))
})

for (const h of SUB) {
  test(`${h}: no top bar, a Back control`, async ({ page }) => {
    await page.goto(`/${h}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('.sh-top')).toHaveCount(0)
    await expect(page.locator('a[aria-label^="Back"], button[aria-label^="Back"]').first()).toBeVisible()
  })
}

// S16: #health/videos moved to #discover/watch, a Discover sub-tab root: it keeps the top bar (App.tsx) and draws its own Back to Discover under it.
test('#health/videos lands on Discover > Watch with a Back control', async ({ page }) => {
  await page.goto('/#health/videos')
  await expect(page).toHaveURL(/#discover\/watch$/)
  await expect(page.getByTestId('watch')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Discover' })).toBeVisible()
})
