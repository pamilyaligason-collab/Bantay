import { expect, test } from '@playwright/test'
import { assertTargets } from './v13'

const ALERT = {
  id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now',
  doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: 'https://www.phivolcs.dost.gov.ph/', issuedAt: '2026-10-17T01:00:00Z',
  lat: 10.1, lon: 124.0, bulletin: 'Magnitude 5.1. No tsunami threat.', previousBulletin: 'Magnitude 4.9. No tsunami threat.'
}

// no safety test depends on the outside network: the Windy embed is an empty page
test.beforeEach(async ({ page }) => {
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }))
})

// WCAG relative luminance contrast from computed rgb() strings
const lum = (c: string) => { const k = c.startsWith('color(') ? 255 : 1; const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => Number(v) * k).map((v) => { const s = v! / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }

test('dark mode: Right now row icons >= 3:1 and the title-row avatar initial >= 4.5:1', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/#safety')
  const ic = page.getByRole('list', { name: 'Right now' }).locator('.rw-ic').first()
  await expect(ic).toBeVisible()
  const t = await ic.evaluate((e) => ({ fg: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }))
  expect(ratio(t.fg, t.bg)).toBeGreaterThanOrEqual(3)
  const a = await page.locator('.ha-me').evaluate((e) => ({ fg: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }))
  expect(ratio(a.fg, a.bg)).toBeGreaterThanOrEqual(4.5)
})

test('safety home (v13): head with Near me | World, hero first, Right now rows, Be ready rows, Hotlines opens and goes back', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.locator('h1')).toHaveText('Safety')
  const show = page.getByRole('group', { name: 'Show' })
  await expect(show.getByRole('link', { name: 'Near me' })).toBeVisible()
  await expect(show.getByRole('link', { name: 'World' })).toHaveAttribute('href', '#safety/world')
  await expect(page.getByTestId('safety-hero')).toBeVisible()
  const right = page.getByRole('list', { name: 'Right now' })
  await expect(right.getByRole('link', { name: /^Storm tracker/ })).toContainText('May be out of date') // no saved check on a fresh browser: never "No storms" (R1)
  const ready = page.getByRole('list', { name: 'Be ready' })
  for (const t of ['Hotlines', 'Safety cards', 'IDs and insurance', 'Past SOS']) await expect(ready.getByRole('link', { name: new RegExp('^' + t) })).toBeVisible()
  await expect(ready.getByRole('link', { name: /Offline maps/ })).toContainText('Not downloaded') // CS: always listed, honest while no pack exists
  await ready.getByRole('link', { name: /^Hotlines/ }).click()
  await expect(page).toHaveURL(/#safety\/dial$/)
  await expect(page.locator('h1')).toHaveText('Quick dial')
  await page.getByRole('link', { name: 'Back to Safety' }).click()
  await expect(page.locator('h1')).toHaveText('Safety')
})

test('warnings page: none now; quick dial: only confirmed numbers, the rest collapsed; maps load only on request', async ({ page }) => {
  await page.goto('/#safety/warnings')
  await expect(page.getByText('No warnings on this phone')).toBeVisible()
  await page.goto('/#safety/dial')
  await expect(page.getByRole('link', { name: /Call National emergency, 911/ })).toHaveAttribute('href', 'tel:911')
  await expect(page.getByRole('link', { name: /Call Philippine Red Cross, 143/ })).toBeVisible()
  await expect(page.getByText('160', { exact: true })).toHaveCount(0)
  // numbers we still need wait as dashed Add rows and there is no Go button for them
  const addBtn = page.getByRole('button', { name: /^Add number for / }).first()
  await expect(addBtn).toBeVisible()
  // layout: at phone width the name column is wider than the Add button, and the button is never clipped
  await page.setViewportSize({ width: 390, height: 844 })
  const w = await page.locator('.sf-addbtn').first().evaluate((b) => ({ add: b.getBoundingClientRect().width, right: b.getBoundingClientRect().right, name: (b.parentElement!.querySelector('.sf-dt') as HTMLElement).getBoundingClientRect().width }))
  expect(w.name).toBeGreaterThan(w.add)
  expect(w.right).toBeLessThanOrEqual(390)
  await expect(page.getByRole('link', { name: /^Go to/ })).toHaveCount(0)
  // source text is behind the small i button, not under every row
  await expect(page.getByText('Source:')).toHaveCount(0)
  await page.locator('[data-testid^="dial-"]').filter({ hasText: 'National emergency' }).getByRole('button').first().click()
  await expect(page.getByRole('dialog', { name: 'National emergency' })).toContainText('Source: National emergency number')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/#safety/weather')
  await page.getByRole('button', { name: 'Open live map' }).click()
  // iframes are not mounted until asked
  await expect(page.locator('iframe[title^="Ventusky"]')).toHaveCount(0)
  await page.getByText('Ventusky weather map').click()
  const frame = page.locator('iframe[title^="Ventusky"]')
  await expect(frame).toHaveAttribute('src', /^https:\/\/embed\.ventusky\.com\/\?p=9\.65;123\.88;7&l=rain-3h&w=soft&pin=9\.65;123\.88;dot;Here$/)
  await expect(frame).toHaveAttribute('loading', 'lazy')
})

