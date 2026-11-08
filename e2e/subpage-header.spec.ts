import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

// A-05 / S9: every sub-page draws the v13 Back row over its title (header.lt with one a.lt-back, 44 px tall) and there is no old top bar.
// A route that still draws its own old header is listed with the lane that switches it; its test is fixme until then.
const SUB = ['#weather', '#medid', '#gobag', '#safety/dial', '#safety/warnings', '#safety/hazards', '#safety/storms', '#safety/cards', '#safety/sources',
  '#health/meds', '#health/visits', '#health/summary', '#health/papers', '#health/refill', '#health/library', '#health/body',
  '#family/messages', '#family/plan', '#discover/learn/recipes', '#discover/learn/together', '#discover/learn/library', '#discover/play', '#discover/play/memory', '#discover/play/wordsearch',
  '#me/alerts', '#me/display', '#me/family', '#me/phone', '#me/signin', '#me/about', '#privacy', '#sharing', '#notif']
const OWN_HEADER: Record<string, string> = {}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }))
})

for (const h of SUB) {
  test(`${h}: one v13 Back row, no top bar`, async ({ page }) => {
    test.fixme(!!OWN_HEADER[h], OWN_HEADER[h])
    await page.goto(`/${h}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('.sh-top')).toHaveCount(0)
    await expect(page.locator('header.lt')).toHaveCount(1)
    const back = page.locator('header.lt a.lt-back')
    await expect(back).toHaveCount(1)
    expect((await back.boundingBox())!.height, 'Back is a 44 px target').toBeGreaterThanOrEqual(44)
    const title = (await page.locator('h1.lt-title').innerText()).trim()
    expect(title.length, 'the title is the page name').toBeGreaterThan(0)
    if (h.startsWith('#discover/play/')) expect(title, 'a game is not titled Discover').not.toBe('Discover')
  })
}

// S25: #health/videos is the Health videos section on #health again; Discover > Watch (a sub-tab root) draws its own Back to Discover.
test('#health/videos lands on Health, and Discover > Watch has a Back control', async ({ page }) => {
  await page.goto('/#health/videos')
  await expect(page).toHaveURL(/#health$/)
  await expect(page.getByTestId('health-videos')).toBeAttached()
  await page.goto('/#discover/watch')
  await expect(page.getByTestId('watch')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Discover' })).toBeVisible()
})
