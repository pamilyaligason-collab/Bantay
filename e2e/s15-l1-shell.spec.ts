import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

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
  const sos = document.querySelector('.td-sos')
  if (sos && hit(sos.getBoundingClientRect())) out.push('.td-sos')
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
  test(`Ask hint stays clear of the SOS caption and page text at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await skipOnboarding(page)
    await page.goto('/#today')
    await expect(page.locator('.td-sos')).toBeVisible()
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
