import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertJackClear, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertOrder, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// v13 lane D: the Discover overview per board Discover (video hero, two videos, season, Learn, Listen, Play, fact, News). Geometry helpers come from e2e/v13.ts.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1]) // 31 Oct, Undas
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 })) // deterministic shots, nothing third-party leaves the test
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-news')).toBeVisible()
})

test('header: Discover is the h1 and the kicker is not empty', async ({ page }) => {
  const head = page.getByTestId('dc-head')
  await expect(head.getByRole('heading', { level: 1 })).toHaveText('Discover')
  await expect(head.locator('.lt-kicker')).not.toBeEmpty()
})

test('one hero near the top', async ({ page }) => { await assertHero(page) })

test('order: video, two videos, season, Learn, Listen, Play, fact, News', async ({ page }) => {
  await assertOrder(page, ['dc-hero', 'dc-videos', 'season-row', 'dc-learn', 'dc-listen', 'dc-play', 'dc-fact', 'dc-news'])
})

test('the hero opens Watch and nothing reaches YouTube before a second tap', async ({ page }) => {
  const yt: string[] = []
  page.on('request', (r) => { if (/youtube/.test(r.url())) yt.push(r.url()) })
  const hero = page.getByTestId('dc-hero').getByRole('link')
  await expect(hero).toHaveAttribute('href', '#discover/watch')
  await hero.click()
  await expect(page).toHaveURL(/#discover\/watch$/)
  await expect(page.getByTestId('watch-player')).toBeVisible()
  expect(yt, 'no youtube.com request before a second tap').toEqual([])
})

test('links: All topics, Memory and the fact card land on their screens', async ({ page }) => {
  await page.getByRole('link', { name: 'All topics' }).click()
  await expect(page).toHaveURL(/#discover\/learn$/)
  await expect(page.getByTestId('learn-home')).toBeVisible()
  await page.goto('/#discover')
  await page.getByTestId('dc-play').getByRole('link', { name: /Memory/ }).click()
  await expect(page).toHaveURL(/#discover\/play\/memory$/)
  await expect(page.getByTestId('memory')).toBeVisible()
  await page.goto('/#discover')
  await page.getByTestId('dc-fact').click()
  await expect(page).toHaveURL(/#discover\/play\/facts$/)
  await expect(page.getByTestId('facts')).toBeVisible()
})

test('flag off: no Medicines row', async ({ page }) => {
  await expect(page.getByTestId('dc-learn').getByText('Recipes', { exact: true })).toBeVisible()
  await expect(page.getByText('Medicines')).toHaveCount(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: targets, no sideways scroll, text contrast, Jack clear`, async ({ page }) => {
    await setScheme(page, scheme)
    await assertTargets(page)
    await assertNoSideways(page)
    await assertTextContrast(page)
    await assertJackClear(page)
  })
}

test('195 px (200% text zoom)', async ({ page }) => { await assertNarrow(page) })

test('360 px: targets, no sideways scroll, no wrapped buttons', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await assertTargets(page)
  await assertNoSideways(page)
  await assertNoWrappedButtons(page)
})

test('reduced motion: no infinite animation keeps running', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByTestId('dc-news')).toBeVisible()
  const n = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length)
  expect(n, 'infinite animations running under reduced motion').toBe(0)
})

test('shots (V13_SHOTS)', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS=<dir> to write shots')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByTestId('dc-news')).toBeVisible()
  await shotsLightDark(page, 'discover')
  await page.getByTestId('dc-hero').getByRole('link').click() // the tapped video is what Watch shows
  await expect(page.getByTestId('watch-player')).toBeVisible()
  await shotsLightDark(page, 'watch')
})