test('adding a pin gives a Go button that survives reload (offline store)', async ({ page }) => {
  await page.goto('/#safety/map')
  await page.getByText('Add or fix a place').click()
  await page.getByRole('region', { name: 'Evacuation and rescue' }).getByRole('button', { name: 'Not confirmed yet, tap to add' }).first().click()
  await page.getByLabel('Latitude').fill('9.65')
  await page.getByLabel('Longitude').fill('123.88')
  await page.getByRole('button', { name: 'Save' }).click()
  const go = page.getByRole('link', { name: /^Go to/ })
  await expect(go).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=9.65,123.88&travelmode=walking')
  await page.reload()
  await page.getByText('Add or fix a place').click()
  await expect(page.getByRole('link', { name: /^Go to/ })).toHaveCount(1)
})

test('an alert in Dexie shows on Safety and Today with depth on expand', async ({ page }) => {
  await page.goto('/#safety/warnings')
  await expect(page.getByText('No warnings on this phone')).toBeVisible()
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
      await page.getByRole('button', { name: 'Open live map' }).click()
      const near = page.getByRole('group', { name: 'Map place' }).getByRole('button', { name: 'Near me' })
      await expect(near).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByRole('button', { name: /^Place:/ })).toContainText('Dampas')
      expect(await page.evaluate(() => (window as unknown as { __gpsCalls: number }).__gpsCalls)).toBe(0)
      await near.click()
      await expect(near).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: /^Place:/ })).toHaveText(/^Dadiangas West, General Santos$/) // S4: the area the phone is in, not the nearest home zone (S28 offline place names add the barangay)
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
      await page.getByRole('button', { name: 'Open live map' }).click()
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

test('Safety order (v13): hero, then Right now, First aid, Be ready', async ({ page }) => {
  await page.goto('/#safety')
  const y = async (loc: ReturnType<typeof page.locator>) => (await loc.first().boundingBox())!.y
  const sos = await y(page.getByRole('button', { name: /^SOS\./ }))
  const call = await y(page.getByRole('link', { name: 'Call 911' }))
  const med = await y(page.getByRole('link', { name: 'Medical ID' }))
  expect(call).toBeGreaterThan(sos)
  expect(Math.abs(med - call)).toBeLessThan(4)
  const heads = ['Right now', 'First aid', 'Be ready']
  const tops: number[] = []
  for (const h of heads) tops.push(await y(page.getByRole('heading', { name: h, level: 2, exact: true })))
  expect(tops[0]).toBeGreaterThan(call)
  expect(tops[1]).toBeGreaterThan(tops[0]!)
  expect(tops[2]).toBeGreaterThan(tops[1]!)
  await expect(page.getByRole('link', { name: 'Medical ID' })).toHaveAttribute('href', '#medid')
  await expect(page.getByRole('list', { name: 'Right now' }).getByRole('link', { name: /^Rescue map/ })).toHaveAttribute('href', '#safety/map')
})

