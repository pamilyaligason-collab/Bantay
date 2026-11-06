import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Compliance lane CD: Discover and Calm against boards Discover and Mindful. Full-page shots (the viewport grows to the scroller's content) plus measured assertions.
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const flagOn = async (page: Page, key: string) => {
  await page.evaluate((k) => new Promise<void>((res, rej) => {
    const o = indexedDB.open('bantay')
    o.onerror = () => rej(o.error)
    o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ key: k, value: true }); tx.oncomplete = () => { o.result.close(); res() }; tx.onerror = () => rej(tx.error) }
  }), key)
  await page.reload()
}

async function full(page: Page, name: string) {
  const dir = process.env.V13_SHOTS
  if (!dir) return
  const vp = page.viewportSize()!
  const h = await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement; return s.scrollHeight + (window.innerHeight - s.clientHeight) })
  await page.setViewportSize({ width: vp.width, height: h })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' })
  await page.setViewportSize(vp)
}

for (const w of [390, 360]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`shots discover ${w} ${scheme}`, async ({ page }) => {
      test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS')
      await page.setViewportSize({ width: w, height: 844 })
      await page.clock.setFixedTime(FIXED_CLOCKS[1])
      await skipOnboarding(page)
      await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 }))
      await page.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak() {}, cancel() {} } }); (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = function () {} })
      await page.goto('/#discover')
      await flagOn(page, 'learn.medcards')
      await expect(page.getByTestId('dc-fact')).toBeVisible()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await setScheme(page, scheme)
      await full(page, `discover-${w}-${scheme}`)
    })
    test(`shots calm ${w} ${scheme}`, async ({ page }) => {
      test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS')
      await page.setViewportSize({ width: w, height: 844 })
      await page.clock.setFixedTime(FIXED_CLOCKS[1])
      await skipOnboarding(page)
      await page.goto('/#calm')
      await expect(page.getByTestId('calm-media')).toBeVisible()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await setScheme(page, scheme)
      await full(page, `calm-${w}-${scheme}`)
    })
  }
}

// Measured checks (no env needed).
test('Discover: search button 44 px, Learn is four tinted cards in two columns (S22, D-135), Play tiles tinted with no kicker', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 }))
  await page.goto('/#discover')
  await flagOn(page, 'learn.medcards')
  await expect(page.getByTestId('dc-fact')).toBeVisible()
  const m = await page.evaluate(() => {
    const r = (e: Element) => e.getBoundingClientRect()
    const sc = document.querySelector('.bt .scroll') as HTMLElement
    const search = r(document.querySelector('[data-testid="dc-search"]')!)
    const cards = [...document.querySelectorAll('[data-testid="dc-learn"] .dc-lc')].map((c) => ({ w: r(c).width, left: r(c).left, bg: getComputedStyle(c).backgroundColor }))
    const play = [...document.querySelectorAll('[data-testid="dc-play"] .card.pt')].map((c) => ({ bg: getComputedStyle(c).backgroundColor, k: c.querySelector('.pt-k') !== null, a: c.querySelector('.pt-a') !== null }))
    return { search: [search.width, search.height], sw: sc.clientWidth, cards, play, sideways: sc.scrollWidth - sc.clientWidth }
  })
  expect(Math.min(...m.search)).toBeGreaterThanOrEqual(44)
  expect(m.cards.length).toBe(4) // Health topics, Be prepared, Recipes and (flag on) Medicines
  m.cards.forEach((c) => { expect(Math.abs(c.w - (m.sw - 32 - 12) / 2), 'two equal columns').toBeLessThanOrEqual(2); expect(c.bg).not.toBe('rgba(0, 0, 0, 0)') })
  expect(new Set(m.cards.map((c) => Math.round(c.left))).size, 'two columns').toBe(2)
  expect(new Set(m.cards.map((c) => c.bg)).size, 'four different tints').toBe(4)
  m.play.forEach((p) => { expect(p.k || p.a).toBe(false); expect(p.bg).not.toBe('rgba(0, 0, 0, 0)') })
  expect(m.sideways).toBeLessThanOrEqual(0)
})

