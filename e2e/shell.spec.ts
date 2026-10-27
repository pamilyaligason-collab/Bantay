import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

test('tab hash deep-link and back button', async ({ page }) => {
  await page.goto('/#family/plan')
  await expect(page.locator('h1')).toHaveText('Family')
  await expect(page.getByRole('button', { name: 'Plan', pressed: true })).toBeVisible()
  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: 'People', pressed: true })).toBeVisible()
  await expect(page.locator('h1')).toHaveText('Family')
  await expect(page).toHaveURL(/#family$/)
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Plan', pressed: true })).toBeVisible()
})

test('installable: manifest fields and service worker', async ({ page }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const res = await page.request.get(new URL(href!, page.url()).toString())
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.name).toBe('Family Bantay')
  expect(m.short_name).toBe('Bantay')
  expect(m.start_url).toBeTruthy()
  expect(m.display).toBe('standalone')
  expect(m.icons.length).toBeGreaterThan(0)
  for (const icon of m.icons) {
    const r = await page.request.get(new URL(icon.src, page.url()).toString())
    expect(r.ok()).toBe(true)
  }
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.scope
  })
  expect(scope).toContain('localhost')
})

test('tab bar has five equal slots (Today, Health, Discover, Family, Safety); Jack floats above it', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('button')).toHaveCount(5)
  await expect(nav.getByRole('button', { name: 'Discover' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Ask Bantay' })).toHaveCount(0)
  const widths = await nav.getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
  const jack = (await page.getByRole('button', { name: 'Ask Bantay' }).boundingBox())!
  const bar = (await nav.boundingBox())!
  expect(jack.y + jack.height).toBeLessThanOrEqual(bar.y) // floats above the bar, not inside it
})

test('component button rules beat the .bt reset: tab labels are 13px/600', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  const b = page.locator('.sh-tabs button').first()
  await expect(b).toBeVisible()
  expect(await b.evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight] })).toEqual(['13px', '600'])
})

test('sub-pages show only their own header; tab roots keep the top bar', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#weather')
  await expect(page.locator('.sh-back')).toBeVisible()
  await expect(page.locator('.topbar')).toHaveCount(0)
  await page.goto('/#health')
  await expect(page.locator('.topbar')).toHaveCount(1)
})

test('avatar opens Me and bell opens notifications', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await page.getByRole('link', { name: /Me and settings/ }).click()
  await expect(page).toHaveURL(/#me$/)
  await expect(page.locator('h1')).toHaveText('Me')
  await page.goto('/#today')
  await page.getByRole('link', { name: /Notifications/ }).click()
  await expect(page).toHaveURL(/#notif$/)
  await expect(page.getByText('No alerts yet')).toBeVisible()
  await expect(page.getByText('Alerts never show readings or results. Open Bantay to see more.')).toBeVisible()
})

test('Me: sharing is off, no tab is active, Family no longer shows phone settings', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#me')
  await expect(page.getByRole('switch', { name: 'Share readings' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('navigation', { name: 'Main' }).locator('[aria-current="page"]')).toHaveCount(0)
  await page.goto('/#family')
  await expect(page.getByText('This phone')).toHaveCount(0)
})
