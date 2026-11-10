import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openFamily } from './fixtures/v13/family'
import { emptyNeeds } from './fixtures/s16/family'
import { startToday } from './fixtures/s16/today'
import { assertJackHit, assertNoSideways, DISCOVER_ALLOW, expectJackAtRest, FAMILY_ALLOW, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> }

// S21 lane G (D-124): no reserved heights on Discover or Family. S22 (D-135) ported the Discover half to the Today view: Top story, season row, Watch (hero and a row of three), Learn; the Be prepared row became a Learn card. Shots only with S21_SHOTS=<dir> (invented data).
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
const SHOTS = process.env.S21_SHOTS
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#6b8"/></svg>'
const JUMP_MAX = 95 // measured: the BP card is 346 px, the empty Steps tab 256 (-90) and Medicines 315 (-31); with no reservation at all the empty tab would be about 107 px (-239)
const WIDTHS = [360, 390, 412, 450]
const HEIGHTS = [800, 844, 900, 949, 1000]
const SHOT_AT = (w: number, h: number) => (w === 390 && h === 844) || (w === 450 && h === 949) // the two sizes the contract asks for
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' }) }

async function discover(page: Page, w: number, h: number, day: string) {
  await skipOnboarding(page)
  if (!SHOTS) await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG })) // shots use the real pictures
  await page.clock.setFixedTime(new Date(`${day}T09:00:00+08:00`))
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-learn')).toBeVisible()
  await expect(page.getByTestId('dc-hero')).toBeVisible() // Top stories show once the day's order is read
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.md-pic img')).every((i) => (i as HTMLImageElement).complete || (r => r.top > innerHeight * 2 || r.left > innerWidth)(i.getBoundingClientRect()))) // lazy stills below the fold or in a carousel off to the side never start loading
}

