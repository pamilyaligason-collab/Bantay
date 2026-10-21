import { expect, test, type Page } from '@playwright/test'
import { openChat, skipOnboarding } from './helpers'

test.use({ viewport: { width: 390, height: 844 } })

/** Scroll the main area to its end, then report the bottom of the last visible element and the top of the tab bar. */
const measure = (page: Page) =>
  page.evaluate(async () => {
    const main = document.querySelector('main.scroll') as HTMLElement
    main.scrollTop = main.scrollHeight
    await new Promise((r) => setTimeout(r, 300))
    main.scrollTop = main.scrollHeight
    const kids = Array.from(main.querySelectorAll<HTMLElement>('*')).filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).visibility !== 'hidden'
    })
    const bottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom))
    const bar = document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect()
    return { bottom, barTop: bar.top }
  })

for (const tab of ['today', 'health', 'family', 'safety', 'me', 'weather', 'safety/dial', 'safety/warnings', 'health/meds']) {
  test(`${tab}: the last element ends above the tab bar`, async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#' + tab)
    await page.waitForTimeout(500)
    const m = await measure(page)
    expect(m.bottom, `${tab}: content bottom ${m.bottom} vs tab bar top ${m.barTop}`).toBeLessThanOrEqual(m.barTop)
  })
}

test('family plan: the Add button sits above the tab bar', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#family/plan')
  const fab = page.locator('.fm-fab')
  await expect(fab).toBeVisible()
  await page.waitForTimeout(500)
  const m = await measure(page)
  const b = (await fab.boundingBox())!
  expect(b.y + b.height, `FAB bottom ${b.y + b.height} vs tab bar top ${m.barTop}`).toBeLessThanOrEqual(m.barTop)
  expect(m.bottom).toBeLessThanOrEqual(m.barTop)
})

test('greeting shows on Today only', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-top-greet')).toBeVisible()
  for (const t of ['health', 'family', 'safety']) {
    await page.goto('/#' + t)
    await expect(page.locator('.sh-top-greet')).toHaveCount(0)
  }
})

test('Ask: the composer sits at the bottom of the screen with no gap under it', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await openChat(page)
  const form = page.locator('.as-form')
  await expect(form).toBeVisible()
  await page.waitForTimeout(600) // the sheet slides in
  const b = (await form.boundingBox())!
  expect(b.y + b.height).toBeLessThanOrEqual(844)
  expect(844 - (b.y + b.height)).toBeLessThanOrEqual(40)
})
