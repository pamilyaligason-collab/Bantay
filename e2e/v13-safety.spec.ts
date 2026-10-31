import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertNarrow, assertNoSideways, assertTargets, assertTextContrast, setScheme, shotsLightDark } from './v13'

// Phase 1 lane S (v13): the ten Safety screens through the shared e2e/v13.ts helpers (boxes and computed colours, never page heights).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

const SCREENS: Array<[name: string, hash: string]> = [
  ['Safety', '#safety'], ['Warnings', '#safety/warnings'], ['StormTracker', '#safety/storms'], ['Hazards', '#safety/hazards'], ['RescueMap', '#safety/map'],
  ['FirstAid', '#safety/firstaid'], ['FirstAidCPR', '#safety/firstaid/cpr'], ['OfflineMaps', '#safety/offline'], ['World', '#safety/world'], ['AlertSettings', '#safety/alerts']
]

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
})

let errors: string[] = []
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })
})

for (const [name, hash] of SCREENS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${name} ${scheme} 390: targets, contrast, no sideways, no console errors`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`/${hash}`)
      await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
      await setScheme(page, scheme)
      await assertTargets(page)
      await assertTextContrast(page)
      await assertNoSideways(page)
      expect(errors).toEqual([])
    })
  }
  test(`${name} 360: targets and no sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto(`/${hash}`)
    await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
    await assertTargets(page)
    await assertNoSideways(page)
  })
  test(`${name} 195: no sideways, targets, no wrapped buttons`, async ({ page }) => {
    await page.goto(`/${hash}`)
    await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
    await assertNarrow(page)
  })
  test(`${name}: shots (only with V13_SHOTS=<dir>)`, async ({ page }) => {
    await page.goto(`/${hash}`)
    await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
    await page.waitForTimeout(600)
    await shotsLightDark(page, name)
  })
}

test('Safety home has exactly one hero', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.locator('h1').first()).toBeVisible()
  await assertHero(page)
})

test.describe('CPR beat under reduced motion', () => {
  test('Start toggles aria-pressed and the beat dot gains and loses data-on', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => { const w = window as unknown as { __buzz: number }; w.__buzz = 0; navigator.vibrate = () => { w.__buzz++; return true } })
    await page.goto('/#safety/firstaid/cpr')
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true')
    const dot = page.locator('[data-testid="cpr-beat"] .cpr-dot')
    await expect(dot).toHaveAttribute('data-on', 'true', { timeout: 1500 })
    await expect(dot).toHaveAttribute('data-on', 'false', { timeout: 1500 })
    expect(await page.evaluate(() => (window as unknown as { __buzz: number }).__buzz)).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(dot).toHaveAttribute('data-on', 'false')
  })
})

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
    await assertTargets(page)
    await assertNoSideways(page)
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
    await assertTargets(page)
    await assertNoSideways(page)
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
    await assertTargets(page)
    await assertNoSideways(page)
  })
})
