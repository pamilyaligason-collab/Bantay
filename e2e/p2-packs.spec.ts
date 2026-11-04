import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertNarrow, assertNoSideways, assertTargets, assertTextContrast, setScheme, settled, shotsLightDark } from './v13'
import { pmtilesFile, tileBytes } from './fixtures/p2/pmtilesFixture'
import { DAMPAS } from '../src/features/location/geo'

// Phase 2 lane L: region packs in the app. Flag off must show nothing new; flag on shows the bundled home pack (no network in the e2e build),
// "Not checked for this place yet" without a hazard file, and a NOAH level once a (fixture) hazard file is on the phone.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

const flag = (page: Page, on: boolean) => page.addInitScript((v) => { if (v) localStorage.setItem('bantay.flags', JSON.stringify({ localPacks: true })) }, on)
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
})

/** Put a hazard file (fixture, level 1 = Low at the Dampas pin) on the phone, as a finished download would. Then reload. */
async function seedHazardFile(page: Page) {
  const bytes = pmtilesFile(tileBytes(DAMPAS, 1), false, DAMPAS)
  await page.goto('/#safety')
  await settled(page)
  await page.evaluate(([b64, bounds]) => new Promise<void>((done, fail) => {
    const raw = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))
    const o = indexedDB.open('bantay')
    o.onerror = () => fail(new Error('open failed'))
    o.onsuccess = () => {
      const tx = o.result.transaction('packs', 'readwrite')
      tx.objectStore('packs').put({ code: '0701200000', version: 1, checksum: 'fixture', name: 'Bohol', neighbours: [], fetchedAt: 1, usedAt: Date.now(), pinned: true, hazards: { checksum: 'fixture', bounds, blob: new Blob([raw]) } })
      tx.oncomplete = () => { o.result.close(); done() }
      tx.onerror = () => fail(new Error('put failed'))
    }
  }), [bytes.toString('base64'), { flood: [DAMPAS.lon - 0.4, DAMPAS.lat - 0.3, DAMPAS.lon + 0.3, DAMPAS.lat + 0.3], landslide: [DAMPAS.lon - 0.4, DAMPAS.lat - 0.3, DAMPAS.lon + 0.3, DAMPAS.lat + 0.3] }] as const)
  await page.reload()
}

test.describe('flag off: identical to main', () => {
  test.beforeEach(({ page }) => flag(page, false))
  test('Quick dial, Rescue map and Hazards show nothing from packs', async ({ page }) => {
    await page.goto('/#safety/dial'); await settled(page)
    await expect(page.getByTestId('pack-dial')).toHaveCount(0)
    await page.goto('/#safety/hazards'); await settled(page)
    await expect(page.getByTestId('noah-missing')).toHaveCount(0)
    await expect(page.getByTestId('noah-credit')).toHaveCount(0)
    await expect(page.getByTestId('layer-caption')).toContainText('No flood map for this place yet')
  })
})

test.describe('flag on', () => {
  test.beforeEach(({ page }) => flag(page, true))

  for (const scheme of ['light', 'dark'] as const) {
    test(`Quick dial ${scheme} 390: pack numbers with dates, copy for undialable`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/#safety/dial'); await settled(page)
      await setScheme(page, scheme)
      const pack = page.getByTestId('pack-dial')
      await expect(pack).toBeVisible()
      await expect(pack.getByRole('link', { name: /^Call / }).first()).toBeVisible()
      await expect(pack.getByText(/^Checked 20\d\d-\d\d-\d\d/).first()).toBeVisible()
      await pack.scrollIntoViewIfNeeded()
      await assertTargets(page); await assertNoSideways(page); await assertTextContrast(page)
      if (scheme === 'light') await shotsLightDark(page, 'QuickDial-packs')
    })
    test(`Rescue map ${scheme} 390: the pack list shows with confirmed and not-confirmed badges`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/#safety/map'); await settled(page)
      await setScheme(page, scheme)
      await expect(page.getByText(/^Not confirmed$|^Confirmed/).first()).toBeVisible()
      await assertTargets(page); await assertNoSideways(page); await assertTextContrast(page)
      if (scheme === 'light') await shotsLightDark(page, 'RescueMap-packs')
    })
    test(`Hazards ${scheme} 390: no file yet says so; a file on the phone gives the NOAH level`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/#safety/hazards'); await settled(page)
      await setScheme(page, scheme)
      await expect(page.getByTestId('noah-missing')).toContainText('Hazard map not on this phone yet')
      await assertTargets(page); await assertNoSideways(page); await assertTextContrast(page)
      await seedHazardFile(page)
      await page.goto('/#safety/hazards'); await settled(page)
      await setScheme(page, scheme)
      await expect(page.getByTestId('layer-caption')).toContainText('Flood level from NOAH: Low')
      await expect(page.getByTestId('noah-credit')).toContainText('UP NOAH Center (Project NOAH), ODbL 1.0')
      await page.getByTestId('noah-credit').scrollIntoViewIfNeeded()
      await assertTargets(page); await assertNoSideways(page); await assertTextContrast(page)
      if (scheme === 'light') await shotsLightDark(page, 'Hazards-packs')
    })
  }

  test('360 and 195 wide: no sideways scroll on the three screens', async ({ page }) => {
    for (const hash of ['#safety/dial', '#safety/map', '#safety/hazards']) {
      await page.setViewportSize({ width: 360, height: 780 })
      await page.goto(`/${hash}`); await settled(page)
      await assertTargets(page); await assertNoSideways(page)
      await page.setViewportSize({ width: 195, height: 780 })
      await assertNarrow(page)
    }
  })
})
