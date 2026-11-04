import { expect, test } from '@playwright/test'

// Lane CS (D-115): Safety matches the board where it can. Measured values; nothing here uses real data.
test('first aid tiles are 132 px and carry distinct per-topic tints; one Sources link; Offline maps row is listed', async ({ page }) => {
  await page.goto('/#safety')
  const tiles = page.locator('.sf-fa')
  await expect(tiles).toHaveCount(4)
  const w = await tiles.evaluateAll((els) => els.map((e) => ({ w: Math.round(e.getBoundingClientRect().width), bg: getComputedStyle(e).backgroundColor })))
  expect(w.every((t) => t.w === 132)).toBe(true)
  expect(new Set(w.map((t) => t.bg)).size).toBeGreaterThanOrEqual(3) // red, amber, purple
  await expect(page.getByRole('link', { name: 'Sources', exact: true })).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Be ready' }).getByRole('link', { name: /^Offline maps/ })).toContainText('Not ready yet')
})

test('Call 911 stays solid red with white text', async ({ page }) => {
  await page.goto('/#safety')
  const s = await page.getByRole('link', { name: 'Call 911' }).evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }))
  expect(s.fg).toBe('rgb(255, 255, 255)')
  expect(s.bg).toBe('rgb(200, 55, 45)')
})
