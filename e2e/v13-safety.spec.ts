import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Phase 1 lane S. Local helpers until F0-D's e2e/v13.ts lands, then swap these for its imports.
test.use({ viewport: { width: 390, height: 844 } })

export const targets44 = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, button, input, [role=switch]')]
  .map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44)).map(({ e }) => e.outerHTML.slice(0, 80)))
export const noSideways = (page: Page) => page.evaluate(() => { const s = document.querySelector('.bt .scroll'); return !s || s.scrollWidth <= s.clientWidth })
export const oneHero = (page: Page) => page.locator('[data-hero]').count()

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
})

for (const h of ['#safety/firstaid', '#safety/firstaid/cpr', '#safety/world', '#safety/offline', '#safety/alerts']) {
  test(`${h}: renders main and a way back or the Near me | World switch`, async ({ page }) => {
    await page.goto(`/${h}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('a[aria-label^="Back"], [role=group][aria-label="Show"]').first()).toBeVisible()
  })
}

// ---- S3 Warnings ----
test.describe('S3', () => {
  const seedQuake = (page: Page) => page.evaluate(async () => {
    const q = { id: 'q-s3', kind: 'quake', level: 'M4.6', title: 'M 4.6 - 7 km NE of Tago', what: 'Moderate quake.', where: '7 km NE of Tago, Surigao del Sur', when: 'now', doNow: 'Drop, cover and hold on.', source: 'USGS', sourceUrl: null, issuedAt: new Date(Date.now() - 11 * 3_600_000).toISOString(), lat: 12.1, lon: 123.88, bulletin: 'x', checkedAt: new Date().toISOString() }
    await new Promise<void>((res, rej) => {
      const o = indexedDB.open('bantay')
      o.onerror = () => rej(o.error)
      o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ key: 'safety.alerts', value: [q] }); tx.oncomplete = () => { o.result.close(); res() } }
    })
  })
  test('warnings: empty state, then a seeded far quake shows Too far to feel, map, sources and a collapsed shaking row', async ({ page }) => {
    await page.goto('/#safety/warnings')
    await expect(page.getByTestId('warn-hero')).toContainText('No active warnings')
    await seedQuake(page)
    await page.reload()
    await expect(page.getByTestId('warn-hero')).toContainText('Too far to feel')
    await expect(page.getByRole('region', { name: /Map of the warning/ })).toBeVisible()
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
    await expect(page.getByRole('list', { name: 'Sources' })).toContainText('Checked')
    const shake = page.getByRole('button', { name: /If you ever feel shaking/ })
    await expect(shake).toHaveAttribute('aria-expanded', 'false')
    await shake.click()
    await expect(shake).toHaveAttribute('aria-expanded', 'true')
    expect(await targets44(page)).toEqual([])
    expect(await noSideways(page)).toBe(true)
  })
})

// ---- S4 Storm tracker ----
test.describe('S4', () => {
  test('storms: PAR polygon, No storms now, Windy waits for Load on cellular', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true }))
    await page.goto('/#safety/storms')
    await expect(page.getByTestId('storm-hero')).toContainText('No storms now')
    await expect(page.locator('.leaflet-interactive')).toHaveCount(0) // PAR ring is non-interactive; the path itself is .lm-par
    await expect(page.locator('path.lm-par')).toHaveCount(1)
    await expect(page.locator('iframe.sf-frame')).toHaveCount(0)
    await page.getByRole('button', { name: 'Load live layer' }).click()
    await expect(page.locator('iframe.sf-frame')).toHaveCount(1)
    expect(await targets44(page)).toEqual([])
    expect(await noSideways(page)).toBe(true)
  })
})

// ---- S5 Hazards ----
test.describe('S5', () => {
  test('hazards: Dampas readings, layer switch changes the caption only, NOAH and HazardHunterPH links', async ({ page }) => {
    await page.goto('/#safety/hazards')
    await expect(page.getByTestId('hazards-zone')).toContainText('Dampas')
    await expect(page.getByTestId('layer-caption')).toContainText('No flood map')
    await page.getByRole('button', { name: 'Landslide' }).click()
    await expect(page.getByTestId('layer-caption')).toContainText('Low')
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
    await expect(page.getByRole('link', { name: /Open in NOAH/ })).toHaveAttribute('href', 'https://noah.up.edu.ph/')
    await expect(page.getByRole('link', { name: /Open HazardHunterPH/ })).toBeVisible()
    expect(await targets44(page)).toEqual([])
    expect(await noSideways(page)).toBe(true)
  })
})
