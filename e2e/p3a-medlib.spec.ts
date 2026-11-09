import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S26 P3A (D-167): the full medical library asks once, downloads only on Wi-Fi, then collapses to one Ready row. The pack is the small test fixture, served by a route (no real download).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.P3A_SHOTS ?? 'test-results/p3a'
const PACK = readFileSync('scripts/medlib/fixtures/mini.pack')

async function boot(page: Page, type: string, scheme: 'light' | 'dark') {
  await skipOnboarding(page)
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript((t) => { Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { type: t, saveData: false }) }) }, type)
  const hits: string[] = []
  await page.route('**/medlib/**', (r) => {
    hits.push(r.request().url())
    return r.fulfill({ status: 206, headers: { 'content-range': `bytes 0-${PACK.length - 1}/${PACK.length}`, etag: '"p3a"' }, body: PACK })
  })
  await page.goto('/#health/library')
  return hits
}

const noSideways = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)

for (const scheme of ['light', 'dark'] as const) {
  test(`asks once on mobile data and downloads nothing (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const hits = await boot(page, 'cellular', scheme)
    const card = page.getByTestId('full-library')
    await card.scrollIntoViewIfNeeded()
    await expect(card.getByText(/on Wi-Fi automatically\?/)).toBeVisible()
    await card.screenshot({ path: `${SHOTS}/ask-${scheme}.png` })
    await card.getByRole('button', { name: 'Yes' }).click()
    await expect(card.getByText('It will download while Bantay is open on Wi-Fi.')).toBeVisible()
    await page.waitForTimeout(300)
    expect(hits).toEqual([])
    await page.reload()
    await expect(card.getByText('Automatic Wi-Fi download is on.')).toBeVisible()
    await expect(card.getByText(/automatically\?/)).toHaveCount(0)
    await noSideways(page)
  })

  test(`on Wi-Fi it downloads, collapses to one Ready row, Delete confirms (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await boot(page, 'wifi', scheme)
    const card = page.getByTestId('full-library')
    await card.getByRole('button', { name: 'Yes' }).click()
    await expect(card.getByText(/^Full medical library · Ready · \d+ MB$/)).toBeVisible()
    await card.screenshot({ path: `${SHOTS}/ready-${scheme}.png` })
    const del = card.getByRole('button', { name: 'Delete' })
    expect((await del.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await del.click()
    await expect(card.getByText(/It will not download again by itself/)).toBeVisible()
    await card.screenshot({ path: `${SHOTS}/delete-${scheme}.png` })
    await card.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(card.getByRole('button', { name: 'Get' })).toBeVisible()
    await noSideways(page)
  })
}

test('195 px: the ask and the Ready row fit with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 195, height: 700 })
  await boot(page, 'cellular', 'light')
  const card = page.getByTestId('full-library')
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByText(/on Wi-Fi automatically\?/)).toBeVisible()
  await card.screenshot({ path: `${SHOTS}/ask-195.png` })
  await noSideways(page)
  await page.unroute('**/medlib/**')
  await page.evaluate(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { type: 'wifi' }) }))
  await page.route('**/medlib/**', (r) => r.fulfill({ status: 206, headers: { 'content-range': `bytes 0-${PACK.length - 1}/${PACK.length}` }, body: PACK }))
  await card.getByRole('button', { name: 'Not now' }).click()
  await card.getByRole('button', { name: 'Turn on' }).click()
  await expect(card.getByText(/Ready · \d+ MB/)).toBeVisible()
  await card.screenshot({ path: `${SHOTS}/ready-195.png` })
  await noSideways(page)
})
