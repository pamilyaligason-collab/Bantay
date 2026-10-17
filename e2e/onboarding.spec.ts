import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

const kv = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      new Promise<unknown>((res, rej) => {
        const r = indexedDB.open('bantay')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const g = r.result.transaction('kv').objectStore('kv').get(k)
          g.onsuccess = () => res(g.result?.value)
        }
      }),
    key
  )

test.describe('permissions granted', () => {
  test.use({ permissions: ['notifications', 'geolocation'], geolocation: { latitude: 10.3157, longitude: 123.8854 } })
  test('alerts then GPS location, then the app', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Turn on alerts')
    await page.getByRole('button', { name: 'Turn on alerts' }).click()
    await expect(page.locator('h1')).toHaveText("Check your phone's warnings")
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.locator('h1')).toHaveText('Where are you?')
    await expect(page.getByText('Alerts are off on this phone')).toHaveCount(0)
    await page.getByRole('button', { name: 'Use my location' }).click()
    await expect(page.locator('h1')).toHaveText('Today')
    expect(await kv(page, 'onboarded')).toBe(true)
    await page.reload()
    await expect(page.locator('h1')).toHaveText('Today')
  })
})

test.describe('permissions denied', () => {
  test('gentle banner, then saved home barangay defaults to Dampas', async ({ page }) => {
    await page.addInitScript(() => {
      Notification.requestPermission = async () => 'denied'
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Turn on alerts' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Alerts are off on this phone')).toBeVisible()
    await page.getByRole('button', { name: 'Choose my barangay instead' }).click()
    await expect(page.getByLabel('Latitude')).toHaveValue('9.645705')
    await expect(page.getByLabel('Longitude')).toHaveValue('123.877951')
    await page.getByRole('button', { name: 'Save and start' }).click()
    await expect(page.locator('h1')).toHaveText('Today')
    expect(await kv(page, 'loc.home')).toMatchObject({ lat: 9.645705, lon: 123.877951 })
  })
})

test.describe('iPhone in Safari', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' })
  test('shows Add to Home Screen before alerts', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Add Bantay to your Home Screen')
    await expect(page.getByRole('button', { name: 'Turn on alerts' })).toHaveCount(0)
  })
  test('Continue without alerts does not lock the app', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue without alerts' }).click()
    await expect(page.getByText('Phone warnings check')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Alerts are off on this phone')).toBeVisible()
    await page.getByRole('button', { name: 'Choose my barangay instead' }).click()
    await page.getByRole('button', { name: 'Save and start' }).click()
    await expect(page.locator('h1')).toHaveText('Today')
  })
})

test('skipOnboarding helper goes straight to the app at /', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Today')
})

test('a deep link skips onboarding', async ({ page }) => {
  await page.goto('/#records')
  await expect(page.locator('h1')).toHaveText('Family')
})

test.describe('375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test('onboarding has no sideways scroll', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    const root = await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)
    expect(root).toBe(true)
  })
})
