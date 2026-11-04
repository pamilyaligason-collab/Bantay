import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackClear, assertNoSideways, assertNoWrappedButtons, assertTargets, FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// D-117: the "Ready at home" card between Listen and Play, plus the Be prepared and Repairs and improvements pages in Learn. Shots only with D117_SHOTS=<dir>.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1]) // 31 Oct, Undas
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 }))
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-ready')).toBeVisible()
})

const shot = async (page: import('@playwright/test').Page, name: string, target = 'dc-ready') => {
  const dir = process.env.D117_SHOTS
  if (!dir) return
  for (const s of ['light', 'dark'] as const) {
    await setScheme(page, s)
    await page.getByTestId(target).scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${dir}/${name}-${s}.png`, animations: 'disabled' })
  }
}

test('the card sits between Listen and Play, with two 44 px rows and no wrapped title', async ({ page }) => {
  const m = await page.evaluate(() => {
    const y = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.getBoundingClientRect().top
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="dc-ready-"] .rw-main')).map((e) => e.getBoundingClientRect().height)
    const title = document.querySelector<HTMLElement>('[data-testid="dc-ready"] h2')!
    return { listen: y('dc-listen'), ready: y('dc-ready'), play: y('dc-play'), rows, titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)) }
  })
  expect(m.listen).toBeLessThan(m.ready)
  expect(m.ready).toBeLessThan(m.play)
  expect(m.rows).toHaveLength(2)
  m.rows.forEach((h) => expect(h).toBeGreaterThanOrEqual(44))
  expect(m.titleLines).toBe(1)
})

for (const w of [195, 360, 390]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${w} px ${scheme}: card fits, targets met, no sideways scroll, Jack clear`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w === 195 ? 800 : 844 })
      await page.reload()
      await expect(page.getByTestId('dc-ready')).toBeVisible()
      await setScheme(page, scheme)
      await assertNoSideways(page)
      await assertTargets(page, { tabFloor: w === 195 ? 23.5 : undefined })
      await assertNoWrappedButtons(page)
      await assertJackClear(page, { at: 'end' }) // the top of the page has full-width season and video cards beside Jack that stay tappable (the Learn link, which would not, is measured below); the end of the page must clear it
      const box = await page.getByTestId('dc-ready').evaluate((e) => { const r = e.getBoundingClientRect(), s = document.querySelector('.bt .scroll')!.getBoundingClientRect(); return { l: r.left - s.left, r: s.right - r.right } })
      expect(box.l).toBeGreaterThanOrEqual(0)
      expect(box.r).toBeGreaterThanOrEqual(0)
      await shot(page, `ready-card-${w}`)
    })
  }
}

test('the card opens each Learn topic with its checked videos and reads; the hero list holds 26 videos', async ({ page }) => {
  await expect(page.getByTestId('dc-hero')).toContainText('Watch · 26 checked videos')
  await page.getByTestId('dc-ready-prepping').getByRole('link').click()
  await expect(page.getByTestId('ready-prepping')).toBeVisible()
  await expect(page.locator('.ry-video')).toHaveCount(8)
  await expect(page.locator('a.lr-tile')).toHaveCount(6)
  await shot(page, 'learn-prepping-390', 'ready-prepping')
  await page.goto('/#discover/learn/repairs')
  await expect(page.locator('.ry-video')).toHaveCount(6)
  await expect(page.locator('a.lr-tile')).toHaveCount(5)
  await shot(page, 'learn-repairs-390', 'ready-repairs')
  await page.goto('/#discover/learn')
  await expect(page.getByTestId('learn-prepping')).toBeVisible()
  await expect(page.getByTestId('learn-repairs')).toBeVisible()
  await assertNoSideways(page)
  await shot(page, 'learn-home-390', 'learn-home')
})

