import { expect, test } from '@playwright/test'

const ALERT = {
  id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now',
  doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: 'https://www.phivolcs.dost.gov.ph/', issuedAt: '2026-10-17T01:00:00Z',
  lat: 10.1, lon: 124.0, bulletin: 'Magnitude 5.1. No tsunami threat.', previousBulletin: 'Magnitude 4.9. No tsunami threat.'
}

// no safety test depends on the outside network: the Windy embed is an empty page
test.beforeEach(async ({ page }) => {
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }))
})

test('safety hub (D-68): ten tiles with a status line, each opens its page and goes back', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.locator('h1')).toHaveText('Safety')
  const tiles = page.getByRole('navigation', { name: 'Safety topics' }).getByRole('link')
  await expect(tiles).toHaveCount(10)
  await expect(tiles.filter({ hasText: 'Warnings' })).toContainText('None now')
  await expect(tiles.filter({ hasText: 'Quick dial' })).toContainText('4 numbers ready')
  await expect(tiles.filter({ hasText: 'Past SOS' })).toContainText('None sent')
  await tiles.filter({ hasText: 'Quick dial' }).click()
  await expect(page).toHaveURL(/#safety\/dial$/)
  await expect(page.locator('h1')).toHaveText('Quick dial')
  await page.getByRole('link', { name: 'Back to Safety' }).click()
  await expect(page.locator('h1')).toHaveText('Safety')
})

test('warnings page: none now; quick dial: only confirmed numbers, the rest collapsed; maps load only on request', async ({ page }) => {
  await page.goto('/#safety/warnings')
  await expect(page.getByText('No active warnings for your area')).toBeVisible()
  await page.goto('/#safety/dial')
  await expect(page.getByRole('link', { name: /Call National emergency, 911/ })).toHaveAttribute('href', 'tel:911')
  await expect(page.getByRole('link', { name: /Call Philippine Red Cross, 143/ })).toBeVisible()
  await expect(page.getByText('160', { exact: true })).toHaveCount(0)
  // unconfirmed values wait in a closed group and there is no Go button for them
  const addBtn = page.getByRole('button', { name: /^Add number for / }).first()
  await expect(page.getByText('Add a local number')).toBeVisible()
  await expect(addBtn).toBeVisible()
  // layout: at phone width the name column is wider than the Add button (the button once took the whole row)
  await page.setViewportSize({ width: 390, height: 844 })
  const w = await page.locator('.sf-addbtn').first().evaluate((b) => ({ add: b.getBoundingClientRect().width, name: (b.parentElement!.querySelector('.sf-pt') as HTMLElement).getBoundingClientRect().width }))
  expect(w.name).toBeGreaterThan(w.add)
  await expect(page.getByRole('link', { name: /^Go to/ })).toHaveCount(0)
  // source text is behind the small i button, not under every row
  await expect(page.getByText('Source:')).toHaveCount(0)
  await page.getByRole('button', { name: 'Where National emergency came from' }).click()
  await expect(page.getByRole('dialog', { name: 'National emergency' })).toContainText('Source: National emergency number')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/#safety/weather')
  // iframes are not mounted until asked
  await expect(page.locator('iframe[title^="Ventusky"]')).toHaveCount(0)
  await page.getByText('Ventusky weather map').click()
  const frame = page.locator('iframe[title^="Ventusky"]')
  await expect(frame).toHaveAttribute('src', /^https:\/\/embed\.ventusky\.com\/\?p=9\.65;123\.88;7&l=rain-3h&w=soft&pin=9\.65;123\.88;dot;Here$/)
  await expect(frame).toHaveAttribute('loading', 'lazy')
})