for (const day of ['2026-10-31', '2026-11-10', '2027-02-10']) { // Undas, typhoon months, no season
  for (const w of WIDTHS) {
    for (const h of HEIGHTS) {
      test(`discover ${day} ${w}x${h}: Learn first then Top story, links clear of Jack`, async ({ page }) => {
        await discover(page, w, h, day)
        await expect(page.getByTestId('dc-learn').getByRole('link', { name: 'All topics' })).toBeVisible()
        await expect(page.locator('.sh-jackfab')).toBeVisible()
        await expectJackAtRest(page, `discover ${day} ${w}x${h}`)
        const m = await page.evaluate(() => {
          ;(document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0
          const b = (q: string) => document.querySelector(q)!.getBoundingClientRect()
          const learnB = b('[data-testid="dc-learn"]')
          const story = b('[data-testid="dc-top-story"]')
          const link = Array.from(document.querySelectorAll('[data-testid="dc-learn"] a')).find((n) => n.textContent === 'All topics') as HTMLAnchorElement
          const lr = link.getBoundingClientRect()
          const fab = b('.sh-jackfab')
          return {
            gap: story.top - learnB.bottom,
            href: link.getAttribute('href'), cards: document.querySelectorAll('[data-testid="dc-top-rows"] a.md').length, order: learnB.top < story.top,
            overlap: lr.left < fab.right && lr.right > fab.left && lr.top < fab.bottom && lr.bottom > fab.top, linkH: lr.height, title: document.querySelector('[data-testid="dc-learn"] h2')!.textContent
          }
        })
        expect(m.title).toBe('Learn')
        expect(m.href).toBe('#discover/learn')
        expect(m.cards).toBe(4) // the four rows under the Top stories hero before Show more (S28)
        expect(m.order).toBe(true)
        expect(m.gap, 'gap between the Learn section and Top story').toBeLessThan(40)
        expect(m.overlap, 'All topics link under Jack at rest').toBe(false)
        expect(m.linkH).toBeGreaterThanOrEqual(43.5)
        await assertJackHit(page, DISCOVER_ALLOW, `discover ${day} ${w}x${h}`)
        await assertNoSideways(page)
        if (day === '2026-10-31' && SHOT_AT(w, h)) { await setScheme(page, 'light'); await shot(page, `discover-${w}x${h}`); await setScheme(page, 'dark'); await shot(page, `discover-${w}x${h}-dark`) }
      })
    }
  }
}

test('discover: no section link has its centre under Jack at rest, and a video card opens Watch', async ({ page }) => {
  await discover(page, 390, 844, '2026-10-31')
  await expectJackAtRest(page, 'discover section links')
  const bad = await page.evaluate(() => {
    ;(document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0
    const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
    // S29 (D-184): the links run flush right (Jack may cover their edge); what must stay clear is their centre point
    return Array.from(document.querySelectorAll('section.sec[data-testid^="dc-"] > .sec-h a')).filter((a) => { const r = a.getBoundingClientRect(); const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2; return x >= fab.left && x <= fab.right && y >= fab.top && y <= fab.bottom }).map((a) => a.textContent)
  })
  expect(bad, "section links with their centre under Jack").toEqual([])
  await page.getByTestId('dc-farm').locator('a.md').first().click()
  await expect(page).toHaveURL(/#discover\/watch/)
})

// The Activity card floor was once scoped to every `.card.ac`, which is also look/AlertCard (Today's red hazard and storm cards): those must size to their text.
for (const variant of ['quake', 'storm'] as const) {
  test.describe(`Today ${variant} warning`, () => {
    test.use({ baseURL: `http://localhost:${Number(process.env.PW_PORT ?? 4317) + 500}` })
    test(`the red ${variant} card has no min-height floor`, async ({ page }) => {
      await startToday(page, variant)
      const card = page.getByTestId(variant === 'quake' ? 'warning-card' : 'warning-card-storm').locator('.card.ac').first()
      await expect(card).toBeVisible()
      expect(await card.evaluate((e) => getComputedStyle(e).minHeight), 'AlertCard min-height').toMatch(/^(0px|auto)$/)
    })
  })
}

const AUTH_URL =`http://localhost:${Number(process.env.PW_PORT ?? 4317) + 500}` // the signed-in mock needs the Supabase-env build, as comply-cl does
for (const mode of ['out', 'in'] as const) {
  test.describe(`signed ${mode}`, () => {
    if (mode === 'in') test.use({ baseURL: AUTH_URL })
  for (const w of WIDTHS) {
    for (const h of HEIGHTS) {
      for (const name of (mode === 'in' ? ['chart', 'empty', 'needs'] : ['empty']) as ('chart' | 'empty' | 'needs')[]) {
        test(`family ${mode} ${name} ${w}x${h}: Activity hugs, under 40 px from the card to the next section, no blank in the card, Jack`, async ({ page }) => {
          await skipOnboarding(page)
          await page.emulateMedia({ reducedMotion: 'reduce' })
          await page.setViewportSize({ width: w, height: h })
          if (name === 'chart') await openFamily(page, { person: 'Ate Joy' })
          else if (name === 'needs') await openFamily(page, { readings: false }) // stays on Me with nothing logged: Activity hugs and the Needs rows (a missed medicine for Ate Joy, Papa Ben's phone) come up under it
          else await emptyNeeds(page)
          const sec = page.getByTestId('activity')
          await expect(sec).toBeVisible()
          if (name === 'chart') await expect(page.getByTestId('week-chart')).toBeVisible()
          else if (name === 'empty') await expect(page.getByTestId('ac-empty')).toBeVisible({ timeout: 15_000 })
          if (name === 'needs') { await expect(page.getByTestId('need-row').first()).toBeVisible() }
          await page.waitForTimeout(400)
          // from the card's visible bottom (D-124), not the section box
          const gap = () => sec.evaluate((e) => (e.nextElementSibling?.getBoundingClientRect().top ?? e.getBoundingClientRect().bottom) - e.querySelector('.card.ac')!.getBoundingClientRect().bottom)
          expect(await gap(), 'gap between the Activity card and the next section').toBeLessThan(40)
          const card = sec.locator('.card.ac')
          const h0 = (await card.boundingBox())!.height
          if (name === 'chart') {
            expect(await card.evaluate((e) => getComputedStyle(e).minHeight), 'no floor on the card').toMatch(/^(0px|auto)$/)
            expect(await sec.evaluate((e) => getComputedStyle(e).minHeight), 'no floor on the section').toMatch(/^(0px|auto)$/)
            // blank inside the card under its last line: card bottom - padding-bottom - last child bottom (read from the computed style; box-sizing logged)
            const blank = await card.evaluate((e) => { const s = getComputedStyle(e); return { blank: e.getBoundingClientRect().bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth) - e.lastElementChild!.getBoundingClientRect().bottom, boxSizing: s.boxSizing } })
            console.log('S21-BLANK', w, h, blank.boxSizing, blank.blank.toFixed(1), 'card', h0)
            expect(blank.blank, 'blank under the Green band line').toBeLessThanOrEqual(1)
            for (const tab of ['Steps', 'Medicines', 'BP']) {
              await sec.getByRole('button', { name: tab }).click()
              await page.waitForTimeout(100)
              const hh = (await card.boundingBox())!.height
              console.log('S21-TAB', w, h, tab, 'bp card', h0, 'now', hh, 'jump', (hh - h0).toFixed(1), 'empty', await page.getByTestId('ac-empty').count())
              expect(Math.abs(hh - h0), `height change on the ${tab} tab`).toBeLessThanOrEqual(JUMP_MAX)
              expect(await gap()).toBeLessThan(40)
            }
          } else if (name === 'empty') expect(h0, 'empty Activity hugs its line').toBeLessThan(260)
          await assertJackHit(page, FAMILY_ALLOW, `family ${mode} ${name} ${w}x${h}`)
          await assertNoSideways(page)
          if (SHOT_AT(w, h)) { await setScheme(page, 'light'); await shot(page, `family-${mode}-${name}-${w}x${h}`); await setScheme(page, 'dark'); await shot(page, `family-${mode}-${name}-${w}x${h}-dark`) }
        })
      }
    }
  }
  })
}
