import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertBudget, assertJackClear, assertNoWrappedButtons, setScheme } from './s16'

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
    test('overview: hero, season row, five tiles within 800 px, each tile opens its sub', async ({ page }) => {
      await page.clock.setFixedTime(UNDAS)
      await page.goto('/#discover')
      await setScheme(page, scheme)
      await expect(page.getByTestId('pick')).toBeVisible()
      await expect(page.getByTestId('season-row')).toBeVisible()
      await expect(page.getByTestId('discover-tiles').getByRole('link')).toHaveCount(5)
      await shot(page, 'discover', scheme)
      await assertBudget(page, 800)
      await assertJackClear(page)
      await assertNoWrappedButtons(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      // one Jack on the screen besides the Jack button: the pick art, and it never overlaps a link text box
      const jack = (await page.locator('[data-testid="pick"] .sc-jack img').boundingBox())!
      const title = (await page.locator('[data-testid="pick"] .sc-title').boundingBox())!
      expect(jack.x).toBeGreaterThanOrEqual(title.x + title.width - 1)
      expect(jack.width).toBeLessThanOrEqual(96)
      for (const sub of ['learn', 'watch', 'listen', 'play', 'news']) {
        await page.goto('/#discover')
        await page.getByTestId('tile-' + sub).click()
        await expect(page).toHaveURL(new RegExp(`#discover/${sub}$`))
      }
    })

    test('rainy season row: six slow streaks that stop under reduced motion', async ({ page }) => {
      await page.clock.setFixedTime(RAIN)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto('/#discover')
      await setScheme(page, scheme)
      await expect(page.locator('[data-testid="season-row"] .wxs-rain i')).toHaveCount(6)
      expect(await page.locator('[data-testid="season-row"] .wxs-rain i').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('wxs-fall')
      await shot(page, 'discover-rain', scheme)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      expect(await page.locator('[data-testid="season-row"] .wxs-rain').evaluate((el) => getComputedStyle(el).display)).toBe('none')
    })

    test('learn: 2x2 tiles + Your benefits, Library at #discover/learn/library', async ({ page }) => {
      await page.goto('/#discover/learn')
      await setScheme(page, scheme)
      await expect(page.getByTestId('learn-home')).toBeVisible()
      await assertBudget(page, 800)
      await assertJackClear(page)
      const r = await page.evaluate(() => ['recipes', 'library', 'together', 'benefits'].map((k) => { const b = document.querySelector(`[data-testid="learn-${k}"]`)!.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width)] }))
      expect(r[0]![1]).toBe(r[1]![1]) // Recipes and Library share a row
      expect(r[2]![1]).toBeGreaterThan(r[0]![1]!)
      expect(r[3]![2]).toBeGreaterThan(r[0]![2]! * 1.9) // Your benefits spans the row
      await shot(page, 'learn', scheme)
      await page.getByTestId('learn-library').click()
      await expect(page).toHaveURL(/#discover\/learn\/library$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Health library' })).toBeVisible()
      await page.getByRole('link', { name: 'Back to Learn' }).click()
      await expect(page.getByTestId('learn-home')).toBeVisible()
      await page.getByTestId('learn-together').click()
      await expect(page.getByRole('heading', { level: 1, name: 'Learn together' })).toBeVisible()
    })

    test('watch: poster row scrolls inside itself, page stays within 800 px', async ({ page }) => {
      await page.goto('/#discover/watch')
      await setScheme(page, scheme)
      await expect(page.getByTestId('watch')).toBeVisible()
      await shot(page, 'watch', scheme)
      await assertBudget(page, 800)
      await assertJackClear(page)
      await assertNoWrappedButtons(page)
      const row = page.getByRole('list', { name: 'Checked videos' })
      expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const p = (await page.getByRole('button', { name: /^Choose / }).first().boundingBox())!
      expect([Math.round(p.width), Math.round(p.height)]).toEqual([160, 90])
    })
  })
}

test('old hashes land on Discover', async ({ page }) => {
  await page.goto('/#health/library')
  await expect(page).toHaveURL(/#discover\/learn\/library$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Health library' })).toBeVisible()
  await page.goto('/#health/videos')
  await expect(page).toHaveURL(/#discover\/watch$/)
  await expect(page.getByTestId('watch')).toBeVisible()
})

test('at 360 px no button wraps and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  for (const h of ['#discover', '#discover/season', '#discover/learn', '#discover/learn/benefits', '#discover/learn/library', '#discover/watch']) {
    await page.goto('/' + h)
    await assertNoWrappedButtons(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), h).toBe(true)
  }
})