// Learn's "All topics" link must start below Jack and the full-width season row must end above it, at rest, on every rotation day, short titles and tall ones alike (the .dc-top floor is the viewport height minus 283 px; the hero poster shrinks on short screens).
for (const day of ['2026-10-31', '2026-11-01', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10', '2026-11-18', '2026-12-02', '2026-12-10', '2026-12-25', '2026-12-28', '2027-02-10', '2027-03-15', '2027-04-15', '2027-07-04', '2027-07-15']) {
  for (const [w, h] of [[390, 844], [360, 844], [360, 800], [412, 915], [360, 740], [390, 720]] as const) {
    test(`${day} at ${w}x${h}: Learn link and season row clear of Jack at rest`, async ({ page }) => {
      await page.clock.setFixedTime(`${day}T09:00:00+08:00`)
      await page.setViewportSize({ width: w, height: h })
      await page.reload()
      await expect(page.getByTestId('dc-learn')).toBeVisible()
      // The small right-hand link is the hazard: a full-width card beside Jack stays tappable, a link under it does not. So measure this link, not every control.
      const m = await page.evaluate(() => {
        ;(document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0
        const link = Array.from(document.querySelectorAll('[data-testid="dc-learn"] a')).find((n) => n.textContent === 'All topics')!.getBoundingClientRect()
        const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
        const sea = document.querySelector('[data-testid="season-row"]')?.getBoundingClientRect() // absent on a day with no season
        return { overlap: link.left < fab.right && link.right > fab.left && link.top < fab.bottom && link.bottom > fab.top, top: link.top, fabBottom: fab.bottom, seaBottom: sea?.bottom ?? null, fabTop: fab.top }
      })
      expect(m.overlap, `link top ${m.top}, Jack bottom ${m.fabBottom}`).toBe(false)
      // below 756 px tall at 360 wide (721 at 390) even the 72 px poster cannot lift the season row clear of Jack (known, accepted in round 12: only the right 62 px of a link that opens the same page): the Learn link is still checked there
      if (m.seaBottom !== null && h >= 800) expect(m.seaBottom, `season row bottom ${m.seaBottom}, Jack top ${m.fabTop}`).toBeLessThanOrEqual(m.fabTop) // full width, so it must end above Jack
    })
  }
}

// The top block: hero, video cards and season row never overlap, in every season state (the season row is absent on a day with none).
const SEASONS: [string, string][] = [['undas', '2026-10-31'], ['typhoon', '2026-11-10'], ['christmas', '2026-12-10'], ['newyear', '2026-12-28'], ['heat', '2027-04-15'], ['typhoon-jul', '2027-07-15'], ['none', '2027-02-10']]
for (const [name, day] of SEASONS) {
  for (const w of [390, 360]) {
    test(`${name} ${day} at ${w} px: no overlap between hero, videos and season row`, async ({ page }) => {
      await page.clock.setFixedTime(`${day}T09:00:00+08:00`)
      await page.setViewportSize({ width: w, height: 844 })
      await page.reload()
      await expect(page.getByTestId('dc-learn')).toBeVisible()
      const r = await page.evaluate(() => {
        const box = (id: string) => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom } }
        return { hero: box('dc-hero'), videos: box('dc-videos'), season: box('season-row'), learn: box('dc-learn') }
      })
      const chain = [r.hero, r.videos, r.season, r.learn].filter((x): x is { top: number; bottom: number } => !!x)
      expect(chain.length).toBeGreaterThanOrEqual(3)
      chain.slice(1).forEach((b, i) => expect(b.top - chain[i]!.bottom, `gap ${i}`).toBeGreaterThanOrEqual(0))
      expect(r.videos!.top - r.hero!.bottom, 'hero to videos').toBeLessThanOrEqual(12)
      if (r.season) expect(r.season.top - r.videos!.bottom, 'videos to season').toBeLessThanOrEqual(12)
      if (process.env.D117_SHOTS) for (const sc of ['light', 'dark'] as const) {
        await setScheme(page, sc)
        await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0 })
        await page.waitForTimeout(150)
        await page.screenshot({ path: `${process.env.D117_SHOTS}/top-${name}-${w}-${sc}.png`, animations: 'disabled' })
      }
    })
  }
}

// The shrunk hero poster keeps its play disc: the disc must never paint over the "Watch" chip (the disc sits at the right edge on short screens). Measured, then shot.
for (const [w, h] of [[360, 800], [360, 740], [390, 720], [195, 700], [390, 844]] as const) {
  test(`${w}x${h}: play disc clear of the Watch chip`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.reload()
    await expect(page.getByTestId('dc-hero')).toBeVisible()
    const m = await page.evaluate(() => {
      ;(document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0
      const a = document.querySelector('.dc-hchip')!.getBoundingClientRect()
      const b = document.querySelector('.dc-hero-play')!.getBoundingClientRect()
      return { overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, chip: [a.left, a.top, a.right, a.bottom], disc: [b.left, b.top, b.right, b.bottom] }
    })
    expect(m.overlap, `chip ${m.chip} disc ${m.disc}`).toBe(false)
    if (process.env.D117_SHOTS) await page.screenshot({ path: `${process.env.D117_SHOTS}/hero-chip-${w}x${h}.png`, animations: 'disabled' })
  })
}
