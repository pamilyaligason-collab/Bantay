import { expect, test, type Page } from '@playwright/test'
import { openChat, skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'

// S30 L8 Texas: a member standing in Houston with the phone set to America/Chicago.
// 02:00Z on 11 Nov is 20:00 Tuesday 10 Nov in Texas and 10:00 Wednesday 11 Nov in Manila: the Today date must say Tuesday, the PH-only cards must be gone, the
// weather must read in Fahrenheit, the self-harm card must give 988 (never 1553), the Calm hotline list must carry 988, and the OFW numbers must dial in international form.
// Shots only when S30_SHOTS=<dir> (390x844 and 360x740, light and dark). Runs in the chromium project (no sign-in).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S30_SHOTS
test.use({ serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/Chicago', geolocation: { latitude: 29.7604, longitude: -95.3698 }, permissions: ['geolocation'] })

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
const shot = async (page: Page, name: string, size: { width: number; height: number }, scheme: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${size.width}x${size.height}-${scheme}.png` }) }

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${size.width}x${size.height} ${scheme}`, () => {
      test('Today in Texas: Tuesday, no Climate, Plant, Prices or Lotto, Fahrenheit', async ({ page }) => {
        await open(page, '/#today', size, scheme)
        await expect(page.getByTestId('myday')).toBeVisible()
        await expect(page.locator('.td-wxh-t, .td-wx-t').first()).toBeVisible()
        await shot(page, 'today', size, scheme)
        await expect(page.getByTestId('today-head')).toContainText('Tuesday, Nov 10') // A4: the phone's day (Chicago), not Manila's Wednesday
        await expect(page.getByTestId('today-head')).not.toContainText('Wednesday')
        await expect(page.locator('.td-wxh-t, .td-wx-t').first()).toContainText('°F') // B2: 30 C is 86 F
        await expect(page.locator('.td-wxh-t, .td-wx-t').first()).toContainText('86')
        for (const id of ['today-climate', 'today-plant', 'climate-card']) await expect(page.getByTestId(id)).toHaveCount(0) // C1/C2
        const body = await page.locator('.td-root').innerText()
        expect(body).not.toMatch(/Plant this month|Market prices|Lotto/)
        await expect(page.getByTestId('pagasa-section')).toContainText('Philippines: PAGASA') // the family alerts stay, labelled
      })

      test('Jack self-harm card in Texas gives 988 and never 1553', async ({ page }) => {
        await open(page, '/', size, scheme)
        await openChat(page)
        await page.getByLabel('Your question').fill('I want to die')
        await page.getByRole('button', { name: 'Send' }).click()
        const card = page.getByRole('alert')
        await expect(card).toContainText('You are not alone')
        await shot(page, 'jack-selfharm', size, scheme)
        await expect(card).toContainText('988')
        await expect(card).not.toContainText('1553')
        await expect(card.getByRole('button', { name: 'Call 988 (crisis line, free)' })).toBeVisible()
        await expect(card.getByRole('link', { name: 'Text 988' })).toHaveAttribute('href', 'sms:988')
        await expect(card.getByRole('button', { name: 'Call 911' })).toBeVisible()
        const order = await card.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
        expect(order.indexOf('Call 988 (crisis line, free)')).toBeLessThan(order.indexOf('Call 911')) // 988 above 911 on the self-harm card
        expect(order.indexOf('Text 988')).toBeLessThan(order.indexOf('Call 911'))
        await expect(card.getByRole('button', { name: /Call 1553/ })).toHaveCount(0)
      })

      test('Calm hotlines in Texas list 988, not the Philippine lines', async ({ page }) => {
        await open(page, '/#calm', size, scheme)
        const card = page.getByTestId('calm-crisis')
        await card.scrollIntoViewIfNeeded()
        await shot(page, 'calm-hotlines', size, scheme)
        await expect(card.getByRole('link', { name: 'Call 988' })).toHaveAttribute('href', 'tel:988')
        await expect(card.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
        await expect(card).not.toContainText('1553')
        await expect(card).not.toContainText('NCMH')
      })

      test('Weather screen in Texas reads Fahrenheit and mph (30 C = 86 F, 9 km/h = 6 mph)', async ({ page }) => {
        await open(page, '/#weather', size, scheme)
        const tiles = page.getByTestId('wx-details')
        await tiles.scrollIntoViewIfNeeded()
        await expect(tiles).toContainText('6 mph')
        await expect(tiles).not.toContainText('km/h')
        await expect(page.getByTestId('wx-hero')).toContainText('86°F')
        await shot(page, 'weather-f-mph', size, scheme)
      })

      test('A Philippine bulletin on a Texas phone carries the Philippines chip', async ({ page }) => {
        await open(page, '/#safety/warnings', size, scheme)
        await page.evaluate(async () => {
          const alert = { id: 'tx-r2-a1', kind: 'tcws', level: 'Signal No. 2', title: 'Tropical Cyclone Wind Signal No. 2', what: 'Strong winds are expected.', where: 'Eastern Samar', when: 'Next 24 hours', doNow: 'Follow local officials.', source: 'PAGASA', sourceUrl: null, issuedAt: '2026-11-11T00:00:00Z', lat: 11.5, lon: 125.5, bulletin: 'Synthetic bulletin text for the test.', checkedAt: '2026-11-11T01:50:00Z' }
          await new Promise<void>((res, rej) => {
            const o = indexedDB.open('bantay')
            o.onerror = () => rej(o.error)
            o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ key: 'safety.alerts', value: [alert] }); tx.oncomplete = () => { o.result.close(); res() }; tx.onerror = () => rej(tx.error) }
          })
        })
        await page.reload() // raw IndexedDB writes do not notify live queries
        const card = page.getByRole('article', { name: 'Tropical Cyclone Wind Signal No. 2' })
        await expect(card).toBeVisible()
        await expect(card.locator('.sf-chip', { hasText: 'Philippines' })).toBeVisible()
        await card.scrollIntoViewIfNeeded()
        await shot(page, 'alertcard-philippines', size, scheme)
      })

      test('Quick dial in Texas: the OFW numbers dial with +63', async ({ page }) => {
        await open(page, '/#safety/dial', size, scheme)
        const row = page.getByRole('link', { name: /Call DMW-OWWA 24\/7 hotline/ })
        await row.scrollIntoViewIfNeeded()
        await shot(page, 'quick-dial', size, scheme)
        await expect(row).toHaveAttribute('href', 'tel:+6321348')
      })
    })
  }
}
