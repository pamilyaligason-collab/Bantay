import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openFamily } from './fixtures/v13/family'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = process.env.V13_SHOTS // shots only when set, so a gate rerun leaves the tree clean

const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
/** Controls inside the selector that are shorter than 44 px. */
const short = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim(), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44))
/** Elements whose text contrast against the first opaque background above them is under 4.5:1. */
const lowContrast = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => {
  const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
  const lum = ([r, g, b]: number[]) => { const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!) }
  const bgOf = (e: Element): number[] => { for (let n: Element | null = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.95) return c } return [255, 255, 255] }
  return els.map((e) => { const a = lum(rgb(getComputedStyle(e).color)); const b = lum(bgOf(e)); return { t: (e.textContent || '').trim().slice(0, 30), r: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) } }).filter((x) => x.r < 4.5)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    })

    test('root: title, add, Today carousel, Activity, Needs, People, Together', async ({ page }) => {
      await openFamily(page)
      await expect(page.locator('h1')).toHaveText('Family')
      await expect(page.locator('.lt-kicker')).toHaveText('4 PEOPLE')
      const add = page.getByRole('link', { name: 'Add a family member' })
      const box = (await add.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
      await expect(add).toHaveAttribute('href', '#me/family')
      const cards = page.getByTestId('person-card')
      await expect(cards).toHaveCount(4)
      await expect(cards.first()).toContainText('Ate Joy')
      await expect(cards.first()).toContainText('Missed a medicine')
      for (const c of await cards.all()) expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(196)
      expect(await short(page, '.pc a, .pc button')).toEqual([])
      // Needs holds Papa's phone only; Ate Joy is already a card, so she is not repeated in the list
      const needs = page.getByTestId('need-row')
      await expect(needs).toHaveCount(1)
      await expect(needs.first()).toContainText("Papa Ben's phone may miss alarms")
      await expect(page.getByTestId('needs')).not.toContainText('Ate Joy')
      await expect(page.getByTestId('people-row')).toHaveCount(4)
      await expect(page.getByTestId('together-list').getByRole('link')).toHaveCount(4)
      await expect(page.getByTestId('planrow')).toBeVisible()
      expect(await noSideways(page)).toBe(true)
      expect(await lowContrast(page, '.pc-line, .pc-body, .rw-sub, .rw-value, .sec-meta')).toEqual([])
      if (SHOTS) {
        await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = 0 })
        await page.screenshot({ path: `docs/redesign-2026-10-31/shots/family/family-${scheme}.png` })
        await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = el.scrollHeight })
        await page.screenshot({ path: `docs/redesign-2026-10-31/shots/family/family-end-${scheme}.png` })
      }
    })

    test('Activity: BP chart with a legend, other segments', async ({ page }) => {
      await openFamily(page)
      const ac = page.getByTestId('activity')
      await expect(ac.getByTestId('week-chart')).toHaveAttribute('aria-label', /Blood pressure over 7 days/)
      await expect(ac).toContainText('Ate Joy · 142 high')
      await expect(ac).toContainText('You · no readings')
      await ac.getByRole('button', { name: 'Steps' }).click()
      await expect(ac).toContainText('Steps show here once a phone shares them')
    })

    test('Activity with no readings says so', async ({ page }) => {
      await openFamily(page, { readings: false })
      await expect(page.getByTestId('activity')).toContainText('No readings shared with you this week')
    })

    test('Memories is a pushed page; the feed is off by default and on with the flag', async ({ page }) => {
      await openFamily(page)
      await page.getByTestId('memoriesrow').getByRole('link').click()
      await expect(page).toHaveURL(/#family\/memories$/)
      await expect(page.getByRole('link', { name: 'Back to Family' })).toBeVisible()
      await page.goto('/#family/feed')
      await expect(page).toHaveURL(/#family$/)
      await page.evaluate(() => localStorage.setItem('bantay.flag.feed', '1'))
      await page.goto('/#family/feed')
      await expect(page.locator('h1')).toHaveText('Family feed')
      await expect(page.getByRole('group', { name: 'Show' }).getByRole('button')).toHaveCount(4)
      await expect(page.getByText('142/88 mmHg')).toBeVisible()
      await page.getByRole('button', { name: 'Photos' }).click()
      await expect(page.getByText('No photos yet')).toBeVisible()
      await expect(page.getByRole('button', { name: /reply|heart/i })).toHaveCount(0)
      expect(await noSideways(page)).toBe(true)
      if (SHOTS) await page.screenshot({ path: `docs/redesign-2026-10-31/shots/family/feed-${scheme}.png` })
    })

    test('no sideways scroll at 360 and 195', async ({ page }) => {
      await openFamily(page)
      for (const w of [360, 195]) {
        await page.setViewportSize({ width: w, height: 740 })
        expect(await noSideways(page), `width ${w}`).toBe(true)
        expect(await short(page, '.pc a, .pc button')).toEqual([])
      }
    })
  })
}
