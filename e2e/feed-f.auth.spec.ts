import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { mockFamily, NOW } from './fixtures/s16/family'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
// Lane F (D-134): the feed screen and the Health family card with posts from the server list. Invented people only. Shots only when FEED_SHOTS names a folder (outside the repo), so a gate rerun leaves the tree clean.
const SHOTS = process.env.FEED_SHOTS
const at = (h: number, m: number) => new Date(2026, 9, 27, h, m, 0).toISOString()
const FEED = [
  { kind: 'bp', person_id: 'ma', at: at(7, 0), title_key: 'feed.bp', value_text: '148/90 mmHg', chip: null, photo_path: null, row_id: 'r1' },
  { kind: 'lab', person_id: 'pa', at: at(6, 10), title_key: 'feed.lab', value_text: 'Cholesterol 210 mg/dL', chip: 'H', photo_path: null, row_id: 'l1' },
  { kind: 'status', person_id: 'lo', at: at(5, 40), title_key: 'feed.status', value_text: null, chip: null, photo_path: null, row_id: 's1' },
  { kind: 'photo', person_id: 'ma', at: at(5, 0), title_key: 'feed.photo', value_text: 'Sunday lunch', chip: null, photo_path: 'ma/1.jpg', row_id: 'p1' }
]
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const scheme of ['light', 'dark'] as const) {
  for (const [w, h] of [[390, 844], [450, 949]] as const) {
    test.describe(`${scheme} ${w}`, () => {
      test.use({ viewport: { width: w, height: h }, colorScheme: scheme })
      test.beforeEach(async ({ page }) => {
        await skipOnboarding(page)
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await mockFamily(page)
        await page.route('**/rpc/family_feed', (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(FEED) }))
        await page.addInitScript(() => localStorage.setItem('bantay.flag.feed', '1'))
        await page.clock.setFixedTime(NOW)
      })

      test('feed screen lists the four kinds, with the filters', async ({ page }) => {
        await page.goto('/#family/feed')
        await expect(page.locator('h1')).toHaveText('Family feed')
        const list = page.getByRole('list', { name: 'Family feed' })
        await expect(list.locator('li')).toHaveCount(4)
        await expect(list).toContainText('148/90 mmHg')
        await expect(list).toContainText('Cholesterol 210 mg/dL')
        await expect(list).toContainText('Sunday lunch')
        const show = page.getByRole('group', { name: 'Show' })
        await show.getByRole('button', { name: 'Health' }).click()
        await expect(list.locator('li')).toHaveCount(2)
        await show.getByRole('button', { name: 'Check-ins' }).click()
        await expect(list.locator('li')).toHaveCount(1)
        await show.getByRole('button', { name: 'All', exact: true }).click()
        expect(await noSideways(page)).toBe(true)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/feed-${scheme}-${w}.png` })
      })

      test('Health family card shows the two newest posts and All updates opens the feed', async ({ page }) => {
        await page.goto('/#health')
        const card = page.getByTestId('family-health')
        await card.scrollIntoViewIfNeeded()
        await expect(card).toContainText('148/90 mmHg')
        await expect(card).toContainText('Cholesterol 210 mg/dL')
        await expect(card).not.toContainText('Sunday lunch') // only two posts
        await expect(card.getByRole('link', { name: 'All updates' })).toHaveAttribute('href', '#family/feed')
        expect(await noSideways(page)).toBe(true)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/health-card-${scheme}-${w}.png` })
      })
    })
  }
}
