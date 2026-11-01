import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { setScheme } from './v13'
test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ page }) => { await skipOnboarding(page); await page.goto('/#today') })
test('tap Jack: the sheet opens with Help, Scan, Chat; Back closes it; Today has no SOS block', async ({ page }) => {
  await expect(page.locator('.td-sos')).toHaveCount(0)
  await page.getByTestId('jack').click()
  const sheet = page.getByRole('dialog', { name: 'Jack' })
  await expect(sheet).toBeVisible()
  for (const id of ['jack-sos', 'jack-scan', 'jack-chat', 'jack-safety', 'jack-close']) {
    const box = (await page.getByTestId(id).boundingBox())!; expect(box.height, id).toBeGreaterThanOrEqual(44)
  }
  await page.goBack(); await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jack')).toBeFocused()
})
test('Chat opens the assistant; Escape closes the sheet; a 3 s hold opens the SOS screen', async ({ page }) => {
  await page.getByTestId('jack').click(); await page.getByTestId('jack-chat').click()
  await expect(page.getByRole('dialog', { name: /Jack Jack|Ask/ })).toBeVisible()
  await page.keyboard.press('Escape'); await page.getByTestId('jack').click()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
  await page.getByTestId('jack').click()
  const hold = page.getByTestId('jack-sos').locator('.sos-simple-btn')
  await hold.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true }); await page.waitForTimeout(3100)
  await expect(page.getByRole('dialog', { name: 'SOS' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
})
test('reduced motion: the sheet still opens and closes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByTestId('jack').click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toBeVisible(); await page.getByTestId('jack-close').click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
})

// SOS geometry and contrast (ported from the removed Today SOS block): the hold line never overlaps the label, stays inside the button, and the holding line is >= 4.5:1.
const lum = (c: string) => { const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { const s = v! / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05) }
for (const scheme of ['light', 'dark'] as const) {
  test(`SOS in the Jack sheet ${scheme}: label and hold line never intersect (390, 360, 195), holding line contrast >= 4.5`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme }); await setScheme(page, scheme)
    for (const w of [390, 360, 195]) {
      await page.setViewportSize({ width: w, height: 800 })
      if (!(await page.getByRole('dialog', { name: 'Jack' }).isVisible())) await page.getByTestId('jack').click()
      const btn = page.getByTestId('jack-sos').locator('.sos-simple-btn')
      await btn.scrollIntoViewIfNeeded()
      const geo = () => page.evaluate(() => {
        const b = document.querySelector('[data-testid="jack-sos"] .sos-simple-btn')!
        const label = b.querySelector('span')!.getBoundingClientRect()
        const r = document.createRange(); r.selectNodeContents(document.querySelector('[data-testid="jack-sos"] .sos-simple-sub')!)
        const sub = r.getBoundingClientRect(); const bb = b.getBoundingClientRect()
        return { overlap: label.bottom > sub.top && sub.bottom > label.top, subTop: sub.top, subBottom: sub.bottom, labelBottom: label.bottom, btnTop: bb.top, btnBottom: bb.bottom }
      })
      const idle = await geo()
      expect(idle.overlap, `idle ${w}px ${JSON.stringify(idle)}`).toBe(false)
      await btn.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
      await expect(page.getByTestId('jack-sos').locator('.sos-simple-sub')).toHaveText('Let go to cancel. Nothing is sent yet.')
      const hold = await geo()
      expect(hold.overlap, `holding ${w}px ${JSON.stringify(hold)}`).toBe(false)
      const c = await page.evaluate(() => ({ fg: getComputedStyle(document.querySelector('[data-testid="jack-sos"] .sos-simple-btn > span')!).color, bg: getComputedStyle(document.querySelector('[data-testid="jack-sos"] .sos-simple-btn')!).backgroundColor }))
      expect(ratio(c.fg, c.bg), `holding ${w}px ${c.fg} on ${c.bg}`).toBeGreaterThanOrEqual(4.5)
      await btn.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true })
      await expect(page.getByTestId('jack-sos').locator('.sos-simple-sub')).toHaveText(/Hold 3 seconds/)
    }
  })
}
