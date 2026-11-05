import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertJackClear, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertOrder, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// v13 lane D: the Discover overview per board Discover (video hero, two videos, season, Learn, Listen, Play, fact, News). Geometry helpers come from e2e/v13.ts.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1]) // 31 Oct, Undas
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 })) // deterministic shots, nothing third-party leaves the test
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-news')).toBeVisible()
})

test('header: Discover is the h1 and the kicker is not empty', async ({ page }) => {
  const head = page.getByTestId('dc-head')
  await expect(head.getByRole('heading', { level: 1 })).toHaveText('Discover')
  await expect(head.locator('.lt-kicker')).not.toBeEmpty()
})

// D1: the hero is a full-width 16:9 poster with a 56 px play disc.
test('D1: hero poster is the scroller width minus 32, at least 190 tall, play disc at least 56', async ({ page }) => {
  const m = await page.evaluate(() => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement
    const p = document.querySelector('[data-hero] .dc-poster-box')!.getBoundingClientRect()
    const d = document.querySelector('[data-hero] .dc-hero-play')!.getBoundingClientRect()
    return { sc: sc.clientWidth, w: p.width, h: p.height, dw: d.width, dh: d.height }
  })
  expect(Math.abs(m.w - (m.sc - 32)), 'poster width').toBeLessThanOrEqual(1)
  expect(m.h, 'poster height').toBeGreaterThanOrEqual(190)
  expect(Math.min(m.dw, m.dh), 'play disc').toBeGreaterThanOrEqual(56)
})

// D2: the two more videos (and the Be prepared cards) have a 15 px title in one colour, three lines at most.
test('D2: video card titles are 15 px, one colour, three lines at most', async ({ page }) => {
  const t = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.dc-vc-t')).map((e) => ({ fs: getComputedStyle(e).fontSize, c: getComputedStyle(e).color, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) })))
  expect(t.length).toBe(5) // the two more videos and the three Be prepared cards
  t.forEach((x) => { expect(x.fs).toBe('15px'); expect(x.lines).toBeLessThanOrEqual(3) })
  expect(new Set(t.map((x) => x.c)).size, 'one title colour').toBe(1)
})

// D3: three Listen rows with 44 px play buttons (the phone needs a voice for them to show).
test('D3: Listen rows have 44 px play buttons; the section is called News', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak() {}, cancel() {} } }); (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = function () {} }) // headless Chromium may have no voice
  await page.reload()
  await expect(page.getByTestId('dc-news')).toBeVisible()
  await expect(page.getByTestId('dc-news').getByRole('heading', { level: 2 })).toHaveText('News')
  const b = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="dc-listen"] button[aria-label^="Play "]')).map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height] }))
  expect(b.length).toBe(3)
  b.forEach(([w, h]) => { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44) })
})

// D4: the season card is amber.
test('D4: the season card is amber and the Jack box is clear at rest', async ({ page }) => {
  const bg = await page.evaluate(() => { const tint = getComputedStyle(document.documentElement).getPropertyValue('--tint-amber').trim(); const probe = document.createElement('i'); probe.style.background = tint; document.body.append(probe); const want = getComputedStyle(probe).backgroundColor; probe.remove(); return { got: getComputedStyle(document.querySelector('[data-testid="season-row"]')!).backgroundColor, want } })
  expect(bg.got).toBe(bg.want)
  await assertJackClear(page, { at: 'rest' })
})

test('one hero near the top', async ({ page }) => { await assertHero(page) })

test('order: video, two videos, season, Learn, Listen, Play, fact, News', async ({ page }) => {
  await assertOrder(page, ['dc-hero', 'dc-videos', 'season-row', 'dc-learn', 'dc-listen', 'dc-play', 'dc-fact', 'dc-news'])
})

test('the hero opens Watch and nothing reaches YouTube before a second tap', async ({ page }) => {
  const yt: string[] = []
  page.on('request', (r) => { if (/youtube/.test(r.url())) yt.push(r.url()) })
  await page.reload() // beforeEach already loaded the root; reload so the listener sees that load too
  await expect(page.getByTestId('dc-news')).toBeVisible()
  const hero = page.getByTestId('dc-hero').getByRole('link')
  await expect(hero).toHaveAttribute('href', '#discover/watch')
  await hero.click()
  await expect(page).toHaveURL(/#discover\/watch$/)
  await expect(page.getByTestId('watch-player')).toBeVisible()
  expect(yt, 'no youtube.com request before a second tap').toEqual([])
})

test('links: All topics, Memory and the fact card land on their screens', async ({ page }) => {
  await page.getByRole('link', { name: 'All topics' }).click()
  await expect(page).toHaveURL(/#discover\/learn$/)
  await expect(page.getByTestId('learn-home')).toBeVisible()
  await page.goto('/#discover')
  await page.getByTestId('dc-play').getByRole('link', { name: /Memory/ }).click()
  await expect(page).toHaveURL(/#discover\/play\/memory$/)
  await expect(page.getByTestId('memory')).toBeVisible()
  await page.goto('/#discover')
  await page.getByTestId('dc-fact').click()
  await expect(page).toHaveURL(/#discover\/play\/facts$/)
  await expect(page.getByTestId('facts')).toBeVisible()
})

test('flag off: no Medicines row', async ({ page }) => {
  await expect(page.getByTestId('dc-learn').getByText('Recipes', { exact: true })).toBeVisible()
  await expect(page.getByText('Medicines')).toHaveCount(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: targets, no sideways scroll, text contrast, Jack clear`, async ({ page }) => {
    await setScheme(page, scheme)
    await assertTargets(page)
    await assertNoSideways(page)
    await assertTextContrast(page)
    await assertJackClear(page) // at rest and at the end
  })
}

test('195 px (200% text zoom)', async ({ page }) => { await assertNarrow(page) })

test('360 px: targets, no sideways scroll, no wrapped buttons', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await assertTargets(page)
  await assertNoSideways(page)
  await assertNoWrappedButtons(page)
})

test('reduced motion: no infinite animation keeps running', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByTestId('dc-news')).toBeVisible()
  const n = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length)
  expect(n, 'infinite animations running under reduced motion').toBe(0)
})

test('shots (V13_SHOTS)', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS=<dir> to write shots')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByTestId('dc-news')).toBeVisible()
  await shotsLightDark(page, 'discover')
  await page.getByTestId('dc-hero').getByRole('link').click() // the tapped video is what Watch shows
  await expect(page.getByTestId('watch-player')).toBeVisible()
  await shotsLightDark(page, 'watch')
  for (const [route, name, id] of [['#discover/listen', 'listen', 'listen'], ['#discover/play', 'play', 'play-hub'], ['#discover/play/memory', 'memory', 'memory'], ['#discover/play/wordsearch', 'wordsearch', 'wordsearch'], ['#discover/play/facts', 'facts', 'facts']] as const) {
    await page.goto('/' + route)
    await expect(page.getByTestId(id)).toBeVisible()
    await shotsLightDark(page, name)
  }
})
