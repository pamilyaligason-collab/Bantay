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

/** Setup lives on the checklist now (Me shows the full card, Today only nudges). Opens the wizard overlay at one step. */
const openStep = async (page: Page, title: string) => {
  await skipOnboarding(page)
  await page.goto('/#me')
  const card = page.getByRole('region', { name: /left to set up/ })
  await card.getByRole('button', { name: 'See all' }).click()
  await card.getByRole('button', { name: title, exact: true }).click()
  await expect(page.locator('.wz-ov h1')).toHaveText(title)
}

test.describe('onboarding screens 3 to 5 after joining', () => {
  test('first launch asks for reminders in context, with dots and Skip, no switches', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Medicine reminders')
    await expect(page.getByRole('img', { name: 'Step 3 of 5' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()
    await expect(page.getByRole('switch')).toHaveCount(0) // Bigger text and Simple mode live in Settings > Display
    await expect(page.locator('body')).not.toContainText(/admin/i)
  })

  test('Skip on 3, 4 and 5 opens Today with the consent line on screen 5, and remembers it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(page.locator('h1')).toHaveText('Where are you most days?')
    await expect(page.getByLabel(/latitude|longitude/i)).toHaveCount(0)
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(page.locator('h1')).toHaveText("Let's test it.")
    await expect(page.getByText(/Family admins can see them. Change this in Settings > Family and sharing./)).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(page.locator('h1')).toHaveText('Today')
    expect(await kv(page, 'onboarded')).toBe(true)
    await page.reload()
    await expect(page.locator('h1')).toHaveText('Today')
  })

  test('a zone chip saves the zone', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Skip' }).click()
    await page.getByRole('button', { name: 'Conel, GenSan' }).click()
    await expect(page.locator('h1')).toHaveText("Let's test it.")
    expect(await kv(page, 'loc.zone')).toBe('conel')
  })
})

test.describe('setup steps from the checklist', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 10.3157, longitude: 123.8854 } })
  test('walks every step with Skip and Finish, then closes', async ({ page }) => {
    await openStep(page, STEPS[0]!)
    for (const [i, title] of STEPS.entries()) {
      await expect(page.locator('.wz-ov h1')).toHaveText(title)
      await expect(page.getByText(`Step ${i + 1} of ${STEPS.length}`)).toBeVisible()
      if (i < STEPS.length - 1) await page.getByRole('button', { name: 'Skip' }).click()
    }
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page.locator('.wz-ov')).toHaveCount(0)
  })

  test('Back and the step dots move between steps', async ({ page }) => {
    await openStep(page, STEPS[0]!)
    await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled()
    await page.getByRole('button', { name: 'Step 4: Reminders and alerts' }).click()
    await expect(page.locator('.wz-ov h1')).toHaveText('Reminders and alerts')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.locator('.wz-ov h1')).toHaveText('Your medicines')
  })

  test('a step whose flag is already set leaves the list', async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#me')
    await expect(page.getByRole('region', { name: /left to set up/ })).toContainText(`${STEPS.length} things left`)
    await kvSet(page, 'profile.photo', 'data:image/jpeg;base64,AA==')
    await page.reload()
    await expect(page.getByRole('region', { name: /left to set up/ })).toContainText(`${STEPS.length - 1} things left`)
  })

  test('about me: pick suggestions, add your own, None is exclusive', async ({ page }) => {
    await openStep(page, 'About me')
    await page.getByRole('button', { name: 'O+' }).click()
    await page.getByRole('button', { name: 'Penicillin' }).click()
    await page.getByRole('button', { name: 'Peanuts' }).click()
    await page.getByLabel('Allergies: other').fill('Mango')
    await page.getByLabel('Allergies: other').press('Enter')
    await page.getByRole('button', { name: 'None', exact: true }).first().click()
    await page.getByRole('button', { name: 'Penicillin' }).click()
    await page.getByRole('button', { name: 'Diabetes' }).click()
    await page.getByRole('button', { name: 'Asthma' }).click()
    await expect.poll(() => kv(page, 'profile.about')).toEqual({ bloodType: 'O+', allergies: 'Penicillin', conditions: 'Diabetes, Asthma' })
    await page.getByRole('button', { name: 'Step 3: Your medicines' }).click()
    // medicines go to the medications table with a time (needs a signed-in person: profile-auth.spec.ts covers the writes); signed out there is nothing to save to
    await expect(page.getByText('Sign in to add medicines, each with a time.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Losartan' })).toHaveCount(0)
    expect(await kv(page, 'profile.medicines')).toBeUndefined()
  })

  test('notifications step: rows are off and the test reminder waits for permission', async ({ page }) => {
    await openStep(page, 'Reminders and alerts')
    await expect(page.getByText('Not on yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send a test reminder' })).toBeDisabled()
    await expect(page.getByText('reminders come from the family server')).toBeVisible()
  })

  test('SOS contacts step: two contact slots, no calling prompt on the web', async ({ page }) => {
    await openStep(page, 'SOS text contacts')
    await expect(page.getByLabel('Contact 1 name')).toBeVisible()
    await expect(page.getByLabel('Contact 2 phone number')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Allow calling' })).toHaveCount(0) // the calling permission is asked only in the Android app
  })

  test('location step has no prefilled barangay, and saves the one typed', async ({ page }) => {
    await openStep(page, 'Where you are')
    await expect(page.getByText('Updates when you open Bantay')).toBeVisible()
    await page.getByRole('button', { name: 'Choose my barangay instead' }).click()
    await expect(page.getByLabel('Latitude')).toHaveValue('')
    await expect(page.getByLabel('Longitude')).toHaveValue('')
    await page.getByLabel('Barangay').fill('Test Barangay')
    await page.getByLabel('Latitude').fill('10.5')
    await page.getByLabel('Longitude').fill('123.5')
    await page.getByRole('button', { name: 'Save my barangay' }).click()
    expect(await kv(page, 'loc.home')).toMatchObject({ name: 'Test Barangay', lat: 10.5, lon: 123.5 })
    await page.reload()
    const card = page.getByRole('region', { name: /left to set up/ })
    await expect(card).toContainText(`${STEPS.length - 1} things left`)
    await card.getByRole('button', { name: 'See all' }).click()
    await expect(card.getByRole('button', { name: 'Where you are', exact: true })).toHaveCount(0)
    await expect(card.getByRole('button', { name: "Your phone's warnings", exact: true })).toBeVisible()
  })
})

