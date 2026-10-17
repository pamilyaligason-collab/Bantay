import { expect, test } from '@playwright/test'

test('tab hash deep-link and back button', async ({ page }) => {
  await page.goto('/#records')
  await expect(page.locator('h1')).toHaveText('Family')
  await expect(page.getByRole('button', { name: 'Records', pressed: true })).toBeVisible()
  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: 'People', pressed: true })).toBeVisible()
  await expect(page.locator('h1')).toHaveText('Family')
  await expect(page).toHaveURL(/#family$/)
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Records', pressed: true })).toBeVisible()
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
