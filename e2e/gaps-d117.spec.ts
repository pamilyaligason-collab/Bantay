import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackHit, assertJackHitRestAndEnd, expectJackAtRest, assertNoSideways, assertNoWrappedButtons, assertTargets, DISCOVER_ALLOW, FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// D-117, ported to the S22 Discover Today view (D-135): the Ready at home card became the Be prepared and Garden and farm Learn cards (#discover/learn/prepping, #discover/learn/farm-diy; S24 renamed repairs to farm-diy and the old link redirects); the pages themselves are unchanged. Jack clearance is hit-tested at every size and date (D-128, ML-44). Shots only with D117_SHOTS=<dir>.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1]) // 31 Oct, Undas
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 }))
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-learn')).toBeVisible()
})

const shot = async (page: import('@playwright/test').Page, name: string, target = 'dc-learn') => {
  const dir = process.env.D117_SHOTS
  if (!dir) return
  for (const s of ['light', 'dark'] as const) {
    await setScheme(page, s)
    await page.getByTestId(target).scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${dir}/${name}-${s}.png`, animations: 'disabled' })
  }
}

test('the Learn section opens Discover Today, before Top story, Health videos, Farming and DIY and Listen; its Be prepared and Garden and farm cards open the D-117 pages, are 44 px tall and keep a one-line title', async ({ page }) => {
  const m = await page.evaluate(() => {
    const y = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.getBoundingClientRect().top
    const card = (id: string) => { const a = document.querySelector<HTMLAnchorElement>(`[data-testid="${id}"]`)!; const t = a.querySelector<HTMLElement>('.dc-lc-t')!; return { href: a.getAttribute('href'), h: a.getBoundingClientRect().height, lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) } }
    const title = document.querySelector<HTMLElement>('[data-testid="dc-learn"] h2')!
    return { learn: y('dc-learn'), story: y('dc-top-story'), health: y('dc-health-link'), farm: y('dc-farm'), listen: y('dc-listen'), prep: card('dc-learn-prepping'), repairs: card('dc-learn-farm'), titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)) }
  })
  expect([m.learn, m.story, m.listen, m.farm, m.health].every((t, i, a) => i === 0 || t > a[i - 1]!), 'section order').toBe(true)
  expect(m.prep.href).toBe('#discover/learn/prepping')
  expect(m.repairs.href).toBe('#discover/learn/farm-diy')
  for (const c of [m.prep, m.repairs]) { expect(c.h).toBeGreaterThanOrEqual(44); expect(c.lines).toBe(1) }
  expect(m.titleLines).toBe(1)
})

for (const w of [195, 360, 390]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${w} px ${scheme}: Learn cards fit, targets met, no sideways scroll, Jack clear`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w === 195 ? 800 : 844 })
      await page.reload()
      await expect(page.getByTestId('dc-learn')).toBeVisible()
      await setScheme(page, scheme)
      await assertNoSideways(page)
      await assertTargets(page, { tabFloor: w === 195 ? 23.5 : undefined })
      await assertNoWrappedButtons(page)
      await assertJackHitRestAndEnd(page, DISCOVER_ALLOW, `d117 ${scheme} ${w}`) // D-128 hit test: only the whole-card links of D-135 may touch Jack, with more than half still tappable
      const box = await page.getByTestId('dc-learn').evaluate((e) => { const r = e.getBoundingClientRect(), s = document.querySelector('.bt .scroll')!.getBoundingClientRect(); return { l: r.left - s.left, r: s.right - r.right } })
      expect(box.l).toBeGreaterThanOrEqual(0)
      expect(box.r).toBeGreaterThanOrEqual(0)
      await shot(page, `learn-cards-${w}`)
    })
  }
}

/** S28: a topic page lists its videos as media cards, 4 at a time with Show more; open them all and count. */
async function expectVideos(page: import('@playwright/test').Page, n: number) {
  const vids = page.getByTestId('ready-videos')
  await expect(vids.locator('button.md')).toHaveCount(4)
  const more = vids.getByRole('button', { name: /Show \d+ more/ })
  for (let i = 0; i < 8 && (await more.count()) > 0; i++) await more.click()
  await expect(vids.locator('button.md')).toHaveCount(n)
}

