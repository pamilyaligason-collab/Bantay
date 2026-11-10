import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { expectJackAtRest, FIXED_CLOCKS, layoutStable } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S15 lane L1: the Ask hint sits above Jack and never covers text, and at 200% text (195 px) the tab bar and titles stay readable.
// Shots are written only when S15_L1_SHOTS=<dir> is set, so a plain run leaves the tree clean (ML-32).
const SHOTS = process.env.S15_L1_SHOTS
test.use({ serviceWorkers: 'block' })

/** Page text rects (and the SOS section) that the hint box touches; empty when it is clear. */
const overlaps = (page: Page) => page.evaluate(() => {
  const h = document.querySelector('.sh-hint')!.getBoundingClientRect()
  const hit = (r: DOMRect) => r.width > 0 && h.left < r.right && h.right > r.left && h.top < r.bottom && h.bottom > r.top
  const out: string[] = []
  const w = document.createTreeWalker(document.querySelector('.bt .scroll')!, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.nodeValue?.trim()) continue
    range.selectNodeContents(n)
    if (Array.from(range.getClientRects()).some(hit)) out.push((n.nodeValue ?? '').trim().slice(0, 40))
  }
  return out
})
const shown = (page: Page) => page.locator('.sh-hint').evaluate((el) => getComputedStyle(el).visibility !== 'hidden')

for (const [width, height] of [[375, 600], [375, 667], [360, 640], [375, 800]] as const) {
  test(`Jack hint stays clear of page text at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await skipOnboarding(page)
    await page.goto('/#today')
    await expect(page.locator('.td-sos')).toHaveCount(0)
    await expect(page.locator('.sh-hint')).toBeAttached()
    // shown only where it fits; otherwise hidden, never drawn over text
    if (await shown(page)) expect(await overlaps(page)).toEqual([])
    else expect(await page.locator('.sh-hint').getAttribute('role')).toBe('status')
  })
}

for (const width of [375, 195]) for (const scheme of ['light', 'dark'] as const) {
  test(`shell at ${width}px ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.emulateMedia({ colorScheme: scheme })
    await skipOnboarding(page)
    await page.goto('/#today')
    await expect(page.locator('.sh-hint')).toBeAttached()
    if (await shown(page)) {
      const h = (await page.locator('.sh-hint').boundingBox())!
      expect(h.x).toBeGreaterThanOrEqual(0)
      expect(h.x + h.width).toBeLessThanOrEqual(width)
    }
    const tabs = page.locator('.sh-tabs button')
    const labels = await tabs.evaluateAll((els) => els.map((b) => { const s = b.querySelector(':scope > span:not(.sh-tabbadge)'); return s && getComputedStyle(s).display !== 'none' ? s.textContent : null }))
    if (width < 300) expect(labels.filter(Boolean)).toEqual(['Today']) // only the active tab keeps its label
    else expect(labels).toEqual(['Today', 'Health', 'Discover', 'Family', 'Safety'])
    for (const t of ['Today', 'Health', 'Discover', 'Family', 'Safety']) await expect(page.getByRole('button', { name: t, exact: true })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-${width}-${scheme}.png` })
  })
}

// S29 fix round 2: with the weather card open (Full forecast and its chevron on screen) at 360 x 780, Jack at rest, the hint bubble does not cover the chevron (it hides itself), and Jack does not either.
test.describe('Full forecast chevron', () => {
  test.use({ viewport: { width: 360, height: 780 }, timezoneId: 'Asia/Manila' })
  test('the Jack hint bubble and Jack leave the Full forecast chevron uncovered at rest', async ({ page }) => {
    await page.clock.setFixedTime(FIXED_CLOCKS[1])
    await skipOnboarding(page)
    const now = new Date(FIXED_CLOCKS[1])
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
    await page.goto('/#today')
    const full = page.locator('.td-wxh-full')
    await expect(full).toBeVisible() // the card is open: the chevron is there
    await expect(page.locator('.sh-hint')).toBeAttached() // the hint is in play, so the check below means something
    await layoutStable(page)
    await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0 })
    await expectJackAtRest(page, 'Today')
    const m = await page.evaluate(() => {
      const chev = document.querySelector('.td-wxh-full svg')!.getBoundingClientRect()
      const hint = document.querySelector('.sh-hint') as HTMLElement
      const h = hint.getBoundingClientRect(), f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
      const cx = chev.left + chev.width / 2, cy = chev.top + chev.height / 2
      const inside = (r: DOMRect) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
      const link = document.querySelector('.td-wxh-full')!
      return { hintShown: getComputedStyle(hint).visibility !== 'hidden', hintOnChevron: inside(h) || (h.left < chev.right && h.right > chev.left && h.top < chev.bottom && h.bottom > chev.top), jackOnChevron: inside(f), tapHitsLink: document.elementFromPoint(cx, cy)?.closest('.td-wxh-full') === link, onScreen: cy > 0 && cy < innerHeight }
    })
    expect(m.onScreen, 'the chevron is on screen').toBe(true)
    expect(m.hintOnChevron && m.hintShown, 'a visible hint bubble does not cover the chevron').toBe(false)
    expect(m.jackOnChevron, 'Jack is not on the chevron').toBe(false)
    expect(m.tapHitsLink, 'a tap on the chevron centre reaches the Full forecast link').toBe(true)
    const dir = process.env.S29_SHOTS
    if (dir) await page.screenshot({ path: `${dir}/Today-fullforecast-360x780.png`, animations: 'disabled' })
  })
})