test('Word search: every cell is 44 px or more at 390 and 360, and the grid scrolls inside itself at 195', async ({ page }) => {
  await skipOnboarding(page)
  for (const w of [390, 360]) {
    await page.setViewportSize({ width: w, height: 740 })
    await page.goto('/#discover/play/wordsearch')
    await expect(page.getByTestId('wordsearch')).toBeVisible()
    const m = await page.evaluate(() => { const cs = [...document.querySelectorAll('.fp-cell')].map((c) => c.getBoundingClientRect()); const sc = document.querySelector('.bt .scroll') as HTMLElement; return { min: Math.min(...cs.map((c) => Math.min(c.width, c.height))), vw: window.innerWidth, over: sc.scrollWidth - sc.clientWidth, lastRight: Math.max(...cs.map((c) => c.right)) } })
    expect(m.min, `cell at ${w}`).toBeGreaterThanOrEqual(43.5)
    expect(m.lastRight, `last column inside the screen at ${w}`).toBeLessThanOrEqual(m.vw)
    expect(m.over).toBeLessThanOrEqual(0)
  }
  await page.setViewportSize({ width: 195, height: 740 })
  await page.goto('/#discover/play/wordsearch')
  await expect(page.getByTestId('wordsearch')).toBeVisible()
  const n = await page.evaluate(() => { const g = document.querySelector('.fp-ws') as HTMLElement; const sc = document.querySelector('.bt .scroll') as HTMLElement; return { min: Math.min(...[...document.querySelectorAll('.fp-cell')].map((c) => c.getBoundingClientRect().width)), scrolls: g.scrollWidth > g.clientWidth, pageOver: sc.scrollWidth - sc.clientWidth } })
  expect(n.min).toBeGreaterThanOrEqual(43.5)
  expect(n.scrolls).toBe(true)
  const reach = await page.evaluate(() => { const g = document.querySelector('.fp-ws') as HTMLElement; const cells = [...g.querySelectorAll('.fp-cell')].map((c) => c as HTMLElement); const gl = g.getBoundingClientRect().left; const first = cells[0]!.getBoundingClientRect().left >= gl - 0.5; g.scrollLeft = g.scrollWidth; const last = cells[7]!.getBoundingClientRect().right <= g.getBoundingClientRect().right + 0.5; return { first, last } })
  expect(reach.first, 'first column reachable').toBe(true)
  expect(reach.last, 'last column reachable after scrolling').toBe(true)
  expect(n.pageOver).toBeLessThanOrEqual(0)
})

test('Calm at 195 and 320: pills and faces stay inside the hero and card', async ({ page }) => {
  await skipOnboarding(page)
  for (const w of [320, 195]) {
    await page.setViewportSize({ width: w, height: 740 })
    await page.goto('/#calm')
    await expect(page.getByTestId('calm-hero')).toBeVisible()
    const m = await page.evaluate(() => { const h = document.querySelector('[data-testid="calm-hero"]')!.getBoundingClientRect(); const c = document.querySelector('[data-testid="calm-mood"] .cm-mood')!.getBoundingClientRect(); const pr = [...document.querySelectorAll('[data-testid="calm-pattern"] button')].map((b) => b.getBoundingClientRect().right); const fr = [...document.querySelectorAll('[data-testid="calm-mood"] button[aria-label]')].map((b) => b.getBoundingClientRect().right); return { pill: Math.max(...pr) <= h.right + 0.5, face: Math.max(...fr) <= c.right + 0.5 } })
    expect(m.pill, `pills inside hero at ${w}`).toBe(true)
    expect(m.face, `faces inside card at ${w}`).toBe(true)
  }
})

test('Calm: board pill words, the dashed coming pill is disabled, mood words are the board words', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await page.goto('/#calm')
  await expect(page.getByTestId('calm-hero')).toBeVisible()
  const pills = page.getByTestId('calm-pattern').getByRole('button')
  await expect(pills).toHaveText(['Relax · in 4, out 6', 'Calm box · 4-4-4-4', 'Sleep 4-7-8 · coming'])
  await expect(pills.nth(2)).toBeDisabled()
  await expect(page.getByTestId('calm-mood').locator('button[aria-label]')).toHaveText(['Good', 'Okay', 'Low', 'Unwell'])
  const m = await page.evaluate(() => [...document.querySelectorAll('[data-testid="calm-pattern"] button, [data-testid="calm-length"] button')].map((b) => b.getBoundingClientRect().height))
  m.forEach((h) => expect(h).toBeGreaterThanOrEqual(44))
  const ys = await page.getByTestId('calm-mood').locator('button[aria-label]').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)))
  expect(new Set(ys).size, 'four faces on one row at 360').toBe(1)
})

test('shots wordsearch 360', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS')
  await skipOnboarding(page)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/#discover/play/wordsearch')
  await expect(page.getByTestId('wordsearch')).toBeVisible()
  await full(page, 'wordsearch-360-light')
})