test.describe('notifications already allowed', () => {
  test.use({ permissions: ['notifications'] })
  test('the notifications step leaves the list', async ({ page }) => {
    // Headless Chromium grants the permission but still reports Notification.permission as "denied", which the web plugin reads.
    await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'granted' }))
    await skipOnboarding(page)
    await page.goto('/#me')
    const card = page.getByRole('region', { name: /left to set up/ })
    await expect(card).toContainText(`${STEPS.length - 1} things left`)
    await card.getByRole('button', { name: 'See all' }).click()
    await expect(card.getByRole('button', { name: 'Reminders and alerts', exact: true })).toHaveCount(0)
  })
})

test.describe('Me checklist', () => {
  test('lists the same count as the wizard and each item opens its own step', async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#me')
    const card = page.getByRole('region', { name: /left to set up/ })
    await expect(card).toContainText(`${STEPS.length} things left`)
    await expect(card.getByRole('button', { name: /^Next: / })).toBeVisible() // compact: one next step, the rest behind See all
    await card.getByRole('button', { name: 'See all' }).click()
    await card.getByRole('button', { name: "Your phone's warnings" }).click()
    await expect(page.locator('.wz-ov h1')).toHaveText("Your phone's warnings")
    await expect(page.getByText(`Step 6 of ${STEPS.length}`)).toBeVisible()
  })
  test('a finished step leaves the list', async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#me')
    await expect(page.getByRole('region', { name: /left to set up/ })).toBeVisible()
    await kvSet(page, 'setup.sharing', true)
    await page.reload()
    await expect(page.getByRole('region', { name: /left to set up/ })).toContainText(`${STEPS.length - 1} things left`)
  })
})

test.describe('iPhone in Safari', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' })
  test('notifications step shows Add to Home Screen, and no Health Connect step', async ({ page }) => {
    await openStep(page, 'Reminders and alerts')
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
  await expect(page.locator('h1')).toHaveText('Papers')
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
    await card.scrollIntoViewIfNeeded() // the card sits in the "More" group, below the fold on a 812px phone by design (D-50 order)
    expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    await expect(card.getByRole("button", { name: "Turn on alerts" })).toBeInViewport()
  })
})
