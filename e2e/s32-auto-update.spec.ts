import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackClear } from './v13'

// S32 L1: Settings > Phone > "Update Bantay by itself" (default on, saved in kv update.auto). Web build; the runner itself is native-only and covered by unit tests.
// Shots only when S32_SHOTS=<dir>. Runs in the chromium project (no sign-in).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S32_SHOTS
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }]
const LINE = 'Checks once in a while for a new version on Wi-Fi and installs it, or tells you when one is ready to install.'

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Phone group ${size.width}x${size.height} ${scheme}: switch on by default, plain line, saves off and on`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.emulateMedia({ colorScheme: scheme })
      await page.addInitScript(() => { (window as unknown as { androidBridge: unknown }).androidBridge = { postMessage() {} } }) // Capacitor reads this as a native Android phone, so the row shows
      await skipOnboarding(page)
      await page.goto('/#me/phone')
      const sw = page.getByRole('switch', { name: 'Update Bantay by itself' })
      await expect(sw).toBeVisible()
      await sw.scrollIntoViewIfNeeded()
      await expect(sw).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByText(LINE)).toBeVisible()
      const b = await sw.boundingBox()
      expect(b && b.height >= 44 && b.width >= 44).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await assertJackClear(page)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L1-phone-${size.width}x${size.height}-${scheme}.png` })
      await sw.click()
      await expect(sw).toHaveAttribute('aria-checked', 'false')
      await expect.poll(() => page.evaluate(() => new Promise<unknown>((res) => {
        const o = indexedDB.open('bantay')
        o.onsuccess = () => { const g = o.result.transaction('kv').objectStore('kv').get('update.auto'); g.onsuccess = () => { o.result.close(); res(g.result?.value) } }
        o.onerror = () => res(undefined)
      }))).toBe(false)
      await page.reload()
      await expect(page.getByRole('switch', { name: 'Update Bantay by itself' })).toHaveAttribute('aria-checked', 'false')
    })
  }
}

test('plain web: no Update Bantay by itself row', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#me/phone')
  await expect(page.getByRole('button', { name: 'Set up everything' }).or(page.getByText('Set up everything')).first()).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Update Bantay by itself' })).toHaveCount(0)
})
