import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { FIXED_CLOCKS, setScheme } from './v13'

// v13 visual lane VD: measured assertions for what the Opus visual check found wrong (Discover, Word search, Fun facts, Calm).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1]) // 31 Oct, Undas
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 }))
})

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: hero label is a slim pill, Play discs are filled (S22: the read-aloud rows moved to #discover/listen, Today's Listen is a guided video)`, async ({ page }) => {
    await page.goto('/#discover')
    await expect(page.getByTestId('dc-fact')).toBeVisible()
    await setScheme(page, scheme)
    const m = await page.evaluate(() => {
      const chip = document.querySelector('.dc-hchip')!.getBoundingClientRect()
      const play = document.querySelector('[data-testid="dc-hero"] .dc-hero-play') as HTMLElement
      const guided = getComputedStyle(document.querySelector('[data-testid="dc-guided"] button.lv-play') as HTMLElement)
      return { chipH: chip.height, play: getComputedStyle(play).backgroundColor, guided: guided.backgroundColor !== 'rgba(0, 0, 0, 0)' || guided.backgroundImage !== 'none' }
    })
    expect(m.chipH, 'chip height').toBeLessThanOrEqual(34)
    expect(m.play, 'hero play disc filled').not.toBe('rgba(0, 0, 0, 0)')
    expect(m.guided, 'guided video poster filled').toBe(true)
  })

  for (const w of [390, 360, 195]) {
    test(`${scheme} ${w}: every Word search letter cell sits inside the card`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto('/#discover/play/wordsearch')
      await expect(page.locator('.fp-cell')).toHaveCount(64)
      await setScheme(page, scheme)
      const r = await page.evaluate(() => {
        const g = document.querySelector('.fp-ws')!.getBoundingClientRect()
        const sc = document.querySelector('.bt .scroll') as HTMLElement
        const cells = Array.from(document.querySelectorAll('.fp-cell > span')).map((e) => e.getBoundingClientRect())
        const scrolls = (document.querySelector('.fp-ws') as HTMLElement).scrollWidth > (document.querySelector('.fp-ws') as HTMLElement).clientWidth
        const gl = (document.querySelector('.fp-ws') as HTMLElement); const first = (document.querySelector('.fp-cell') as HTMLElement).getBoundingClientRect(); const reach = first.left >= g.left - 0.5 && gl.scrollLeft === 0
        return { reach, out: scrolls ? 0 : cells.filter((c) => c.left < g.left - 0.5 || c.right > g.right + 0.5 || c.right > innerWidth - 4).length,  wide: sc.scrollWidth > sc.clientWidth + 1 }
      })
      expect(r.reach, 'first column reachable at scroll 0').toBe(true)
      expect(r.out, 'cells outside the card').toBe(0)
      expect(r.wide, 'sideways scroll').toBe(false)
    })
  }
}

test('Word search: Done for now clears the tab bar once scrolled to the end', async ({ page }) => {
  await page.goto('/#discover/play/wordsearch')
  await page.getByRole('button', { name: 'Done for now' }).scrollIntoViewIfNeeded()
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll')!; s.scrollTo(0, s.scrollHeight) })
  const g = await page.evaluate(() => ({ b: document.querySelector('.sh-primary.sh-block')!.getBoundingClientRect().bottom, t: document.querySelector('nav.tabbar')!.getBoundingClientRect().top }))
  expect(g.b).toBeLessThanOrEqual(g.t)
})

test('Fun facts uses the shared sub-page header and the app font', async ({ page }) => {
  await page.goto('/#discover/play/facts')
  await expect(page.getByRole('heading', { level: 1, name: 'Fun facts' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Play' })).toBeVisible()
  await expect(page.locator('.fp-head')).toHaveCount(0)
  const fonts = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,b')).map((e) => getComputedStyle(e).fontFamily))
  expect(fonts.some((f) => /georgia/i.test(f))).toBe(false)
})

test('Watch heading uses the app font', async ({ page }) => {
  await page.goto('/#discover/watch')
  const f = await page.locator('.dc-sh h2').first().evaluate((e) => getComputedStyle(e).fontFamily)
  expect(f).not.toMatch(/georgia/i)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme} Calm: orb hero near 180, white label on the navy page, pills, faces, no cream under the tab bar`, async ({ page }) => {
    await page.goto('/#calm')
    await expect(page.getByTestId('calm-hero')).toBeVisible()
    await setScheme(page, scheme)
    const m = await page.evaluate(() => {
      const bo = document.querySelector('[data-testid="calm-hero"] .bo')!.getBoundingClientRect()
      const lab = getComputedStyle(document.querySelector('.cm-hero .bo-label')!).color
      const pill = document.querySelector('.cm-hero .segd > button')!.getBoundingClientRect()
      const segBg = getComputedStyle(document.querySelector('.cm-hero .segd')!).backgroundColor
      const faces = Array.from(document.querySelectorAll('.cm-face svg')).length
      return { w: bo.width, lab, ph: pill.height, segBg, faces, bt: getComputedStyle(document.querySelector('.bt')!).backgroundColor }
    })
    expect(m.w).toBeGreaterThanOrEqual(180)
    expect(m.lab, 'D-135: the idle orb carries no words (label hidden); its colour is white on the navy page').toBe('rgb(255, 255, 255)')
    expect(m.ph).toBeGreaterThanOrEqual(44)
    expect(m.segBg).toBe('rgba(0, 0, 0, 0)')
    expect(m.faces).toBe(4)
    expect(m.bt).toBe('rgb(14, 27, 58)') // D-135: deep navy, no cream under the tab bar
  })
}