test('adding a pin gives a Go button that survives reload (offline store)', async ({ page }) => {
  await page.goto('/#safety/map')
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
  await page.goto('/#safety/warnings')
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
      await page.goto('/#safety/weather')
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
      await page.goto('/#safety/weather')
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

test('Safety order (D-68): SOS, Call 911 + Medical ID, then the tile grid', async ({ page }) => {
  await page.goto('/#safety')
  const y = async (loc: ReturnType<typeof page.locator>) => (await loc.first().boundingBox())!.y
  const sos = await y(page.getByRole('button', { name: /^SOS\./ }))
  const call = await y(page.getByRole('link', { name: 'Call 911' }))
  const med = await y(page.getByRole('link', { name: 'Medical ID' }))
  const nav = page.getByRole('navigation', { name: 'Safety topics' })
  const tiles = await y(nav)
  expect(call).toBeGreaterThan(sos)
  expect(Math.abs(med - call)).toBeLessThan(4)
  expect(tiles).toBeGreaterThan(call)
  const want: [string, string][] = [['Warnings', '#safety/warnings'], ['Weather maps', '#safety/weather'], ['Storm tracker', '#safety/storms'], ['Rescue map', '#safety/map'], ['Quick dial', '#safety/dial'],
    ['Hazards at my location', '#safety/hazards'], ['Go-bag', '#gobag'], ['Safety cards', '#safety/cards'], ['IDs and insurance', '#docs'], ['Past SOS', '#safety/sos']]
  for (const [t, href] of want) await expect(nav.getByRole('link', { name: new RegExp('^' + t) })).toHaveAttribute('href', href)
  for (const box of await nav.getByRole('link').all()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('link', { name: 'Medical ID' })).toHaveAttribute('href', '#medid')
})

test('SOS: the confirm button opens the flow, finds the place, builds the text and the safe text', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 9.65, longitude: 123.88 })
  await page.addInitScript(() => {
    localStorage.setItem('bantay.onboarded', '1')
  })
  await page.goto('/#safety')
  await page.evaluate(() => new Promise<void>((ok) => {
    const r = indexedDB.open('bantay')
    r.onsuccess = () => {
      const tx = r.result.transaction('kv', 'readwrite')
      tx.objectStore('kv').put({ key: 'sos.contacts', value: [{ name: 'Papa', phone: '0917 123 4567' }, { name: 'Joy', phone: '+63 918 765 4321' }] })
      tx.oncomplete = () => ok()
    }
  }))
  await page.reload()
  await page.getByRole('button', { name: 'Cannot hold? Use a button instead' }).click()
  await page.getByRole('button', { name: 'Yes, send SOS' }).click()
  await expect(page.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
  const text = page.getByRole('link', { name: /Open the text to Papa and Joy/ })
  await expect(text).toBeVisible()
  const href = (await text.getAttribute('href'))!
  expect(href).toMatch(/^sms:09171234567,\+639187654321\?body=/)
  expect(decodeURIComponent(href)).toMatch(/I need help\. My location: https:\/\/maps\.google\.com\/\?q=9\.65,123\.88 \(/)
  await page.getByRole('link', { name: /9\.65000, 123\.88000/ }).waitFor()
  await expect(page.getByRole('button', { name: "I'm safe now" })).toBeEnabled()
})

test('SOS with no contacts still offers 911 and asks for contacts', async ({ page }) => {
  await page.goto('/#safety')
  await page.getByRole('button', { name: 'Cannot hold? Use a button instead' }).click()
  await page.getByRole('button', { name: 'Yes, send SOS' }).click()
  await expect(page.getByRole('link', { name: 'Call 911' })).toBeVisible()
  await expect(page.getByText('Nobody will get a text yet')).toBeVisible()
})

test('Medical ID and Go-bag screens open from Safety and go back', async ({ page }) => {
  await page.goto('/#safety')
  await page.getByRole('link', { name: 'Medical ID' }).click()
  await expect(page.getByRole('heading', { name: 'Medical ID' })).toBeVisible()
  await expect(page.getByText('Show on lock screen')).toBeVisible()
  await page.getByRole('link', { name: 'Back to Safety' }).click()
  await expect(page.getByRole('heading', { name: 'Safety', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /^Go-bag/ }).click()
  const water = page.getByRole('checkbox', { name: /Drinking water/ })
  await water.click()
  await expect(water).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Drinking water/ })).toHaveAttribute('aria-checked', 'true')
})

test('zone pick reaches zone data (D-33): Conel has no Tagbilaran places or Dampas hazards', async ({ page }) => {
  await page.goto('/#safety/map')
  await expect(page.getByText('BFP Tagbilaran fire station').first()).toBeVisible()
  await page.getByRole('button', { name: /^Place:/ }).click()
  await page.getByRole('group', { name: 'Zone' }).getByRole('button', { name: 'Conel' }).click()
  await expect(page.getByText('BFP Tagbilaran')).toHaveCount(0)
  await page.goto('/#safety/hazards')
  await expect(page.getByText('No hazard readings for this zone yet')).toBeVisible()
  await page.goto('/#safety')
  await expect(page.getByRole('link', { name: 'Call 911' })).toBeVisible()
})

test('hazards at my location: four level cards with what to do, HazardHunterPH link, source behind i', async ({ page }) => {
  await page.goto('/#safety/hazards')
  await expect(page.locator('h1')).toHaveText('Hazards at my location')
  for (const t of ['Flood', 'Landslide', 'Storm surge', 'Earthquake']) await expect(page.getByRole('article', { name: t })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Flood' })).toContainText('Not confirmed yet')
  await expect(page.getByRole('article', { name: 'Earthquake' })).toContainText('Prone, Intensity VIII')
  await expect(page.getByRole('article', { name: 'Earthquake' })).toContainText('Drop, cover and hold on')
  await expect(page.getByRole('link', { name: 'Open HazardHunterPH' })).toHaveAttribute('href', /hazardhunter\.georisk\.gov\.ph/)
  await page.getByRole('button', { name: 'Where these readings came from' }).click()
  await expect(page.getByRole('dialog')).toContainText('HazardHunterPH')
})

test('storm tracker, safety cards and past SOS pages open', async ({ page }) => {
  await page.goto('/#safety/storms')
  await expect(page.getByText(/No storm warnings for the Philippines/)).toBeVisible()
  await page.goto('/#safety/cards')
  await page.locator('summary', { hasText: /^Earthquake$/ }).click()
  await expect(page.getByText('Do not wait for a message.').first()).toBeVisible()
  await page.goto('/#safety/sos')
  await expect(page.getByText('No SOS sent from this phone yet.')).toBeVisible()
})

test('live weather: layer switch only changes overlay, storm tracker and links', async ({ page }) => {
  await page.goto('/#safety/weather')
  const sec = page.getByRole('region', { name: 'Live weather' })
  await sec.scrollIntoViewIfNeeded()
  const main = sec.locator('iframe').first()
  await expect(main).toHaveAttribute('src', /overlay=rain&.*lat=9\.65&lon=123\.88/)
  await sec.getByRole('button', { name: 'Wind' }).click()
  await expect(main).toHaveAttribute('src', /overlay=wind&/)
  await expect(sec.getByText('Storms near the Philippines')).toBeVisible()
  await expect(sec.getByText(/No storm warnings for the Philippines/)).toBeVisible()
  await expect(sec.locator('iframe[title^="Windy wind map of the Western"]')).toHaveAttribute('src', /zoom=4&overlay=wind.*lat=12\.00&lon=128\.00/)
  await expect(sec.getByRole('link', { name: /PAGASA bulletin/ })).toHaveAttribute('target', '_blank')
  await page.context().setOffline(true)
  await expect(sec.getByText('Maps need internet').first()).toBeVisible()
})
