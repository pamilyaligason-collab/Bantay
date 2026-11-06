import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { assertJackHit, assertNoSideways, setScheme, type JackAllow } from './v13'
import { admin, member } from './fixtures/s16/settings'
import { QUAKE, row } from './fixtures/s16/today'
import { shotPath } from './shotPath'

// Maps round 2, lane M4 (D-131, D-132): the World map card edge to edge at 300 px with its colour pins, and the admin-only Labs switches. Signed-in build, every call mocked, invented events.
const DIR = shotPath('docs/redesign-2026-10-31/shots/maps-M4')
mkdirSync(DIR, { recursive: true })
// The app's alerts pull replaces anything seeded in IndexedDB, so the pins are served as safety_alerts rows (the live path).
const NOW = new Date().toISOString() // fresh, so no "not checked lately" note moves the page
const ALERTS = [{ ...QUAKE, issuedAt: NOW, checkedAt: NOW, id: 'q-davao', title: 'Example quake near Davao', lat: 7.1, lon: 125.6 }, { ...QUAKE, issuedAt: NOW, checkedAt: NOW, id: 'pv1', kind: 'volcano', level: 'Level 2', title: 'Example volcano, alert level 2', source: 'PHIVOLCS', lat: 13.2, lon: 123.6 }]

// D-128: whole-card links only may sit under Jack: the alert rows of the lists (measured 86 to 89% tappable at 1000 tall with pins). The Filter row sits above the map, far from his corner, so it has no allowance.
const WORLD_ALLOW: JackAllow[] = [{ name: 'Alert row', sel: 'a.rw-main' }]

async function openWorld(page: Page, scheme: 'light' | 'dark', w: number, flag: boolean, pins = true, h = 844) {
  await admin(page)
  await page.addInitScript((on) => { if (on) localStorage.setItem('bantay.flags', JSON.stringify({ offlineMaps: true })) }, flag)
  await page.route('https://bantay-test.supabase.test/rest/v1/safety_alerts*', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: (pins ? ALERTS : []).map(row), headers: { 'access-control-allow-origin': '*' } }) : r.fallback()))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/#today')
  await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
  await page.evaluate(() => { location.hash = '#safety/world' })
  await setScheme(page, scheme)
  await expect(page.getByTestId('world-map')).toBeVisible()
}

for (const [scheme, w, flag] of [['light', 390, false], ['dark', 390, false], ['light', 450, true], ['dark', 450, true]] as const) {
  test(`World map card ${scheme} ${w} flag ${flag}: edge to edge, 300 px, colour pins, Jack clear`, async ({ page }) => {
    await openWorld(page, scheme, w, flag)
    const box = await page.getByTestId('world-map').boundingBox()
    expect(Math.round(box!.width), 'edge to edge').toBe(w)
    expect(Math.round(box!.x)).toBe(0)
    const layer = await page.locator('[data-testid=world-map] .mapc-layer').boundingBox()
    expect(Math.round(layer!.height)).toBe(300)
    await expect(page.locator('path.wm.wm-quake')).toHaveCount(1) // pins keep their colour classes
    await expect(page.locator('path.wm.wm-volcano')).toHaveCount(1)
    await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible()
    await assertNoSideways(page)
    await assertJackHit(page, WORLD_ALLOW, `world ${scheme} ${w}`)
    await page.screenshot({ path: `${DIR}/world-${scheme}-${w}.png`, animations: 'disabled' })
  })
}

for (const w of [360, 390, 430, 450]) {
  for (const h of [800, 1000]) {
    for (const pins of [false, true]) {
      test(`World ${w}x${h} ${pins ? 'with pins' : 'empty'}: card edge to edge, Filter clear of Jack`, async ({ page }) => {
        await openWorld(page, 'light', w, false, pins, h)
        expect(Math.round((await page.getByTestId('world-map').boundingBox())!.width)).toBe(w)
        await expect(page.locator('path.wm')).toHaveCount(pins ? 2 : 0)
        await assertJackHit(page, WORLD_ALLOW, `world ${w}x${h} ${pins ? 'pins' : 'empty'}`)
      })
    }
  }
}

test('Labs: an admin flips Offline maps and the stored flags change; a member sees no Labs', async ({ page }) => {
  await admin(page)
  await page.goto('/#me')
  const sw = page.getByRole('switch', { name: 'Offline maps' })
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await sw.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${DIR}/labs-light-390.png`, animations: 'disabled' })
  await Promise.all([page.waitForEvent('load'), sw.click()]) // the page reloads
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bantay.flags') ?? '{}'))).toMatchObject({ offlineMaps: true })
  await expect(page.getByRole('switch', { name: 'Offline maps' })).toHaveAttribute('aria-checked', 'true')
})

test('Labs: hidden for a member', async ({ page }) => {
  await member(page)
  await page.goto('/#me')
  await expect(page.getByTestId('settings-overview')).toBeVisible()
  await expect(page.getByTestId('settings-labs')).toHaveCount(0)
})