test('SOS: the confirm button opens the flow, finds the place, shows the steps, one text button per contact, and cancel', async ({ page, context }) => {
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
  await expect(page.getByRole('button', { name: /Call 911/ })).toBeVisible()
  await expect(page.getByTestId('sos-status')).toContainText('Text to family ready, tap Send')
  // one composer per contact (Q38): the first opens by itself when the app is back from the call, the second is a button
  await expect(page.getByRole('button', { name: /Text Joy/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Text Papa|Open text again/ })).toBeVisible()
  await page.getByRole('link', { name: /9\.65000, 123\.88000/ }).waitFor()
  await expect(page.getByRole('button', { name: /Cancel, I don.t need help/ })).toBeEnabled()
})

test('SOS with no contacts still offers 911 and asks for contacts', async ({ page }) => {
  await page.goto('/#safety')
  await page.getByRole('button', { name: 'Cannot hold? Use a button instead' }).click()
  await page.getByRole('button', { name: 'Yes, send SOS' }).click()
  await expect(page.getByRole('button', { name: /Call 911/ })).toBeVisible()
  await expect(page.getByText('Who gets the call and the text')).toBeVisible()
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

test('hazards at my location: layer buttons, earthquake row with what to do, HazardHunterPH and NOAH links', async ({ page }) => {
  await page.goto('/#safety/hazards')
  await expect(page.locator('h1')).toHaveText('Hazards at my location')
  const layers = page.getByRole('group', { name: 'Hazard layer' })
  for (const t of ['Flood', 'Landslide', 'Storm surge']) await expect(layers.getByRole('button', { name: t })).toBeVisible()
  const ground = page.getByRole('list', { name: 'Ground and shaking' })
  await expect(ground).toContainText('Intensity VIII')
  await expect(ground).toContainText('Drop, cover and hold on')
  await expect(ground).toContainText('Flood')
  await expect(ground).toContainText('Not confirmed yet')
  await expect(page.getByRole('link', { name: /Open HazardHunterPH/ })).toHaveAttribute('href', /hazardhunter\.georisk\.gov\.ph/)
  await expect(page.getByRole('link', { name: /Open in NOAH/ })).toHaveAttribute('href', 'https://noah.up.edu.ph/')
})

test('storm tracker, safety cards and past SOS pages open', async ({ page }) => {
  await page.goto('/#safety/storms')
  await expect(page.getByText(/Storms have not been checked yet/)).toBeVisible() // fresh browser, no saved check (R1)
  await page.goto('/#safety/cards')
  await page.locator('summary', { hasText: /^Earthquake$/ }).click()
  await expect(page.getByText('Do not wait for a message.').first()).toBeVisible()
  await page.goto('/#safety/sos')
  await expect(page.getByText('No SOS sent from this phone yet.')).toBeVisible()
})

test('live weather: layer switch only changes overlay, storm tracker and links', async ({ page }) => {
  await page.goto('/#safety/weather')
  await page.getByRole('button', { name: 'Open live map' }).click()
  const sec = page.getByRole('region', { name: 'Live weather map' })
  await sec.scrollIntoViewIfNeeded()
  const main = sec.locator('iframe').first()
  await expect(main).toHaveAttribute('src', /overlay=rain&.*lat=9\.65&lon=123\.88/)
  await sec.getByRole('group', { name: 'Weather layer' }).getByRole('button', { name: 'Wind' }).click()
  await expect(main).toHaveAttribute('src', /overlay=wind&/)
  await expect(sec.getByText('Storms near you')).toBeVisible()
  await expect(sec.getByText(/Storms have not been checked yet/)).toBeVisible() // no check on this phone yet: no all-clear (the checked case is in livemaps.render.test)
  await expect(sec.getByText(/No storm warnings for the Philippines/)).toHaveCount(0)
  await expect(sec.locator('iframe[title^="Windy wind map around"]')).toHaveAttribute('src', /zoom=5&overlay=wind.*lat=9\.65&lon=123\.88/)
  await expect(sec.getByRole('link', { name: /PAGASA bulletin/ })).toHaveAttribute('target', '_blank')
  await page.context().setOffline(true)
  await expect(sec.getByText('Maps need internet').first()).toBeVisible()
})


// ---- Quick dial: one local set by place (PART-3 4.1) ----

async function dialAt(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext, lat: number, lon: number) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: lat, longitude: lon })
  await page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#safety/dial')
}

