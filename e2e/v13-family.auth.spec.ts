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

    test('root (D-109): opens on Me; title, pill, add, Together, Needs, People, one Today card, Activity', async ({ page }) => {
      await openFamily(page)
      await expect(page.locator('h1')).toHaveText('Family')
      await expect(page.locator('.lt-kicker')).not.toContainText('PEOPLE') // no head count: it counted people you may not see
      const add = page.getByRole('link', { name: 'Add a family member' })
      const box = (await add.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
      await expect(add).toHaveAttribute('href', '#me/family')
      await expect(page.getByRole('button', { name: 'Who to show: Me' })).toBeVisible()
      await expect(page.getByTestId('person-card')).toHaveCount(0) // S26 (D-168): no separate Today list
      await expect(page.getByTestId('facesrow')).toHaveCount(0)
      await expect(page.getByTestId('people-row').first()).toContainText('You') // my status is on my People card
      expect(await short(page, '.pp-card a, .pp-card button, .ps-pill')).toEqual([])
      // S28 lane E (Today merge): Ate Joy's missed dose is said once, on her People card; Needs holds Papa's phone only (no medicine, no number)
      const needs = page.getByTestId('need-row')
      await expect(needs).toHaveCount(1)
      await expect(page.getByTestId('people-row').filter({ hasText: 'Ate Joy' }).first()).toContainText('Missed a medicine')
      await expect(page.getByTestId('needs')).not.toContainText('Nasal')
      await expect(needs.first()).toContainText("Papa Ben's phone may miss alarms")
      await expect(page.getByTestId('people-row')).toHaveCount(4) // S25: a 2-column grid of four cards, no See all
      await expect(page.getByTestId('together-list').getByRole('link')).toHaveCount(2) // Messages and Memories; Plan is part of the one Calendar card
      await expect(page.getByTestId('planrow')).toHaveCount(0)
      await expect(page.getByTestId('calendar')).toBeVisible()
      expect(await noSideways(page)).toBe(true)
      expect(await lowContrast(page, '.pc-line, .pc-body, .rw-sub, .rw-value, .sec-meta')).toEqual([])
      if (SHOTS) {
        await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = 0 })
        await page.screenshot({ path: `docs/redesign-2026-10-31/shots/family/family-${scheme}.png` })
        await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = el.scrollHeight })
        await page.screenshot({ path: `docs/redesign-2026-10-31/shots/family/family-end-${scheme}.png` })
      }
    })

    test('Open on a missed-dose line opens that person page; picking them in the pill puts their Activity on show, the hash stays', async ({ page }) => {
      await openFamily(page)
      await expect(page.getByTestId('people-row').filter({ hasText: 'Ate' }).first()).toContainText('Missed a medicine') // today status on the People card
      await page.getByTestId('people-row').filter({ hasText: 'Ate' }).first().locator('a.pp-main').click() // S28 Today merge: the People card is the way in
      await expect(page).toHaveURL(/#family\/people\/[^/]+$/)
      await page.goto('/#family')
      await page.getByRole('button', { name: /^Who to show/ }).click()
      await page.getByRole('dialog', { name: 'Who to show' }).getByRole('button', { name: /Ate Joy/ }).click()
      await expect(page.getByRole('button', { name: 'Who to show: Ate' })).toBeVisible()
      await expect(page.getByTestId('activity')).toContainText('Ate Joy · 142 high')
      await expect(page.getByTestId('activity')).not.toContainText('You')
      await expect(page).toHaveURL(/#family$/)
      await page.goto('/#health') // leaving Family forgets the pick
      await page.goto('/#family')
      await expect(page.getByRole('button', { name: 'Who to show: Me' })).toBeVisible()
    })

    test('Activity: BP chart with a legend for the person on show, other segments', async ({ page }) => {
      await openFamily(page, { person: 'Ate Joy' })
      const ac = page.getByTestId('activity')
      await expect(ac.getByTestId('week-chart')).toHaveAttribute('aria-label', /Blood pressure over 7 days/)
      await expect(ac).toContainText('Ate Joy · 142 high')
      await ac.getByRole('button', { name: 'Steps' }).click()
      await expect(ac).toContainText(/No step readings for/)
    })

    test('F-lane shape: People <= 296, the old Plan link opens the Calendar, no im-ok row, one h1 on Memories, Messages has no empty strip', async ({ page }) => {
      await openFamily(page)
      expect((await page.getByTestId('people').boundingBox())!.height).toBeLessThanOrEqual(296) // measured 286 at 390 x 844 (title, 3 rows, the 48 px foot row); a fourth row adds about 66, so the fold still fails here if it stops folding. Was 260 before the foot row.
      await expect(page.getByRole('button', { name: /I'm OK/ })).toHaveCount(0)
      await expect(page.getByTestId('papers-card')).toContainText('Labs, photos and documents'); await expect(page.getByTestId('papers-review')).toHaveCount(0) // the fixture queue is empty; the counts are unit tested (TogetherList)
      if (SHOTS) { await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = 0 }); await page.screenshot({ path: `docs/redesign-2026-10-31/shots/gaps-F/family-${scheme}.png` }) }
      await page.goto('/#family/plan')
      await expect(page).toHaveURL(/#family\/calendar$/)
      await expect(page.locator('h1').first()).toBeVisible()
      await page.goto('/#family/memories')
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.getByText('Off for now')).toHaveCount(0)
      if (SHOTS) await page.screenshot({ path: `docs/redesign-2026-10-31/shots/gaps-F/memories-${scheme}.png` })
      await page.goto('/#family/messages')
      await expect(page.getByRole('region', { name: 'Family feed' })).toBeVisible() // S28 (D-179 era): the Messages page is read-only alerts, there is no compose box
      const empties = await page.locator('.bt .scroll *').evaluateAll((els) => els.filter((e) => !e.children.length && !(e.textContent || '').trim() && !['IMG', 'SVG', 'svg', 'path', 'INPUT', 'TEXTAREA', 'AUDIO', 'CIRCLE', 'LINE', 'use', 'canvas'].includes(e.tagName) && e.getBoundingClientRect().height > 40 && !e.hasAttribute('aria-hidden')).map((e) => e.className))
      expect(empties).toEqual([])
      if (SHOTS) await page.screenshot({ path: `docs/redesign-2026-10-31/shots/gaps-F/messages-${scheme}.png` })
    })

    test('Activity with no readings says so', async ({ page }) => {
      await openFamily(page, { readings: false })
      await page.getByTestId('activity').getByRole('button', { name: 'BP' }).click()
      await expect(page.getByTestId('activity')).toContainText(/No blood pressure readings for/)
    })

    test('Memories is a pushed page; the feed is off by default and on with the flag', async ({ page }) => {
      await openFamily(page)
      await page.getByTestId('memoriesrow').click()
      await expect(page).toHaveURL(/#family\/memories$/)
      await expect(page.getByRole('link', { name: 'Back to Family' })).toBeVisible()
      await page.goto('/#family/feed')
      await expect(page).toHaveURL(/#family$/)
      await page.evaluate(() => localStorage.setItem('bantay.flag.feed', '1'))
      // D-134: the feed shows what the server list holds (Ate Joy switched blood pressure on), not other people's local readings
      await page.route('**/rpc/family_feed', (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify([{ kind: 'bp', person_id: 'ma', at: new Date(2026, 9, 27, 7, 0).toISOString(), title_key: 'feed.bp', value_text: '142/88', chip: null, photo_path: null, row_id: 'r1' }]) }))
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
