import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertTargets, setScheme } from './v13'
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
test('Open Safety in the Cannot hold sentence closes the sheet and lands on #safety with Call 911', async ({ page }) => {
  await page.getByTestId('jack').click()
  await page.getByTestId('jack-safety').getByRole('link', { name: 'Open Safety' }).click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
  await expect(page).toHaveURL(/#safety/)
  await expect(page.getByText(/Call 911/).first()).toBeVisible()
})
test('the SOS block keeps its height while held', async ({ page }) => {
  await page.getByTestId('jack').click()
  const hold = page.getByTestId('jack-sos').locator('.sos-simple-btn')
  const idle = (await hold.boundingBox())!.height
  await hold.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
  await expect(page.getByTestId('jack-sos-ring')).toBeVisible()
  expect(Math.abs((await hold.boundingBox())!.height - idle), 'height while holding').toBeLessThanOrEqual(1)
  await hold.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true })
})
test('Chat opens the assistant; Escape closes the sheet; a 3 s hold opens the SOS screen', async ({ page }) => {
  await page.getByTestId('jack').click(); await page.getByTestId('jack-chat').click()
  await expect(page.getByRole('dialog', { name: /Jack Jack|Ask/ })).toBeVisible()
  await page.keyboard.press('Escape'); await page.getByTestId('jack').click()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
  await page.getByTestId('jack').click()
  const hold = page.getByTestId('jack-sos').locator('.sos-simple-btn')
  await hold.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
  await expect(page.getByRole('dialog', { name: 'SOS' })).toBeVisible({ timeout: 8000 }) // the 3 s hold completes on its own timer
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
})
test('J1: Try saying chips prefill the box, no Upload row, targets >= 44 inside the sheet, a ring shows during a hold', async ({ page }) => {
  await page.getByTestId('jack').click()
  const sheet = page.getByRole('dialog', { name: 'Jack' }); await expect(sheet).toBeVisible()
  await assertTargets(page)
  await expect(page.getByTestId('jack-upload')).toHaveCount(0) // Scan takes a gallery photo; board JackSheet has no Upload row
  const hold = page.getByTestId('jack-sos').locator('.sos-simple-btn')
  await hold.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
  await expect(page.getByTestId('jack-sos-ring')).toBeVisible()
  await hold.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true }) // D-137: a quick pointerup is a tap (family sheet); cancel ends the hold only
  await expect(page.getByTestId('jack-sos-ring')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Log my BP' }).click()
  await expect(page.getByRole('dialog', { name: /Jack Jack|Ask/ })).toBeVisible()
  await expect(page.getByRole('dialog', { name: /Jack Jack|Ask/ }).locator('input')).toHaveValue('Log my blood pressure')
})
// D-137 short tap: made-up family cached on the phone (the Contact family sheet lists everyone but me).
const FAMILY = [{ personId: 'p-ate-joy', displayName: 'Ate Joy' }, { personId: 'p-papa-ben', displayName: 'Papa Ben' }]
const familySheet = (page: Page) => page.getByRole('dialog', { name: 'Contact family' })
test.describe('SOS short tap opens Contact family (D-137)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((f) => localStorage.setItem('bantay.family', JSON.stringify(f)), FAMILY)
    await page.reload() // the outer beforeEach already loaded the page; a hash-only goto would not run the init script
    await page.getByTestId('jack').click()
    await expect(page.getByRole('dialog', { name: 'Jack' })).toBeVisible()
  })
  test('a tap under 400 ms opens the family sheet, it stays open after 1 s, and one Back closes it', async ({ page }) => {
    const hold = page.getByTestId('jack-sos').locator('.sos-simple-btn')
    await hold.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
    await hold.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true }) // back to back: well under 400 ms
    await expect(familySheet(page)).toBeVisible()
    await expect(familySheet(page).getByText('Ate Joy')).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'SOS' })).toHaveCount(0)
    await page.waitForTimeout(1000) // a negative check has no state to wait on: a regression closed the sheet through history.back() within this time
    await expect(familySheet(page)).toBeVisible()
    await page.goBack()
    await expect(familySheet(page)).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
  })
  test('the Reach family button opens the same sheet', async ({ page }) => {
    await page.getByRole('button', { name: 'Reach family' }).click()
    await expect(familySheet(page)).toBeVisible()
    await expect(familySheet(page).getByText('Papa Ben')).toBeVisible()
    await page.waitForTimeout(1000)
    await expect(familySheet(page)).toBeVisible()
  })
  test('a 3 s hold still opens the SOS screen and not the family sheet', async ({ page }) => {
    await page.getByTestId('jack-sos').locator('.sos-simple-btn').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
    await expect(page.getByRole('dialog', { name: 'SOS' })).toBeVisible({ timeout: 8000 })
    await expect(familySheet(page)).toHaveCount(0)
  })
})
test('reduced motion: the sheet still opens and closes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByTestId('jack').click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toBeVisible()
  await page.getByTestId('jack-sos').locator('.sos-simple-btn').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
  await expect(page.getByTestId('jack-sos-ring')).toBeVisible()
  expect(await page.getByRole('dialog', { name: 'Jack' }).evaluate((d) => d.getAnimations({ subtree: true }).length)).toBe(0)
  await page.getByTestId('jack-sos').locator('.sos-simple-btn').dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true })
  await page.getByTestId('jack-close').click()
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
        const label = b.querySelector('.sos-simple-tx > span:first-child')!.getBoundingClientRect()
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
      await btn.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true })
      await expect(page.getByTestId('jack-sos').locator('.sos-simple-sub')).toHaveText(/Hold 3 seconds/)
    }
  })
}
