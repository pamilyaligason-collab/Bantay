import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackHitRestAndEnd, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertOrder, assertTargets, assertTextContrast, DISCOVER_ALLOW, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// v13 lane D, ported to the S22 redesign (D-135): the Discover Today view per board S22Discover (Top story, season, Watch hero and row, Learn, Listen, Recipes, Play, fact). News moved to its own tab. Geometry helpers come from e2e/v13.ts.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1]) // 31 Oct, Undas
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 })) // deterministic shots, nothing third-party leaves the test
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-fact')).toBeVisible()
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

// D2: every video card (Top story grid, Health, Farming and DIY, Listen, recipe videos) has a 15 px title in one colour, three lines at most.
test('D2: video card titles are 15 px, one colour, three lines at most', async ({ page }) => {
  const t = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.dc-vc-t')).map((e) => ({ fs: getComputedStyle(e).fontSize, c: getComputedStyle(e).color, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) })))
  expect(t.length).toBeGreaterThanOrEqual(10) // S24: 4 grid + 4 health (daily set) + farm + listen + recipe videos
  t.forEach((x) => { expect(x.fs).toBe('15px'); expect(x.lines).toBeLessThanOrEqual(3) })
  expect(new Set(t.map((x) => x.c)).size, 'one title colour').toBe(1)
})

// D3 (S22, D-135): the read-aloud rows moved to #discover/listen with 44 px play buttons; Today's Listen section is one guided video with a large play poster; News is the second tab of a Today | News | Saved control (44 px tabs).
test('D3: the view tabs are 44 px, the guided video poster is large, the read-aloud play buttons are 44 px', async ({ page }) => {
  const tabs = await page.getByTestId('dc-tabs').getByRole('tab').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, r.width, r.height] as [string, number, number] }))
  expect(tabs.map((t) => t[0])).toEqual(['Today', 'News', 'Saved'])
  tabs.forEach(([, w, h]) => { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44) })
  const g = await page.getByTestId('dc-guided').locator('button.lv-play').boundingBox()
  expect(g!.height, 'guided video poster').toBeGreaterThanOrEqual(150)
  await page.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak() {}, cancel() {} } }); (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = function () {} }) // headless Chromium may have no voice
  await page.goto('/#discover/listen')
  await expect(page.getByTestId('listen')).toBeVisible()
  const b = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('button[aria-label^="Play "]')).filter((e) => !e.closest('[data-testid="listen-guided"], [data-testid="listen-shelf"]')).map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height] }))
  expect(b.length).toBe(20)
  b.forEach(([w, h]) => { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44) })
})

// D4: the first Learn card (Health topics) is purple, drawn in the tint token.
test('D4: the Health topics Learn card is purple and the Jack box is clear at rest', async ({ page }) => {
  const bg = await page.evaluate(() => { const tint = getComputedStyle(document.documentElement).getPropertyValue('--tint-purple').trim(); const probe = document.createElement('i'); probe.style.background = tint; document.body.append(probe); const want = getComputedStyle(probe).backgroundColor; probe.remove(); return { got: getComputedStyle(document.querySelector('[data-testid="dc-learn-topics"]')!).backgroundColor, want } })
  expect(bg.got).toBe(bg.want)
  await assertJackHitRestAndEnd(page, DISCOVER_ALLOW, 'discover D4')
})

// S24 (D-152): Learn and then Top story come before the hero, so the hero poster begins below the Learn grid, within a screen and a half.
test('one hero, starting on the first screen', async ({ page }) => {
  const r = await page.evaluate(() => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement
    const heroes = Array.from(sc.querySelectorAll<HTMLElement>('[data-hero]'))
    return { n: heroes.length, top: heroes[0]!.getBoundingClientRect().top - sc.getBoundingClientRect().top, view: sc.clientHeight }
  })
  expect(r.n, 'exactly one [data-hero]').toBe(1)
  expect(r.top, 'the hero poster begins within a screen and a half').toBeLessThanOrEqual(r.view * 1.5)
})

test('order: Learn, Top stories, hero, Farming and DIY, Listen, the Health pointer, Recipes, Play, fact', async ({ page }) => {
  await assertOrder(page, ['dc-learn', 'dc-top-story', 'dc-hero', 'dc-farm', 'dc-listen', 'dc-health-link', 'dc-recipes', 'dc-play', 'dc-fact'])
})

test('the hero opens Watch and nothing reaches YouTube before a second tap', async ({ page }) => {
  const yt: string[] = []
  page.on('request', (r) => { if (/youtube/.test(r.url())) yt.push(r.url()) })
  await page.reload() // beforeEach already loaded the root; reload so the listener sees that load too
  await expect(page.getByTestId('dc-fact')).toBeVisible()
  const hero = page.getByTestId('dc-hero') // the testid is on the card link itself
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
  await expect(page.getByTestId('dc-learn').getByText('Low-salt recipes', { exact: true })).toBeVisible()
  await expect(page.getByText('Medicines')).toHaveCount(0)
})

/** Today's guided video, with its picture off (the ytimg route answers 404), paints a green gradient that getComputedStyle cannot read. Pin its caption to the stop that is worse for the real --on-green text colour in this theme, so assertTextContrast measures the true pair. */
const pinVideoGradient = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  for (const cap of Array.from(document.querySelectorAll<HTMLElement>('.lv-play[data-thumb="off"] .lv-cap'))) {
    const host = cap.closest('.lv-play')!
    const px = (css: string) => { const p = document.createElement('i'); p.style.background = css; host.append(p); const bg = getComputedStyle(p).backgroundColor; p.remove(); ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = bg; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)) }
    const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!)
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
    const fg = px('var(--on-green)')
    const worst = [px('var(--green2)'), px('var(--green)')].sort((a, b) => ratio(fg, a) - ratio(fg, b))[0]!
    cap.setAttribute('data-contrast-bg', '#' + worst.map((n) => n.toString(16).padStart(2, '0')).join(''))
  }
})

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: targets, no sideways scroll, text contrast, Jack clear`, async ({ page }) => {
    await setScheme(page, scheme)
    await assertTargets(page)
    await assertNoSideways(page)
    await pinVideoGradient(page)
    await assertTextContrast(page)
    await assertJackHitRestAndEnd(page, DISCOVER_ALLOW, `discover ${scheme}`) // D-128 hit test at rest and at the end; the whole-card links of D-135 keep more than half tappable
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
  await expect(page.getByTestId('dc-fact')).toBeVisible()
  const n = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length)
  expect(n, 'infinite animations running under reduced motion').toBe(0)
})

test('shots (V13_SHOTS)', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS=<dir> to write shots')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByTestId('dc-fact')).toBeVisible()
  await shotsLightDark(page, 'discover')
  await page.getByTestId('dc-hero').click() // the tapped video is what Watch shows
  await expect(page.getByTestId('watch-player')).toBeVisible()
  await shotsLightDark(page, 'watch')
  for (const [route, name, id] of [['#discover/listen', 'listen', 'listen'], ['#discover/play', 'play', 'play-hub'], ['#discover/play/memory', 'memory', 'memory'], ['#discover/play/wordsearch', 'wordsearch', 'wordsearch'], ['#discover/play/facts', 'facts', 'facts']] as const) {
    await page.goto('/' + route)
    await expect(page.getByTestId(id)).toBeVisible()
    await shotsLightDark(page, name)
  }
})
