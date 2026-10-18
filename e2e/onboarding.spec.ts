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

const kvSet = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ([k, v]) =>
      new Promise<void>((res, rej) => {
        const r = indexedDB.open('bantay')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const t = r.result.transaction('kv', 'readwrite')
          t.objectStore('kv').put({ key: k, value: v })
          t.oncomplete = () => res()
        }
      }),
    [key, value] as const
  )

const STEPS = ['Your photo', 'About me', 'Your medicines', 'Reminders and alerts', 'Where you are', "Your phone's warnings", 'SOS text contacts', 'Sharing']

test.describe('setup wizard', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 10.3157, longitude: 123.8854 } })
  test('walks every step with Skip and Finish, then the app', async ({ page }) => {
    await page.goto('/')
    for (const [i, title] of STEPS.entries()) {
      await expect(page.locator('h1')).toHaveText(title)
      await expect(page.getByText(`Step ${i + 1} of ${STEPS.length}`)).toBeVisible()
      if (i < STEPS.length - 1) await page.getByRole('button', { name: 'Skip' }).click()
    }
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page.locator('h1')).toHaveText('Today')
    expect(await kv(page, 'onboarded')).toBe(true)
    await page.reload()
    await expect(page.locator('h1')).toHaveText('Today')
  })

  test('Back and the step dots move between steps', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled()
    await page.getByRole('button', { name: 'Step 4: Reminders and alerts' }).click()
    await expect(page.locator('h1')).toHaveText('Reminders and alerts')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.locator('h1')).toHaveText('Your medicines')
  })

  test('a step whose flag is already set is skipped', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Your photo')
    await kvSet(page, 'profile.photo', 'data:image/jpeg;base64,AA==')
    await page.reload()
    await expect(page.locator('h1')).toHaveText('About me')
    await expect(page.getByText(`Step 1 of ${STEPS.length - 1}`)).toBeVisible()
  })

  test('notifications step: rows are off and the test reminder waits for permission', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Step 4: Reminders and alerts' }).click()
    await expect(page.getByText('Not on yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send a test reminder' })).toBeDisabled()
    await expect(page.getByText('reminders come from the family server')).toBeVisible()
  })

  test('location step has no prefilled barangay, and saves the one typed', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Step 5: Where you are' }).click()
    await expect(page.getByText('Updates when you open Bantay')).toBeVisible()
    await page.getByRole('button', { name: 'Choose my barangay instead' }).click()
    await expect(page.getByLabel('Latitude')).toHaveValue('')
    await expect(page.getByLabel('Longitude')).toHaveValue('')
    await page.getByLabel('Barangay').fill('Test Barangay')
    await page.getByLabel('Latitude').fill('10.5')
    await page.getByLabel('Longitude').fill('123.5')
    await page.getByRole('button', { name: 'Save my barangay' }).click()
    expect(await kv(page, 'loc.home')).toMatchObject({ name: 'Test Barangay', lat: 10.5, lon: 123.5 })
  })
})

test.describe('notifications already allowed', () => {
  test.use({ permissions: ['notifications'] })
  test('the notifications step is skipped', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Reminders and alerts/ })).toHaveCount(0)
    await expect(page.getByText(`Step 1 of ${STEPS.length - 1}`)).toBeVisible()
  })
})

test.describe('Today checklist', () => {
  test('lists the same count as the wizard and each item opens its own step', async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/')
    const card = page.getByRole('region', { name: /left to set up/ })
    await expect(card).toContainText(`${STEPS.length} things left to set up`)
    await card.getByRole('button', { name: "Your phone's warnings" }).click()
    await expect(page.locator('.wz-ov h1')).toHaveText("Your phone's warnings")
    await expect(page.getByText(`Step 6 of ${STEPS.length}`)).toBeVisible()
  })
  test('a finished step leaves the list', async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/')
    await expect(page.getByRole('region', { name: /left to set up/ })).toBeVisible()
    await kvSet(page, 'share.reviewed', true)
    await page.reload()
    await expect(page.getByRole('region', { name: /left to set up/ })).toContainText(`${STEPS.length - 1} things left to set up`)
  })
})

test.describe('iPhone in Safari', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' })
  test('notifications step shows Add to Home Screen, and no Health Connect step', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Step 4: Reminders and alerts' }).click()
    await expect(page.getByText('Add Bantay to your Home Screen first')).toBeVisible()
    await expect(page.getByRole('button', { name: /Phone health data/ })).toHaveCount(0)
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

test.describe("alerts-off card on Today", () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test("is not clipped at 375px", async ({ page }) => {
    await skipOnboarding(page)
    await page.goto("/")
    const card = page.getByRole("region", { name: "Alerts are off" })
    await expect(card).toBeVisible()
    await page.waitForTimeout(1500)
    expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    await expect(card.getByRole("button", { name: "Turn on alerts" })).toBeInViewport()
  })
})
