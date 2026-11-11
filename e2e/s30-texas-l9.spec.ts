import { expect, test, type Page } from '@playwright/test'
import { openChat, skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'

// S30 L9 Texas client leftovers (chromium project, no sign-in). 02:00Z on 11 Nov is 20:00 Tuesday in Texas.
// Two phones: a Texas phone (America/Chicago, Houston fix) and a phone whose place is unknown (Europe/London, no fix, no permission).
// Unknown place: the self-harm card gives BOTH lines in the order 988, Text 988, 1553, 911. Texas: the Plant guide says it covers the Philippines (no climate picker),
// the temperature sheet starts in Fahrenheit on a US phone (the save to Celsius is in quickLog.test.tsx: this build has no signed-in member), and a member with no position who picks "My home place" sees Texas weather and the Texas name.
// Shots only when S30_SHOTS=<dir> (390x844 and 360x740, light and dark).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S30_SHOTS
const CLOCK = '2026-11-11T02:00:00Z'
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }]

async function open(page: Page, hash: string, size: { width: number; height: number }, scheme: 'light' | 'dark', tz = 'America/Chicago') {
  await page.setViewportSize(size)
  await page.emulateMedia({ colorScheme: scheme })
  await page.clock.setFixedTime(CLOCK)
  await skipOnboarding(page)
  await stubWindy(page)
  await page.route('**/open.er-api.com/**', (r) => r.abort())
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(CLOCK), temp: 30, humidity: 70, feels: 34, code: 2, hourlyProb: () => 10, tz, offsetS: tz === 'America/Chicago' ? -6 * 3600 : 0 }) }))
  await page.goto(hash)
}
const shot = async (page: Page, name: string, size: { width: number; height: number }, scheme: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${size.width}x${size.height}-${scheme}.png` }) }

test.describe('unknown place (London phone, no fix)', () => {
  test.use({ serviceWorkers: 'block', locale: 'en-GB', timezoneId: 'Europe/London' })
  for (const size of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${size.width}x${size.height} ${scheme}: the self-harm card gives both lines, 988 first, then Text 988, 1553, 911`, async ({ page }) => {
        await open(page, '/', size, scheme, 'Europe/London')
        await openChat(page)
        await page.getByLabel('Your question').fill('I want to die')
        await page.getByRole('button', { name: 'Send' }).click()
        const card = page.getByRole('alert')
        await expect(card).toContainText('You are not alone')
        await shot(page, 'selfharm-both', size, scheme)
        const order = await card.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
        const at = (t: string) => order.indexOf(t)
        for (const t of ['Call 988 (crisis line, free)', 'Text 988', 'Call 1553 (crisis line, free)', 'Call 911']) expect(at(t), t).toBeGreaterThanOrEqual(0)
        expect(order.slice(0, 4)).toEqual(['Call 988 (crisis line, free)', 'Text 988', 'Call 1553 (crisis line, free)', 'Call 911'])
        await expect(card.getByRole('link', { name: 'Text 988' })).toHaveAttribute('href', 'sms:988')
        await expect(card).toContainText('1553')
      })
    }
  }
})

test.describe('Texas phone', () => {
  test.use({ serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/Chicago', geolocation: { latitude: 29.7604, longitude: -95.3698 }, permissions: ['geolocation'] })
  for (const size of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${size.width}x${size.height} ${scheme}: #garden/plant says the guide covers the Philippines and never asks for a climate type`, async ({ page }) => {
        await open(page, '/#garden/plant', size, scheme)
        const note = page.getByTestId('plant-away')
        await expect(note).toHaveText('Planting guide covers the Philippines.')
        await expect(page.getByTestId('climate-picker')).toHaveCount(0)
        await expect(page.getByText("Pick your area's climate type")).toHaveCount(0)
        await shot(page, 'plant-away', size, scheme)
      })

      test(`${size.width}x${size.height} ${scheme}: the temperature sheet starts in Fahrenheit, shows both units, and keeps each unit's range`, async ({ page }) => {
        await open(page, '/#today', size, scheme)
        await page.getByTestId('myday-more').click()
        await page.getByRole('button', { name: 'Temperature' }).click()
        const field = page.getByLabel('Temperature (°F)')
        await expect(field).toBeVisible() // a US phone starts in Fahrenheit
        await field.fill('30')
        await page.getByRole('button', { name: 'Save' }).click()
        await expect(page.getByRole('alert')).toContainText('86 to 113')
        await field.fill('98.6')
        await expect(page.getByText('37 °C (98.6 °F)')).toBeVisible()
        await shot(page, 'temperature-f', size, scheme)
        await page.getByRole('button', { name: '°C' }).click() // the unit toggle: Celsius box refuses a Fahrenheit number; the save itself needs a signed-in member and is covered in quickLog.test.tsx
        await page.getByLabel('Temperature (°C)').fill('98.6')
        await page.getByRole('button', { name: 'Save' }).click()
        await expect(page.getByRole('alert')).toContainText('30 to 45')
      })
    }
  }
})

test.describe('a Texas member with no position', () => {
  test.use({ serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/Chicago' }) // no geolocation permission: the phone has no fix
  for (const size of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${size.width}x${size.height} ${scheme}: My home place (Houston) moves the weather and the place name from Bohol to Texas`, async ({ page }) => {
        const asked: string[] = []
        page.on('request', (r) => { if (r.url().includes('api.open-meteo.com/v1/forecast')) asked.push(r.url()) })
        await open(page, '/#me', size, scheme)
        const row = page.getByTestId('home-place-row')
        await expect(row).toContainText('Not set')
        await shot(page, 'settings-home-row', size, scheme)
        await row.click()
        const sheet = page.getByRole('dialog', { name: 'My home place' })
        await sheet.getByLabel('Search a city').fill('houst')
        await shot(page, 'settings-home-sheet', size, scheme)
        await sheet.getByRole('button', { name: 'Houston, Texas' }).click()
        await expect(row).toContainText('Houston, Texas')
        await page.goto('/#weather')
        await expect(page.getByTestId('wx-hero')).toBeVisible()
        await expect.poll(() => asked.some((u) => /latitude=29\.7\d*/.test(u) && /longitude=-95\.3\d*/.test(u))).toBe(true) // the forecast asked for Houston, not Dampas
        await expect(page.locator('body')).toContainText('Houston, Texas')
        await expect(page.locator('body')).not.toContainText('Dampas')
        await shot(page, 'weather-home-place', size, scheme)
      })
    }
  }
})
