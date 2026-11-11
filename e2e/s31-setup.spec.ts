import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { settled } from './v13'

// S31 L1: the /get link (Android, iPhone, computer, inside the app) and the Set up everything screen (#setup/all) on the web build.
// Shots only when S31_SHOTS=<dir>. Runs in the chromium project (no sign-in).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S31_SHOTS
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const APK = 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.9.0/bantay-2.9.0.apk'
const SHA = 'b'.repeat(64)
const LATEST = { versionCode: 2009000, versionName: '2.9.0', url: APK, sha256: SHA, size: 15779070, minShell: 2000000, notes: 'n' }
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }]

// Headless Chromium can report Notification.permission as denied while the Permissions API says granted; the web plugin reads the first, so pin it.
const grantNotifications = (page: Page) => page.addInitScript(() => { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }) })
const stubLatest = (page: Page) => page.route('**/latest.json', (r) => r.fulfill({ json: LATEST }))
const noGithub = (page: Page) => page.route('https://github.com/**', (r) => r.abort()) // nothing here may leave the box
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const size of SIZES) {
  test.describe(`/get at ${size.width}x${size.height}`, () => {
    test('Android: one Open button with the app link and the download as fallback, 3 steps, facts from latest.json', async ({ browser }) => {
      const ctx = await browser.newContext({ userAgent: ANDROID, viewport: size })
      const page = await ctx.newPage()
      await stubLatest(page); await noGithub(page)
      await page.goto('/get/')
      const open = page.getByRole('link', { name: /Open or install Bantay/ })
      await expect(open).toBeVisible()
      const intent = 'intent://setup#Intent;scheme=ph.bantay.family;package=ph.bantay.family;S.browser_fallback_url=' + encodeURIComponent(APK) + ';end'
      await expect(open).toHaveAttribute('href', intent)
      await expect(page.locator('html')).toHaveAttribute('data-intent', intent)
      await expect(page.locator('html')).toHaveAttribute('data-tried', '1') // the load-time attempt at the app link really ran
      expect(await page.evaluate(() => sessionStorage.getItem('bantay.get.tried'))).toBe('1')
      await page.reload() // same tab, same visit: the guard keeps it from trying again
      await expect(page.locator('html')).toHaveAttribute('data-intent', intent)
      await expect(page.locator('html')).not.toHaveAttribute('data-tried', /.*/)
      await expect(page.getByRole('link', { name: /Download Bantay/ })).toHaveAttribute('href', /releases\/latest\/download\/bantay\.apk$/)
      await expect(page.getByRole('listitem')).toHaveCount(3)
      await expect(page.getByText(/allow installs from Chrome/i)).toBeVisible()
      // step 3 says what really happens: opened from the installer or launcher there is no deep link, so onboarding runs first
      await expect(page.getByText(/It walks you through setup, then Set up everything finishes the phone settings/)).toBeVisible()
      await expect(page.getByText(/opens on Set up everything/)).toHaveCount(0)
      await expect(page.getByText(`Version 2.9.0 · 15.0 MB · SHA-256 ${SHA}`)).toBeVisible()
      expect(await noSideways(page)).toBe(true)
      for (const t of await page.locator('a.pill, button.pill').all()) { const b = await t.boundingBox(); if (b) expect(b.height).toBeGreaterThanOrEqual(44) }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L1-get-android-${size.width}x${size.height}.png`, fullPage: true })
      await ctx.close()
    })
    test('iPhone: three Add to Home Screen steps, no download, no app link', async ({ browser }) => {
      const ctx = await browser.newContext({ userAgent: IPHONE, viewport: size })
      const page = await ctx.newPage()
      await stubLatest(page)
      await page.goto('/get/')
      await expect(page.getByRole('heading', { name: 'Bantay on iPhone stays a web app' })).toBeVisible()
      await expect(page.getByRole('listitem')).toHaveCount(3)
      await expect(page.getByText('Tap Share')).toBeVisible()
      await expect(page.getByText(/Add to Home Screen, then Add/)).toBeVisible()
      await expect(page.getByRole('link', { name: /Download Bantay|Open or install/ })).toHaveCount(0)
      await expect(page.locator('html')).not.toHaveAttribute('data-intent', /.+/)
      expect(await noSideways(page)).toBe(true)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L1-get-iphone-${size.width}x${size.height}.png`, fullPage: true })
      await ctx.close()
    })
    test('computer: shows the link to open on the phone, no install steps first', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: size })
      const page = await ctx.newPage()
      await stubLatest(page)
      await page.goto('/get/')
      await expect(page.getByRole('heading', { name: 'Open this link on your phone' })).toBeVisible()
      await expect(page.locator('#addr')).toContainText('/get')
      await expect(page.getByRole('heading', { name: 'Get the Bantay app' })).toBeHidden()
      expect(await noSideways(page)).toBe(true)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L1-get-desktop-${size.width}x${size.height}.png`, fullPage: true })
      await ctx.close()
    })
  })
}

test('/get inside the app goes straight to Set up everything', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: ANDROID })
  const page = await ctx.newPage()
  await page.addInitScript(() => { (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true } })
  await stubLatest(page)
  await page.goto('/get/')
  await page.waitForURL(/#setup\/all$/)
  expect(new URL(page.url()).pathname).toBe('/')
  await ctx.close()
})

test('a deep-linked setup page on a phone that has not finished onboarding runs onboarding first, then lands on Set up everything', async ({ page }) => {
  await page.goto('/#setup/all')
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()
  await expect(page.getByTestId('setup-all')).toHaveCount(0)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByTestId('setup-all')).toBeVisible()
  await expect(page).toHaveURL(/#setup\/all$/)
})

test('the setup page on a phone that finished onboarding opens straight away', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#setup/all')
  await expect(page.getByTestId('setup-all')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0)
})

test('/get in a Messenger browser still asks for Chrome and does not try the app link', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/141 Mobile [FBAN/Messenger;FBAV/480.0]' })
  const page = await ctx.newPage()
  await stubLatest(page); await noGithub(page)
  await page.goto('/get/')
  await expect(page.getByText(/Open in Chrome first/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Open or install Bantay/ })).toBeVisible()
  await page.waitForTimeout(0)
  expect(page.url()).toMatch(/\/get\/$/) // nothing navigated away
  await ctx.close()
})

for (const size of SIZES) {
  test.describe(`#setup/all web at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size })
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.route('**/medlib/**', (r) => r.abort()) // tapping the library row must not start a 178 MB download here
    })

    test('shows only the rows that apply in a browser, each with a status word and a button, one primary action', async ({ page }) => {
      await page.goto('/#setup/all')
      await settled(page)
      await expect(page.getByRole('heading', { name: 'Set up everything' })).toBeVisible()
      const rows = page.locator('[data-row]')
      await expect(rows.first()).toBeVisible()
      const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-row')))
      expect(ids).toEqual(expect.arrayContaining(['notifications', 'location']))
      for (const native of ['update', 'exact', 'battery', 'health', 'test']) expect(ids).not.toContain(native)
      await expect(page.getByTestId('do-all')).toHaveCount(1)
      await expect(page.getByText('In this browser only some steps apply')).toBeVisible()
      expect(await noSideways(page)).toBe(true)
      for (const b of await page.locator('.sa-btn').all()) {
        const r = await b.boundingBox()
        if (r) expect(r.height).toBeGreaterThanOrEqual(48)
        expect(await b.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(17)
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L1-setup-all-${size.width}x${size.height}.png`, fullPage: true })
    })

    test('the library row: one tap switches it on, the row turns Done and the choice stays', async ({ page }) => {
      await page.goto('/#setup/all')
      const lib = page.locator('[data-row="library"]')
      await expect(lib).toHaveAttribute('data-status', 'tap')
      await lib.getByRole('button').click()
      await expect(lib).toHaveAttribute('data-status', 'done')
      await page.reload()
      await expect(page.locator('[data-row="library"]')).toHaveAttribute('data-status', 'done')
    })

    test('the location row says what is true: Your phone asks, stays on this phone, and the family line only while family places are on', async ({ page }) => {
      await page.goto('/#setup/all')
      const say = page.locator('[data-row="location"] .sa-say')
      await expect(say).toContainText('Your phone asks for your location.')
      await expect(say).not.toContainText('Android')
      await expect(say).toContainText('stays on this phone unless you share it with family.')
      await page.evaluate(() => localStorage.setItem('bantay.flag.places', '0'))
      await page.reload()
      await expect(page.locator('[data-row="location"] .sa-say')).toContainText(/stays on this phone\.$/)
    })

    test('Do all never starts the library download: that row stays one tap, and the screen says so', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: size, permissions: ['notifications', 'geolocation'] })
      const page = await ctx.newPage()
      await skipOnboarding(page); await grantNotifications(page)
      let medlib = 0
      await page.route('**/medlib/**', (r) => { medlib++; return r.abort() })
      await page.goto('/#setup/all')
      await expect(page.locator('[data-row="library"]')).toHaveAttribute('data-status', 'tap')
      await expect(page.getByText(/Do all leaves Medical library on this phone for your own tap/)).toBeVisible()
      await expect(page.getByTestId('do-all')).toHaveCount(0) // only manual rows are left: nothing for Do all to run
      expect(medlib).toBe(0)
      await ctx.close()
    })

    test('with notifications and location allowed those rows read Done and the count drops', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: size, permissions: ['notifications', 'geolocation'] })
      const page = await ctx.newPage()
      await skipOnboarding(page); await grantNotifications(page)
      await page.route('**/medlib/**', (r) => r.abort())
      await page.goto('/#setup/all')
      await expect(page.locator('[data-row="notifications"]')).toHaveAttribute('data-status', 'done')
      await expect(page.locator('[data-row="location"]')).toHaveAttribute('data-status', 'done')
      await expect(page.locator('[data-row="notifications"] button')).toHaveCount(0) // a finished step has no button
      await ctx.close()
    })

    test('light and dark both draw it', async ({ page }) => {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto('/#setup/all')
        await settled(page)
        await expect(page.locator('[data-row]').first()).toBeVisible()
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/L1-setup-all-${size.width}x${size.height}-${scheme}.png`, fullPage: true, animations: 'disabled' })
      }
    })
  })
}

test('Settings > Phone has the Set up everything row and it opens the screen', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#me/phone')
  await page.getByTestId('settings-setup-all').click()
  await expect(page).toHaveURL(/#setup\/all$/)
  await expect(page.getByRole('heading', { name: 'Set up everything' })).toBeVisible()
})