test('quick dial at the home zone: Tagbilaran set first, then national, OFW and teleconsult', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#safety/dial')
  await expect(page.locator('h1')).toHaveText('Quick dial')
  await expect(page.locator('.sf h2.sec')).toHaveText(['Your home area is Tagbilaran', 'Philippines, national', 'Filipinos abroad (OFW)', 'Talk to a doctor by phone'])
  const local = page.getByRole('region', { name: 'Your home area is Tagbilaran' })
  await expect(local.getByRole('link', { name: /Call Gov\. Celestino Gallares Memorial Hospital/ })).toBeVisible()
  await expect(page.getByText('Davao City Central 911')).toHaveCount(0)
  await expect(page.getByText('General Santos City Police')).toHaveCount(0)
  // an unverified number is dialable and says Number not confirmed under its name; a confirmed one does not
  await expect(local.getByRole('link', { name: /Call BFP Tagbilaran City Fire Station, \(038\) 422-8362/ })).toHaveAttribute('href', 'tel:0384228362')
  const fire = local.getByRole('listitem').filter({ hasText: 'BFP Tagbilaran City Fire Station' })
  await expect(fire.getByText('Number not confirmed')).toBeVisible()
  const hosp = local.getByRole('listitem').filter({ hasText: 'Gov. Celestino Gallares' })
  await expect(hosp.getByText('Number not confirmed')).toHaveCount(0)
  // an app has no number: it opens its source
  await expect(page.getByRole('link', { name: 'Open NowServing by SeriousMD (app)' })).toHaveAttribute('href', /apps\.apple\.com/)
})

// W12 (D-118): grouped rows, name clamped to three lines, number beside it, one 44 px Call control. The tallest row measured at 390 and at 360 is 92 px (3 name lines of 20 + 16 padding + the 16 px note line); the limit is that measured height, not a loose number.
for (const W of [390, 360]) test(`quick dial rows at ${W}px: at most 92 px tall, name clamped to three lines, Call 44 px and inside the row`, async ({ page }) => {
  await page.setViewportSize({ width: W, height: 844 })
  await page.goto('/#safety/dial')
  const rows = page.locator('.sf-kind .rw')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(10)
  await expect(page.locator('.sf-kind-h').first()).toHaveText('Emergency')
  for (const r of await rows.all()) {
    const m = await r.evaluate((el) => {
      const rr = el.getBoundingClientRect()
      const t = el.querySelector('.rw-title') as HTMLElement
      const act = el.querySelector('.sf-callbtn')!.getBoundingClientRect()
      return { h: rr.height, right: rr.right, lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)), actRight: act.right, actH: act.height, actW: act.width, check: /check/i.test(el.textContent ?? '') && !/not confirmed/i.test(el.textContent ?? '') }
    })
    expect(m.h, JSON.stringify(m)).toBeLessThanOrEqual(92)
    expect(m.right).toBeLessThanOrEqual(W)
    expect(m.actRight).toBeLessThanOrEqual(m.right)
    expect(m.actH).toBeGreaterThanOrEqual(44)
    expect(m.actW).toBeGreaterThanOrEqual(44)
    expect(m.lines).toBeLessThanOrEqual(3)
    expect(m.check).toBe(false) // no bare "check" word beside a number
  }
  await assertTargets(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(W)
})

test('quick dial in Davao by GPS: only the Davao set, then national', async ({ page, context }) => {
  await dialAt(page, context, 7.07, 125.61)
  await expect(page.getByRole('region', { name: 'You are in Davao' })).toBeVisible()
  await expect(page.locator('.sf h2.sec')).toHaveText(['You are in Davao', 'Philippines, national', 'Filipinos abroad (OFW)', 'Talk to a doctor by phone'])
  await expect(page.getByText('Tagbilaran City 911')).toHaveCount(0)
})

