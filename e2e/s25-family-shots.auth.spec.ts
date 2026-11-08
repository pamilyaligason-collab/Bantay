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
  await page.emulateMedia({ colorScheme: "light" }) // no reducedMotion here: with it the roster did not draw after the reload in this fixture (also v13-family.auth root); the CSS honours it regardless
})

test('S25 Family order and no sideways scroller: Together, Papers, Where, Needs, People, Today, Activity', async ({ page }) => {
  await openFamily(page)
  const order = await page.evaluate(() => ['together', 'papers-section', 'where', 'needs', 'people', 'facesrow', 'activity'].map((id) => [id, document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? null] as const).filter((x) => x[1] !== null))
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
  }
})

test('S25 Family with another person selected: Open on a Needs line shows that person Today', async ({ page }) => {
  await openFamily(page)
  await page.getByTestId('need-row').first().getByRole('button', { name: /^Open/ }).click()
  await expect(page.getByTestId('person-card').first()).toBeInViewport() // the pick brings Today into view, not the top of the page
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/root-selected-ate.png` })
})
