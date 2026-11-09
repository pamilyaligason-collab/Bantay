import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openFamily } from './fixtures/v13/family'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = process.env.S25_SHOTS // shots only when set, so a gate rerun leaves the tree clean

const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
const scrollers = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.bt *')].filter((e) => { const o = getComputedStyle(e).overflowX; return (o === 'auto' || o === 'scroll') && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('scroll') }).map((e) => e.className))
const at = (page: Page, y: number) => page.locator('.bt .scroll').evaluate((el, v) => { el.scrollTop = v }, y)

test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ timeout: 90_000 })
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
})

test('S26 Family order and no sideways scroller: Calendar, Together, Papers, Activity, Where, Needs, People (no Today list)', async ({ page }) => {
  await openFamily(page) // S28 (D-168): Activity moves up, above Where
  const order = await page.evaluate(() => ['calendar', 'together', 'papers-section', 'activity', 'where', 'needs', 'people'].map((id) => [id, document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? null] as const).filter((x) => x[1] !== null))
  expect(order.length).toBeGreaterThanOrEqual(5)
  for (let i = 1; i < order.length; i++) expect(order[i]![1]!, `${order[i]![0]} below ${order[i - 1]![0]}`).toBeGreaterThan(order[i - 1]![1]!)
  expect(await noSideways(page)).toBe(true)
  expect(await scrollers(page)).toEqual([])
  const cards = page.getByTestId('people-row')
  await expect(cards).toHaveCount(4)
  const xs = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
  expect(new Set(xs).size).toBe(2) // two columns
  if (SHOTS) {
    await at(page, 0); await page.screenshot({ path: `${SHOTS}/root-top-me.png` })
    await page.getByTestId('needs').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/root-middle-me.png` })
    await page.getByTestId('people').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/root-people-me.png` })
    await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = el.scrollHeight }); await page.screenshot({ path: `${SHOTS}/root-bottom-today-activity-me.png` })
  }
})

test('S26 Family: Open on a People card opens that person page (the Today list is gone)', async ({ page }) => {
  await openFamily(page)
  await page.getByTestId('people-row').first().locator('a.pp-main').click() // S28 Today merge: the People card opens the page
  await expect(page).toHaveURL(/#family\/people\/[^/]+$/)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/root-selected-ate.png` })
})

test('S25 Together tiles in system dark (no data-theme): the dark shadow and highlight apply', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await openFamily(page)
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).not.toBe('light')
  const tile = page.locator('.fm-tile').first()
  await expect(tile).toBeVisible()
  expect(await tile.evaluate((e) => getComputedStyle(e).boxShadow)).toContain('rgba(255, 255, 255, 0.12)') // the dark inset edge, from the media block
  if (SHOTS) { await page.getByTestId('together').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/together-dark.png` }) }
})