test('quick dial in the Philippines outside every list: national first, with the reason', async ({ page, context }) => {
  await dialAt(page, context, 17.6, 121.7)
  await expect(page.getByRole('status').filter({ hasText: 'You are outside our local lists' })).toBeVisible()
  await expect(page.locator('.sf h2.sec')).toHaveText(['Philippines, national', 'Filipinos abroad (OFW)', 'Talk to a doctor by phone'])
  await expect(page.getByRole('link', { name: /Call National emergency, 911/ })).toBeVisible()
})

test('quick dial in Texas: the Texas set and OFW, no Philippine national', async ({ page, context }) => {
  await dialAt(page, context, 29.76, -95.37)
  await expect(page.getByRole('region', { name: 'You are in Texas' })).toBeVisible()
  await expect(page.locator('.sf h2.sec')).toHaveText(['You are in Texas', 'Filipinos abroad (OFW)', 'Talk to a doctor by phone'])
  await expect(page.getByRole('link', { name: /Call Emergency \(US\), 911/ })).toBeVisible()
  await expect(page.getByText('PhilHealth')).toHaveCount(0)
})

test('quick dial abroad (not Texas): OFW numbers and a link to an official list, no guessed local number', async ({ page, context }) => {
  await dialAt(page, context, 1.35, 103.82)
  await expect(page.getByRole('status').filter({ hasText: 'outside the Philippines' })).toBeVisible()
  await expect(page.locator('.sf h2.sec')).toHaveText(['Filipinos abroad (OFW)', 'Talk to a doctor by phone', 'Emergency number where you are'])
  await expect(page.getByRole('link', { name: 'Emergency numbers by country' })).toHaveAttribute('href', /^https:\/\//)
  await expect(page.getByRole('link', { name: /Call DMW-OWWA 24\/7 hotline/ })).toHaveAttribute('href', 'tel:+6321348')
  await expect(page.getByRole('link', { name: /Call DMW central hotlines/ })).toHaveAttribute('href', 'tel:+63287221144')
  await expect(page.getByRole('link', { name: /Call National emergency/ })).toHaveCount(0)
})

test('Safety hub abroad (not Texas): no red Call 911, a Local emergency number link instead; Texas keeps 911', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 1.35, longitude: 103.82 })
  await page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  await page.goto('/#safety')
  await expect(page.getByRole('link', { name: 'Local emergency number' })).toHaveAttribute('href', /^https:\/\//)
  await expect(page.getByRole('link', { name: 'Call 911' })).toHaveCount(0)
  await context.setGeolocation({ latitude: 29.76, longitude: -95.37 })
  await page.reload()
  await expect(page.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
})

test('storm tracker map is centred on my place, not 12N 128E', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 7.07, longitude: 125.61 })
  await page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  await page.goto('/#safety/storms')
  await expect(page.locator('iframe[title^="Windy"]')).toHaveAttribute('src', /lat=7\.07&lon=125\.61/)
  await expect(page.getByRole('link', { name: /Zoom Earth/ })).toHaveAttribute('href', /#view=7\.07,125\.61,5z/)
})

test('footer has an in-app Sources link, not a repo path; the Hazards title wraps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#safety')
  await expect(page.getByText('docs/SOURCES.md')).toHaveCount(0)
  await page.getByRole('link', { name: 'Sources', exact: true }).click() // CS: one Sources link, the Right now header
  await expect(page).toHaveURL(/#safety\/sources$/)
  await expect(page.locator('h1')).toHaveText('Sources')
  await expect(page.getByText('HazardHunterPH').first()).toBeVisible()
  await page.goto('/#safety/hazards')
  const h = await page.locator('h1').evaluate((el) => ({ over: el.scrollWidth > el.clientWidth + 1, ell: getComputedStyle(el).textOverflow }))
  expect(h.over).toBe(false)
  expect(h.ell).not.toBe('ellipsis')
})

test('rescue map away from our areas says to ask the barangay or call 911 and invents nothing', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 29.76, longitude: -95.37 })
  await page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  await page.goto('/#safety/map')
  await expect(page.getByText(/Nearest hospitals: ask your barangay or call 911/)).toBeVisible()
  await page.goto('/#safety/hazards')
  await expect(page.getByText(/No hazard readings for where you are yet/)).toBeVisible()
})