test('the Learn cards open each topic with its checked videos and reads, and the old repairs link redirects', async ({ page }) => {
  await page.getByTestId('dc-learn-prepping').click()
  await expect(page.getByTestId('ready-prepping')).toBeVisible()
  await expectVideos(page, 20) // ready.json: 20 Be prepared videos, 6 prepping reads, counted by hand
  await expect(page.locator('a.lr-tile')).toHaveCount(6)
  await shot(page, 'learn-prepping-390', 'ready-prepping')
  await page.goto('/#discover/learn/repairs')
  await expect(page).toHaveURL(/#discover\/learn\/farm-diy$/) // the S24 rename
  await expectVideos(page, 23) // 23 Farming and DIY videos, 5 reads
  await expect(page.locator('a.lr-tile')).toHaveCount(5)
  await shot(page, 'learn-farm-diy-390', 'ready-farm-diy')
  await page.goto('/#discover/learn')
  await expect(page.getByTestId('learn-prepping')).toBeVisible()
  await expect(page.getByTestId('learn-farm-diy')).toBeVisible()
  await assertNoSideways(page)
  await shot(page, 'learn-home-390', 'learn-home')
})

// Learn's "All topics" link must not sit under Jack, and every control is hit-tested against Jack at rest, on every rotation day and size (D-124 no floor; D-128 hit test; S22: the season row now sits under Top story, so it clears Jack at every height, and the Watch hero card is a named whole-card link).
for (const day of ['2026-10-31', '2026-11-01', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10', '2026-11-18', '2026-12-02', '2026-12-10', '2026-12-25', '2026-12-28', '2027-02-10', '2027-03-15', '2027-04-15', '2027-07-04', '2027-07-15']) {
  for (const [w, h] of [[390, 844], [360, 844], [360, 800], [412, 915], [360, 740], [390, 720]] as const) {
    test(`${day} at ${w}x${h}: Learn link, season row and every control clear of Jack at rest`, async ({ page }) => {
      await page.clock.setFixedTime(`${day}T09:00:00+08:00`)
      await page.setViewportSize({ width: w, height: h })
      await page.reload()
      await expect(page.getByTestId('dc-learn')).toBeVisible()
      await expect(page.getByTestId('dc-learn').getByRole('link', { name: 'All topics' })).toBeVisible()
      await expect(page.locator('.sh-jackfab')).toBeVisible()
      await expectJackAtRest(page, `d117 ${day} ${w}x${h}`)
      // A small link is the hazard: a full-width card beside Jack stays tappable, a link under him does not. The link now sits left, beside its title (D-124), so measure this link, not every control.
      const m = await page.evaluate(() => {
        ;(document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0
        const link = Array.from(document.querySelectorAll('[data-testid="dc-learn"] a')).find((n) => n.textContent === 'All topics')!.getBoundingClientRect()
        const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
        return { overlap: link.left < fab.right && link.right > fab.left && link.top < fab.bottom && link.bottom > fab.top, top: link.top, fabBottom: fab.bottom }
      })
      expect(m.overlap, `link top ${m.top}, Jack bottom ${m.fabBottom}`).toBe(false)
      await assertJackHit(page, DISCOVER_ALLOW, `d117 ${day} ${w}x${h}`)
    })
  }
}

// The top block: Learn, Top story (hero and 2 x 2 grid), Health videos and Farming and DIY never overlap, on every season date (the season card left Discover Today in S24; the dates stay as a rotation check).
const SEASONS: [string, string][] = [['undas', '2026-10-31'], ['typhoon', '2026-11-10'], ['christmas', '2026-12-10'], ['newyear', '2026-12-28'], ['heat', '2027-04-15'], ['typhoon-jul', '2027-07-15'], ['none', '2027-02-10']]
for (const [name, day] of SEASONS) {
  for (const w of [390, 360]) {
    test(`${name} ${day} at ${w} px: no overlap between Learn, Top story, hero, Health videos and Farming and DIY`, async ({ page }) => {
      await page.clock.setFixedTime(`${day}T09:00:00+08:00`)
      await page.setViewportSize({ width: w, height: 844 })
      await page.reload()
      await expect(page.getByTestId('dc-learn')).toBeVisible()
      await expect(page.getByTestId('dc-hero')).toBeVisible()
      const r = await page.evaluate(() => {
        const box = (id: string) => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom } }
        return { learn: box('dc-learn'), story: box('dc-top-story'), hero: box('dc-hero'), health: box('dc-health-link'), farm: box('dc-farm') }
      })
      const chain = [r.learn, r.story, r.farm, r.health].filter((x): x is { top: number; bottom: number } => !!x)
      expect(chain.length).toBe(4)
      chain.slice(1).forEach((b, i) => expect(b.top - chain[i]!.bottom, `gap ${i}`).toBeGreaterThanOrEqual(0))
      expect(r.hero!.top, 'hero inside Top story').toBeGreaterThanOrEqual(r.story!.top)
      expect(r.hero!.bottom, 'hero inside Top story').toBeLessThanOrEqual(r.story!.bottom)
      if (process.env.D117_SHOTS) for (const sc of ['light', 'dark'] as const) {
        await setScheme(page, sc)
        await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0 })
        await page.waitForTimeout(150)
        await page.screenshot({ path: `${process.env.D117_SHOTS}/top-${name}-${w}-${sc}.png`, animations: 'disabled' })
      }
    })
  }
}

// S28: the hero's category chip is gone with the channel chips, so there is no chip for the play circle to overlap.
