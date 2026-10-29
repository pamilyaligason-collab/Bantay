import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S15 lane L1: the Ask hint sits above Jack, and at 200% text (195 px) the tab bar and titles stay readable.
// Shots are written only when S15_L1_SHOTS=<dir> is set, so a plain run leaves the tree clean (ML-32).
const SHOTS = process.env.S15_L1_SHOTS
test.use({ serviceWorkers: 'block' })

for (const width of [375, 195]) for (const scheme of ['light', 'dark'] as const) {
  test(`shell at ${width}px ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.emulateMedia({ colorScheme: scheme })
    await skipOnboarding(page)
    await page.goto('/#today')
    const hint = page.getByText(/Ask me anything/)
    await expect(hint).toBeVisible()
    const h = (await hint.boundingBox())!
    expect(h.x).toBeGreaterThanOrEqual(0)
    expect(h.x + h.width).toBeLessThanOrEqual(width)
    const tabs = page.locator('.sh-tabs button')
    const labels = await tabs.evaluateAll((els) => els.map((b) => { const s = b.querySelector(':scope > span:not(.sh-tabbadge)'); return s && getComputedStyle(s).display !== 'none' ? s.textContent : null }))
    if (width < 300) expect(labels.filter(Boolean)).toEqual(['Today']) // only the active tab keeps its label
    else expect(labels).toEqual(['Today', 'Health', 'Discover', 'Family', 'Safety'])
    for (const t of ['Today', 'Health', 'Discover', 'Family', 'Safety']) await expect(page.getByRole('button', { name: t, exact: true })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-${width}-${scheme}.png` })
    await page.goto('/#health/labs')
    await page.waitForTimeout(300)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/labs-${width}-${scheme}.png` })
  })
}
