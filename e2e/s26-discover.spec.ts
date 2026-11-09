import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertNoSideways, assertOrder, FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S26 lane L3: the Discover Today order, the Top stories block, the Channel menu and the video cards (board S26Discover).
// Shots only with S26_SHOTS=<dir>; nothing is written without it.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 })) // deterministic, nothing third-party leaves the test
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-fact')).toBeVisible()
  await expect(page.getByTestId('dc-hero')).toBeVisible() // Top stories show once the day's order is read
})

async function shots(page: import('@playwright/test').Page, name: string) {
  const dir = process.env.S26_SHOTS
  if (!dir) return
  for (const s of ['light', 'dark'] as const) {
    await setScheme(page, s)
    for (const id of ['dc-top-story', 'dc-farm']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded()
      await page.getByTestId(id).screenshot({ path: `${dir}/${name}-${id}-${s}.png`, animations: 'disabled' })
    }
  }
}

test('order: Learn, Top stories (hero first), Listen, Farming and DIY, then the rest', async ({ page }) => {
  await assertOrder(page, ['dc-learn', 'dc-top-story', 'dc-hero', 'dc-listen', 'dc-farm', 'dc-health-link', 'dc-recipes', 'dc-play', 'dc-fact'])
})

test('Top stories: a hero and four rows with Show more; every video card has a play circle and a "Video, ..." name; the cards are raised with no border', async ({ page }) => {
  await expect(page.getByTestId('dc-top-rows').locator('a.md-row')).toHaveCount(4)
  await expect(page.getByTestId('dc-top-story').locator('a.md-hero')).toHaveCount(1)
  const m = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('a.md'))
    const hero = document.querySelector<HTMLElement>('[data-hero]')!
    const cs = getComputedStyle(cards[1]!)
    return {
      n: cards.length,
      noPlay: cards.filter((c) => { const p = c.querySelector('.md-play'); if (!p) return true; const r = p.getBoundingClientRect(); return r.width < 36 || r.height < 36 }).length,
      badName: cards.filter((c) => !/^Video, /.test(c.getAttribute('aria-label') ?? '')).length,
      heroName: hero.getAttribute('aria-label'),
      raised: cs.boxShadow !== 'none' && cs.borderTopWidth === '0px'
    }
  })
  expect(m.n).toBeGreaterThanOrEqual(10)
  expect(m.noPlay).toBe(0)
  expect(m.badName).toBe(0)
  expect(m.heroName).toMatch(/^Video, /)
  expect(m.raised).toBe(true)
  await shots(page, '390')
})

test('Farming and DIY: a labelled Channel menu (48 px), 4 cards and Show 4 more; a channel narrows the list; no chips', async ({ page }) => {
  const farm = page.getByTestId('dc-farm')
  const sel = farm.getByLabel('Channel')
  await expect(sel).toBeVisible()
  const box = await sel.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(47.5)
  await expect(farm.locator('.md-flag')).toHaveCount(0) // "Most watched" only after this phone has tapped a video
  await expect(farm.getByTestId('dc-farm-row').locator('a.md')).toHaveCount(4)
  await sel.selectOption('Agri-nihan')
  await expect(farm.locator('a.md')).toHaveCount(4)
  await sel.selectOption('')
  await farm.getByRole('button', { name: 'Show 4 more' }).click()
  await expect(farm.getByTestId('dc-farm-row').locator('a.md')).toHaveCount(8)
})

test('a Discover card tap opens Watch and focus lands on the player', async ({ page }) => {
  await page.getByTestId('dc-farm').locator('a.md').first().click()
  await expect(page).toHaveURL(/#discover\/watch/)
  await expect(page.getByTestId('watch-player').getByRole('button', { name: /^Play / })).toBeFocused()
})

test('dark theme at 390 and a 195 px wide screen: no sideways scroll, cards stay inside', async ({ page }) => {
  await setScheme(page, 'dark')
  await assertNoSideways(page)
  await page.setViewportSize({ width: 195, height: 800 })
  await page.reload()
  await expect(page.getByTestId('dc-fact')).toBeVisible()
  await assertNoSideways(page)
  const out = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a.md')).filter((a) => a.getBoundingClientRect().right > innerWidth + 0.5).length)
  expect(out, 'cards past the right edge').toBe(0)
  await shots(page, '195')
})
