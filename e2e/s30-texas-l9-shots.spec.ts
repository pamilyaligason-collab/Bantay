import { test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'

// S30 L9 evidence shots (no assertions about the new features, so the same file runs on the base commit for the BEFORE shots and on the lane for the AFTER shots).
// Only runs when S30_SHOTS=<dir>. 390x844 and 360x740, light and dark. A Texas phone (America/Chicago): Plant page, temperature sheet; and the same phone with no position
// but a saved home place (kv loc.home, Houston): Weather. The base ignores the saved home and shows the Philippine zone; the lane shows Texas.
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S30_SHOTS
test.skip(!SHOTS, 'shots only with S30_SHOTS')
test.use({ serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/Chicago' })
const CLOCK = '2026-11-11T02:00:00Z'
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }]

async function open(page: Page, hash: string, size: { width: number; height: number }, scheme: 'light' | 'dark') {
  await page.setViewportSize(size)
  await page.emulateMedia({ colorScheme: scheme })
  await page.clock.setFixedTime(CLOCK)
  await skipOnboarding(page)
  await stubWindy(page)
  await page.route('**/open.er-api.com/**', (r) => r.abort())
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(CLOCK), temp: 30, humidity: 70, feels: 34, code: 2, hourlyProb: () => 10, tz: 'America/Chicago', offsetS: -6 * 3600 }) }))
  await page.goto(hash)
}
const shot = async (page: Page, name: string, size: { width: number; height: number }, scheme: string) => {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.screenshot({ path: `${SHOTS}/${name}-${size.width}x${size.height}-${scheme}.png`, animations: 'disabled' })
}

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${size.width}x${size.height} ${scheme}`, () => {
      test.describe('Texas phone with a fix', () => {
        test.use({ geolocation: { latitude: 29.7604, longitude: -95.3698 }, permissions: ['geolocation'] })
        test('plant page', async ({ page }) => {
          await open(page, '/#garden/plant', size, scheme)
          await page.waitForTimeout(1500)
          await shot(page, 'plant', size, scheme)
        })
        test('temperature sheet', async ({ page }) => {
          await open(page, '/#today', size, scheme)
          await page.getByTestId('myday-more').click()
          await page.getByRole('button', { name: 'Temperature' }).click()
          await page.getByLabel(/^Temperature \(/).fill('98.6')
          await shot(page, 'temperature', size, scheme)
        })
      })
      test.describe('Texas phone with no position', () => {
        test('settings overview and weather with a saved home place', async ({ page }) => {
          await open(page, '/#me', size, scheme)
          await page.getByRole('link', { name: /Display/ }).waitFor()
          await shot(page, 'settings-overview', size, scheme)
          await page.evaluate(async () => {
            await new Promise<void>((res, rej) => {
              const o = indexedDB.open('bantay')
              o.onerror = () => rej(o.error)
              o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ key: 'loc.home', value: { name: 'Houston, Texas', lat: 29.76, lon: -95.37, tz: 'America/Chicago' } }); tx.oncomplete = () => { o.result.close(); res() }; tx.onerror = () => rej(tx.error) }
            })
          })
          await page.goto('/#weather')
          await page.reload()
          await page.getByTestId('wx-hero').waitFor()
          await page.waitForTimeout(800)
          await shot(page, 'weather-no-fix', size, scheme)
        })
      })
    })
  }
}
