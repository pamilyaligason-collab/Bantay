import { expect, test } from '@playwright/test'

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const LATEST = { versionCode: 2000001, versionName: '2.0.1', url: 'x' }
const MESSENGER = 'Mozilla/5.0 (Linux; Android 15) Chrome/141 Mobile [FBAN/Messenger;FBAV/480.0]'

test('Android visitor sees 4 steps and the APK link', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: ANDROID, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.route('**/latest.json', (r) => r.fulfill({ json: LATEST }))
  await page.goto('/get/')
  await expect(page.getByRole('listitem')).toHaveCount(4)
  await expect(page.getByRole('link', { name: /Download Bantay/ })).toHaveAttribute('href', /releases\/latest\/download\/bantay\.apk$/)
  await expect(page.getByText(/Open in Chrome first/)).toBeHidden()
  await ctx.close()
})

test('iPhone visitor gets Add to Home Screen, no APK', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto('/get/')
  await expect(page.getByText(/Add to Home Screen/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Download Bantay/ })).toHaveCount(0)
  await ctx.close()
})

test('Messenger in-app browser is told to open Chrome', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: MESSENGER })
  const page = await ctx.newPage()
  await page.goto('/get/')
  await expect(page.getByText(/Open in Chrome/)).toBeVisible()
  await ctx.close()
})

test('shows version, size and checksum when latest.json is readable', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: ANDROID, viewport: { width: 360, height: 800 } })
  const page = await ctx.newPage()
  const sha = 'a'.repeat(64)
  await page.route('**/latest.json', (r) =>
    r.fulfill({ json: { versionCode: 2000001, versionName: '2.0.1', url: 'x', sha256: sha, size: 9437184, minShell: 2000000, notes: 'n' } })
  )
  await page.goto('/get/')
  await expect(page.getByText(`Version 2.0.1 · 9.0 MB · SHA-256 ${sha}`)).toBeVisible()
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false) // no sideways scroll at 360 px
  await ctx.close()
})

test('iPadOS (Mac user agent with touch) gets the iPhone steps', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', hasTouch: true, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }))
  await page.goto('/get/')
  await expect(page.getByRole('heading', { name: 'Bantay on iPhone stays a web app' })).toBeVisible()
  await ctx.close()
})

test('latest.json missing: no Download button, a not-ready note instead', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: ANDROID })
  const page = await ctx.newPage()
  await page.route('**/latest.json', (r) => r.fulfill({ status: 404, body: 'nope' }))
  await page.goto('/get/')
  await expect(page.getByText('The app download is not ready yet. Check back soon.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Download Bantay/ })).toBeHidden()
  await expect(page.getByText(/SHA-256/)).toBeHidden()
  await ctx.close()
})
