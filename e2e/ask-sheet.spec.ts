import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { skipOnboarding } from './helpers'

// Ask choice sheet (S8 L2). The "photo" is a generated PNG, never a real document.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

function crc(buf: Buffer) {
  let c = ~0
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) }
  return ~c >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const t = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); out.writeUInt32BE(crc(t), 8 + data.length)
  return out
}
function png(w: number, h: number) {
  const raw = Buffer.alloc((w * 3 + 1) * h, 200)
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme })

    test('sheet opens with three 76px rows, axe clean, Escape closes', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      await page.getByRole('button', { name: 'Ask Bantay' }).click()
      const dlg = page.getByRole('dialog', { name: 'What would you like to do?' })
      await expect(dlg).toBeVisible()
      await page.waitForTimeout(400) // slide-in
      for (const n of [/Talk to Jack Jack/, /Scan a paper/, /Upload a photo/]) {
        const b = (await dlg.getByRole('button', { name: n }).boundingBox())!
        expect(b.height).toBeGreaterThanOrEqual(76)
      }
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(res.violations).toEqual([])
      await page.keyboard.press('Escape')
      await expect(dlg).toHaveCount(0)
    })

    test('backdrop covers the whole viewport, tap outside / Cancel / Back close it, page behind stays out of reach', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      const ask = page.getByRole('button', { name: 'Ask Bantay' })
      const dlg = page.getByRole('dialog', { name: 'What would you like to do?' })
      await ask.click()
      await expect(dlg).toBeVisible()
      await page.waitForTimeout(400)
      const box = (await page.locator('.ask-back').boundingBox())!
      expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 })
      expect(await page.locator('.ask-back').evaluate((el) => !!el.closest('nav'))).toBe(false)
      // focus stays inside the sheet through a full Tab cycle
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab')
        expect(await page.evaluate(() => !!document.activeElement?.closest('.ask-sheet'))).toBe(true)
      }
      // tap on the dim area above the sheet closes
      await page.mouse.click(195, 40)
      await expect(dlg).toHaveCount(0)
      await ask.click()
      await expect(dlg).toBeVisible()
      await dlg.getByRole('button', { name: 'Cancel' }).click()
      await expect(dlg).toHaveCount(0)
      await ask.click()
      await expect(dlg).toBeVisible()
      await page.goBack()
      await expect(dlg).toHaveCount(0)
      await expect(page).toHaveURL(/#today$/)
    })

    test('leaving via Scan leaves one Back press to return', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      await page.getByRole('button', { name: 'Ask Bantay' }).click()
      await page.getByRole('button', { name: /Scan a paper/ }).click()
      await expect(page).toHaveURL(/#scan$/)
      await page.goBack()
      await expect(page).toHaveURL(/#today$/)
    })

    test('PDF line goes to Health > Papers', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      await page.getByRole('button', { name: 'Ask Bantay' }).click()
      await page.getByRole('link', { name: /For PDF files use Health > Papers/ }).click()
      await expect(page).toHaveURL(/#health\/papers/)
    })

    test('one-time hint and camera badge pass axe', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      await expect(page.getByText('Scan papers here too')).toBeVisible()
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('nav[aria-label="Main"]').analyze()
      expect(res.violations).toEqual([])
    })

    test('Talk reaches the chat', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      await page.getByRole('button', { name: 'Ask Bantay' }).click()
      await page.getByRole('button', { name: /Talk to Jack Jack/ }).click()
      await expect(page.getByRole('dialog', { name: 'Ask Bantay' })).toBeVisible()
    })

    test('Scan a paper reaches the web crop flow', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      await page.getByRole('button', { name: 'Ask Bantay' }).click()
      await page.getByRole('button', { name: /Scan a paper/ }).click()
      await expect(page).toHaveURL(/#scan$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Scan a paper' })).toBeVisible()
      await expect(page.getByRole('button', { name: /Take a photo of page 1/ })).toBeVisible()
    })

    test('Upload a photo has a file input and a chosen photo lands in the crop step', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      await page.getByRole('button', { name: 'Ask Bantay' }).click()
      await expect(page.getByRole('button', { name: /Upload a photo/ })).toBeVisible()
      await expect(page.getByTestId('ask-file')).toHaveCount(1)
      await page.getByTestId('ask-file').setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: png(300, 400) })
      await expect(page).toHaveURL(/#scan$/)
      await expect(page.getByTestId('corner-0')).toBeVisible()
    })

    test('the one-time hint shows, never covers the Ask button, and is gone after the first open', async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#today')
      const hint = page.getByText('Scan papers here too')
      await expect(hint).toBeVisible()
      const h = (await hint.boundingBox())!
      const a = (await page.getByRole('button', { name: 'Ask Bantay' }).boundingBox())!
      expect(h.y + h.height).toBeLessThanOrEqual(a.y)
      await page.getByRole('button', { name: 'Ask Bantay' }).click()
      await page.keyboard.press('Escape')
      await expect(hint).toHaveCount(0)
      await page.reload()
      await page.waitForTimeout(300)
      await expect(page.getByText('Scan papers here too')).toHaveCount(0)
    })
  })
}
