import { expect, test } from '@playwright/test'

const ALERT = {
  id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now',
  doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: 'https://www.phivolcs.dost.gov.ph/', issuedAt: '2026-10-17T01:00:00Z',
  lat: 10.1, lon: 124.0, bulletin: 'Magnitude 5.1. No tsunami threat.', previousBulletin: 'Magnitude 4.9. No tsunami threat.'
}

test('safety screen: no alerts, hotlines, unknown places, maps load only on request', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.locator('h1')).toHaveText('Safety')
  await expect(page.getByText('No active warnings for your area')).toBeVisible()
  await expect(page.getByRole('link', { name: '911' }).first()).toBeVisible()
  await expect(page.getByText('160', { exact: true })).toHaveCount(0)
  // unconfirmed values are shown plainly and there is no Go button for them
  await expect(page.getByRole('button', { name: 'Not confirmed yet, tap to add' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /^Go to/ })).toHaveCount(0)
  // iframes are not mounted until asked
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByText('Ventusky weather map').click()
  const frame = page.locator('iframe[title^="Ventusky"]')
  await expect(frame).toHaveAttribute('src', /^https:\/\/embed\.ventusky\.com\/\?p=9\.65;123\.88;7&l=rain-3h&w=soft&pin=9\.65;123\.88;dot;Here$/)
  await expect(frame).toHaveAttribute('loading', 'lazy')
  // earthquake card says what Bantay is not
  await page.locator('summary', { hasText: /^Earthquake$/ }).click()
  await expect(page.getByText('Do not wait for a message.').first()).toBeVisible()
})

test('adding a pin gives a Go button that survives reload (offline store)', async ({ page }) => {
  await page.goto('/#safety')
  await page.getByRole('region', { name: 'Evacuation and rescue' }).getByRole('button', { name: 'Not confirmed yet, tap to add' }).first().click()
  await page.getByLabel('Latitude').fill('9.65')
  await page.getByLabel('Longitude').fill('123.88')
  await page.getByRole('button', { name: 'Save' }).click()
  const go = page.getByRole('link', { name: /^Go to/ })
  await expect(go).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=9.65,123.88&travelmode=walking')
  await page.reload()
  await expect(page.getByRole('link', { name: /^Go to/ })).toHaveCount(1)
})

test('an alert in Dexie shows on Safety and Today with depth on expand', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.getByText('No active warnings')).toBeVisible()
  await page.evaluate(async (alert) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('kv', 'readwrite')
        tx.objectStore('kv').put({ key: 'safety.alerts', value: [alert] })
        tx.oncomplete = () => { open.result.close(); res() }
      }
    })
  }, ALERT)
  await page.reload() // raw IndexedDB writes do not notify the live query
  await expect(page.getByText('Drop, cover and hold on.')).toBeVisible()
  await page.getByText('More detail').click()
  await expect(page.getByText('Added:', { exact: false }).first()).toBeVisible()
  await page.goto('/#today')
  await expect(page.getByText('Drop, cover and hold on.')).toBeVisible()
})

test.describe('Near me on the maps switcher', () => {
  test.describe('location allowed on tap', () => {
    test('Near me asks on tap, then centres the map and header on the phone', async ({ page }) => {
      await page.addInitScript(() => {
        // permission starts as "prompt": the only way to a position is the tap
        const w = window as unknown as { __gpsCalls: number }
        w.__gpsCalls = 0
        navigator.permissions.query = () => Promise.resolve({ state: 'prompt' } as PermissionStatus)
        navigator.geolocation.getCurrentPosition = (ok) => {
          w.__gpsCalls++
          ok({ coords: { latitude: 6.11, longitude: 125.17 } } as GeolocationPosition)
        }
      })
      await page.goto('/#safety')
      const near = page.getByRole('group', { name: 'Map place' }).getByRole('button', { name: 'Near me' })
      await expect(near).toHaveAttribute('aria-pressed', 'false')
      await expect(page.locator('.hdr .sf-chip')).toHaveText('Dampas')
      expect(await page.evaluate(() => (window as unknown as { __gpsCalls: number }).__gpsCalls)).toBe(0)
      await near.click()
      await expect(near).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('.hdr .sf-chip')).toHaveText('Near you · Conel')
      await page.getByText('Ventusky weather map').click()
      await expect(page.locator('iframe[title^="Ventusky"]')).toHaveAttribute('src', /p=6\.11;125\.17;7/)
    })
  })

  test.describe('location denied', () => {
    test('Near me is offered, explains, and keeps the previous place', async ({ page }) => {
      await page.addInitScript(() => {
        // headless Chrome shows no prompt; fail the ask the way a refusal does
        const w = window as unknown as { __gpsCalls: number }
        w.__gpsCalls = 0
        navigator.permissions.query = () => Promise.resolve({ state: 'prompt' } as PermissionStatus)
        navigator.geolocation.getCurrentPosition = (_ok, no) => (w.__gpsCalls++, no?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }))
      })
      await page.goto('/#safety')
      const group = page.getByRole('group', { name: 'Map place' })
      const near = group.getByRole('button', { name: 'Near me' })
      await expect(near).toBeVisible()
      expect(await page.evaluate(() => (window as unknown as { __gpsCalls: number }).__gpsCalls)).toBe(0)
      await near.click()
      await expect(page.getByText('Location is off for Bantay. Turn it on in your phone settings to see alerts near you.')).toBeVisible()
      await expect(near).toHaveAttribute('aria-pressed', 'false')
      await expect(group.getByRole('button', { pressed: true })).toHaveCount(1)
    })
  })
})

test('Safety order (D-62): 911, IDs and Insurance, advisory card, Quick dial, Live maps', async ({ page }) => {
  await page.goto('/#safety')
  const y = async (loc: ReturnType<typeof page.locator>) => (await loc.first().boundingBox())!.y
  const call = await y(page.getByRole('link', { name: 'Call 911' }))
  const ids = await y(page.getByRole('link', { name: 'My IDs' }))
  const warn = await y(page.getByRole('heading', { name: 'Warnings', exact: true }))
  const dial = await y(page.getByRole('heading', { name: 'Quick dial' }))
  const maps = await y(page.getByRole('heading', { name: 'Live maps' }))
  await expect(page.getByRole('link', { name: 'Medical ID' })).toHaveCount(0)
  expect(ids).toBeGreaterThan(call)
  expect(warn).toBeGreaterThan(ids)
  expect(dial).toBeGreaterThan(warn)
  expect(maps).toBeGreaterThan(dial)
  await expect(page.getByRole('link', { name: 'My IDs' })).toHaveAttribute('href', '#records')
})

test('zone pick reaches zone data (D-33): Conel has no Tagbilaran numbers or Dampas hazards', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.getByText('BFP Tagbilaran').first()).toBeVisible()
  await page.getByRole('button', { name: /^Place:/ }).click()
  await page.getByRole('group', { name: 'Zone' }).getByRole('button', { name: 'Conel' }).click()
  await expect(page.getByText('BFP Tagbilaran')).toHaveCount(0)
  await expect(page.getByText('No hazard readings for this zone yet')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call 911' })).toBeVisible()
})
