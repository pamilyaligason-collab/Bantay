import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S16 L7: every Old -> New route of PLAN section 2 (routes.ts REDIRECT). A bookmarked or pushed link must still land on the screen that holds it now.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

const MOVED: { old: string; to: RegExp; h1: string }[] = [
  { old: '#records', to: /#family\/papers$/, h1: 'Papers' },
  { old: '#family/records', to: /#family\/papers$/, h1: 'Papers' },
  { old: '#health/papers', to: /#family\/papers$/, h1: 'Papers' },
  { old: '#health/library', to: /#discover\/learn\/library$/, h1: 'Health library' },
  { old: '#health/videos', to: /#discover\/watch$/, h1: 'Watch' },
  { old: '#family/people', to: /#family$/, h1: 'Family' },
  { old: '#people', to: /#family$/, h1: 'Family' }
]

test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

for (const m of MOVED) {
  test(`${m.old} lands on its new screen`, async ({ page }) => {
    await page.goto('/' + m.old)
    await expect(page).toHaveURL(m.to)
    await expect(page.getByRole('heading', { level: 1, name: m.h1 })).toBeVisible()
  })
}

test('#health/library/<key> keeps its key on the way to Discover > Learn', async ({ page }) => {
  await page.goto('/#health/library/hypertension')
  await expect(page).toHaveURL(/#discover\/learn\/library\/hypertension$/)
  await expect(page.locator('main')).toBeVisible()
})

test('the redirect replaces the history entry, so Back does not return to the old hash', async ({ page }) => {
  await page.goto('/#today')
  await page.evaluate(() => { location.hash = '#records' })
  await expect(page).toHaveURL(/#family\/papers$/)
  await page.goBack()
  await expect(page).toHaveURL(/#today$/)
})

test('#family/people/<id> is a member page and is not redirected', async ({ page }) => {
  await page.goto('/#family/people/someone')
  await expect(page).toHaveURL(/#family\/people\/someone$/)
})

test('#me and #me/<group> stay where they are', async ({ page }) => {
  for (const h of ['#me', '#me/alerts', '#me/family', '#me/phone']) {
    await page.goto('/' + h)
    await expect(page).toHaveURL(new RegExp(h.replace('/', '\\/') + '$'))
    await expect(page.locator('main')).toBeVisible()
  }
})
