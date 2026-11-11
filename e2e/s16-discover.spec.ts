import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertTargets, assertTextContrast, assertJackClear, assertNoWrappedButtons, setScheme } from './v13'

// Session 16 lane L3: Discover overview, Learn 2x2, Watch posters, old-hash redirects. Shots (390 px, light and dark) only when S16_SHOTS is set (ML-32).
test.use({ viewport: { width: 390, height: 844 } })
const SHOTS = 'docs/session-16/shots/L3'
const UNDAS = new Date(2026, 9, 28, 10, 20, 0)
const RAIN = new Date(2026, 6, 20, 10, 20, 0)

async function shot(page: Page, name: string, scheme: string) {
  if (!process.env.S16_SHOTS) return
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  const take = () => page.screenshot({ animations: 'disabled', caret: 'hide' })
  let prev = await take()
  for (let i = 0; i < 20; i++) { const next = await take(); if (next.equals(prev)) break; prev = next }
  mkdirSync(SHOTS, { recursive: true })
  writeFileSync(`${SHOTS}/${name}-${scheme}.png`, prev)
}

test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    // v13 lane D: the overview (hero, order, links, targets, contrast) is checked in e2e/v13-discover.spec.ts. Kept here: every sub still opens.
    test('every Discover sub opens', async ({ page }) => {
      await page.clock.setFixedTime(UNDAS)
      for (const sub of ['learn', 'watch', 'listen', 'play', 'news']) {
        await page.goto(`/#discover/${sub}`)
        await setScheme(page, scheme)
        await expect(page).toHaveURL(new RegExp(`#discover/${sub}$`))
        await expect(page.locator('h1').first()).toBeVisible()
      }
    })

    test('rainy day: Discover Today no longer draws the season row (S24), so no rain streaks', async ({ page }) => {
      await page.clock.setFixedTime(RAIN)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto('/#discover')
      await setScheme(page, scheme)
      await expect(page.locator('[data-testid="season-row"] .wxs-rain')).toHaveCount(0)
      await shot(page, 'discover-rain', scheme)
    })

    test('learn: 2x2 tiles + Your benefits, Library at #discover/learn/library', async ({ page }) => {
      await page.goto('/#discover/learn')
      await setScheme(page, scheme)
      await expect(page.getByTestId('learn-home')).toBeVisible()
      await assertTargets(page); await assertTextContrast(page)
      await assertJackClear(page)
      const r = await page.evaluate(() => ['recipes', 'library', 'together', 'benefits'].map((k) => { const b = document.querySelector(`[data-testid="learn-${k}"]`)!.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width)] }))
      expect(r[0]![1]).toBe(r[1]![1]) // Recipes and Library share a row
      expect(r[2]![1]).toBeGreaterThan(r[0]![1]!)
      expect(r[3]![2]).toBeGreaterThan(r[0]![2]! * 1.9) // Your benefits spans the row
      await shot(page, 'learn', scheme)
      await page.getByTestId('learn-library').click()
      await expect(page).toHaveURL(/#health\/library$/) // S25: the library moved into Health
      await expect(page.getByRole('heading', { level: 1, name: 'Health library' })).toBeVisible()
      await page.getByRole('link', { name: 'Back to Health' }).click()
      await expect(page).toHaveURL(/#health$/)
      await page.goto('/#discover/learn')
      await expect(page.getByTestId('learn-home')).toBeVisible()
      await page.getByTestId('learn-together').click()
      await expect(page.getByRole('heading', { level: 1, name: 'Learn together' })).toBeVisible()
    })

    test('watch: the poster grid fits, page does not scroll sideways', async ({ page }) => {
      await page.goto('/#discover/watch')
      await setScheme(page, scheme)
      await expect(page.getByTestId('watch')).toBeVisible()
      await shot(page, 'watch', scheme)
      await assertTargets(page); await assertTextContrast(page)
      await assertJackClear(page, { at: 'end' }) // seven topic rows plus Live TV (D-117) run past one screen, so a row always crosses the Jack band at rest; the end of the page must clear it
      await assertNoWrappedButtons(page)
      await expect(page.getByRole('group', { name: 'All videos' })).toBeVisible() // a MoreGrid now, not a scrolling row
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const p = (await page.getByRole('button', { name: /^Video, / }).first().boundingBox())!
      expect(p.width).toBeGreaterThanOrEqual(160); expect(p.height).toBeGreaterThanOrEqual(88) // D-180: a media row card is 88 px at least (128 px still, 16:9)
    })
  })
}

test('old hashes land in Health', async ({ page }) => {
  await page.goto('/#discover/learn/library')
  await expect(page).toHaveURL(/#health\/library$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Health library' })).toBeVisible()
  await page.goto('/#health/videos')
  await expect(page).toHaveURL(/#health$/)
  await expect(page.getByTestId('health-videos')).toBeAttached()
})

test('at 360 px no button wraps and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  for (const h of ['#discover', '#discover/season', '#discover/learn', '#discover/learn/benefits', '#discover/learn/library', '#discover/watch']) {
    await page.goto('/' + h)
    await assertNoWrappedButtons(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), h).toBe(true)
  }
})
