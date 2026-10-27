import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S5 ALERTS-AUTO: storm mode (safety-storm), warnings list (safety-warnings), hub with the Phone alerts tile (safety-hub), phone warnings guide (safety-phonewarn).
// 390x844, light and dark. Synthetic rows in the shape alerts-ingest writes for a PAGASA wind signal and flood advisory.
declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
// Session 12 lane D: shots move to docs/session-12/shots/D and the clock is fixed, so a rerun rewrites no committed PNG (ML-32). The session-10 S5 shots stay as they were.
// Committed shots are written only on request (PW_SHOTS=docs/session-12/shots/D): pixels of the floating tab bar differ by a few bytes run to run, so a gate rerun must not rewrite them.
const SHOTS = process.env.PW_SHOTS ?? 'test-results/shots-D'
const NOW = Date.parse('2026-10-27T06:00:00Z') // 14:00 in Manila
type Row = Record<string, unknown>

async function putKv(page: Page, rows: Row[]) {
  await page.evaluate(async (list) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('kv', 'readwrite')
        for (const r of list as Row[]) tx.objectStore('kv').put(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, rows)
}
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const SIGNAL = {
  id: 'pagasa-tcws-rosal-champi-dampas', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)',
  what: 'Winds of 62-88 kph may be expected within 24 hours.', where: 'Bohol (near Dampas, Tagbilaran City)', when: '2026-10-26 10:00 PH time',
  doNow: 'Follow your local DRRMO. Charge your phone and power bank, and keep medicines and your go-bag ready. If you are told to evacuate, go early.',
  source: 'PAGASA', sourceUrl: 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin', issuedAt: hoursAgo(2), lat: 9.645705, lon: 123.877951,
  bulletin: 'Winds of 62-88 kph may be expected within 24 hours.\nSource: PAGASA, CC BY 4.0.', checkedAt: hoursAgo(0.1)
}
const FLOOD = {
  id: 'pagasa-rain-conel', kind: 'rainfall', level: 'Moderate', title: 'General Flood Advisory for Conel, General Santos City', what: 'Rivers may rise after heavy rain.',
  where: 'South Cotabato (near Conel, General Santos City)', when: '2026-10-26 07:30 PH time', doNow: 'Do not walk or drive through floodwater.',
  source: 'PAGASA', sourceUrl: 'https://www.pagasa.dost.gov.ph/flood', issuedAt: hoursAgo(3), lat: 6.2015121, lon: 125.1878084, bulletin: 'Source: PAGASA, CC BY 4.0.', checkedAt: hoursAgo(0.1)
}
const PHONE_CHECK = { key: 'phone.check', value: { at: hoursAgo(1), notif_ok: true, exact_ok: true, battery_ok: false, alarms_ok: true, call_ok: true, oem: null } }

async function open(page: Page, hash: string, scheme: 'light' | 'dark', rows: Row[]) {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.clock.setFixedTime(NOW)
  await page.route(/open-meteo\.com/, (r) => r.abort()) // live forecasts would change the weather card, and so the shot, on every run (ML-32)
  await page.goto('/#today')
  await expect(page.locator('h1').first()).toBeVisible()
  await putKv(page, rows)
  await page.goto('/' + hash)
  await page.reload() // raw IndexedDB writes do not notify live queries
}

for (const scheme of ['light', 'dark'] as const) {
  test(`storm mode ${scheme}`, async ({ page }) => {
    await open(page, '#safety', scheme, [{ key: 'safety.alerts', value: [SIGNAL, FLOOD] }])
    const card = page.getByRole('region', { name: 'Storm mode' })
    await expect(card.getByRole('heading', { name: 'Typhoon Rosal (CHAMPI)' })).toBeVisible()
    await expect(card.getByRole('img', { name: 'Wind signal number 2' })).toHaveText('2')
    await expect(card.getByText('PAGASA, CC BY 4.0')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Unwell' })).toBeVisible()
    await expect(card.getByText('Fill water containers')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${SHOTS}/safety-storm-${scheme}.png` })
    // this e2e build has no sign-in, so the face says so; the saved path is covered by stormcard.test.tsx with the mood log mocked
    await card.getByRole('button', { name: 'OK', exact: true }).click()
    await expect(card.getByRole('status')).toHaveText('Sign in first, then try again.')
  })

  test(`warnings list ${scheme}`, async ({ page }) => {
    await open(page, '#safety/warnings', scheme, [{ key: 'safety.alerts', value: [SIGNAL, FLOOD] }])
    await expect(page.getByRole('heading', { name: 'Warnings', exact: true })).toBeVisible()
    await expect(page.getByRole('article', { name: /Wind Signal No. 2/ }).getByText('PAGASA, CC BY 4.0').first()).toBeVisible()
    await expect(page.getByText(/GDACS and Open-Meteo carry on/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the PAGASA bulletin' })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/safety-warnings-${scheme}.png` })
  })

  test(`hub shows Phone alerts only while a setting needs fixing ${scheme}`, async ({ page }) => {
    await open(page, '#safety', scheme, [PHONE_CHECK])
    const tiles = page.getByRole('navigation', { name: /Safety topics/ })
    await expect(tiles.getByRole('link', { name: /Phone alerts/ })).toContainText('1 needs fixing')
    await page.screenshot({ path: `${SHOTS}/safety-hub-${scheme}.png` })
    await tiles.getByRole('link', { name: /Phone alerts/ }).click()
    await expect(page).toHaveURL(/#safety\/phonewarn$/)
    await expect(page.getByRole('heading', { name: 'Phone warnings' }).first()).toBeVisible()
    await expect(page.getByText('Medicine alarms')).toBeVisible()
    await expect(page.getByText('Needs fixing')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/safety-phonewarn-${scheme}.png` })
  })
}

// Lane D: freshness, honest sources, does-it-affect-us. Compared with canvas board 4b (alert freshness) and mockups safety-warnings / safety-hub / today-full (band).
const OLD_QUAKE = { // 0.8 degrees of latitude north of Dampas = 88.95 km; M3.0 is felt to 50 km only, so far
  id: 'usgs-far', kind: 'quake', level: 'Magnitude 3.0', title: 'M 3.0 - 89 km SSE of Pondaguitan', what: 'Magnitude 3.0 earthquake, about 89 km from Dampas, Tagbilaran City.', where: 'Pondaguitan, Philippines',
  when: '2026-10-27 13:30 PH time', doNow: 'If you did not feel it, you do not need to do anything.', source: 'USGS', sourceUrl: null, issuedAt: hoursAgo(0.5), lat: 9.645705 + 0.8, lon: 123.877951,
  bulletin: 'Source: USGS.', checkedAt: hoursAgo(0.1)
}
const GDACS_RAW = {
  id: 'gdacs-TC-1', kind: 'gdacs', level: 'Red', title: 'Red tropical cyclone CHAMPI-26', what: 'A Typhoon was active. Population affected by Category 1 (120 km/h) wind speeds or higher is 0.291 million.',
  where: 'CHAMPI-26, Philippines', when: '2026-10-27 08:00 PH time', doNow: 'Check the PAGASA bulletin and follow your local DRRMO.', source: 'GDACS', sourceUrl: null, issuedAt: hoursAgo(5), lat: null, lon: null,
  bulletin: 'Source: GDACS.', checkedAt: hoursAgo(0.1)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`fresh alerts say how old they are ${scheme}`, async ({ page }) => {
    await open(page, '#safety/warnings', scheme, [{ key: 'safety.alerts', value: [{ ...GDACS_RAW }, { ...OLD_QUAKE }] }])
    const card = page.getByRole('article', { name: /CHAMPI-26/ })
    await expect(card.getByText(/Checked 6 min ago/)).toBeVisible()
    await expect(card.getByText(/About 291,000 people live where/)).toBeVisible()
    await expect(page.getByText(/Population affected/)).toHaveCount(0)
    await expect(page.getByText(/They may be out of date/)).toHaveCount(0)
    const quake = page.getByRole('article', { name: /Pondaguitan/ })
    await expect(quake.getByText(/Probably too far to feel strongly\. If you felt shaking, follow the steps below\. \(89 km\)/)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${SHOTS}/warnings-fresh-${scheme}.png` })
  })

  test(`old check shows the amber line even when no row is stale ${scheme}`, async ({ page }) => {
    const old = { ...GDACS_RAW, checkedAt: hoursAgo(1.25), stale: false } // 75 minutes
    await open(page, '#safety', scheme, [{ key: 'safety.alerts', value: [old] }])
    const hub = page.getByRole('region', { name: 'Alerts and official sources' })
    await expect(hub.getByText('Checked 1 h ago')).toBeVisible()
    await expect(hub.getByText(/Alerts last checked .*They may be out of date\. Check PAGASA or listen to the radio\./)).toBeVisible()
    await expect(hub.getByRole('link', { name: /Warnings/ })).toContainText('may be out of date')
    await expect(hub.getByText(/Quakes: USGS\./)).toBeVisible()
    await expect(page.getByText(/from PAGASA, PHIVOLCS and NDRRMC/)).toHaveCount(0)
    await hub.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/hub-amber-${scheme}.png` })
  })

  test(`Today band keeps the steps for a far quake ${scheme}`, async ({ page }) => {
    await open(page, '#today', scheme, [{ key: 'safety.alerts', value: [OLD_QUAKE] }])
    const band = page.getByRole('region', { name: 'Active warning' })
    await expect(band.getByText('Probably too far to feel strongly. If you felt shaking, follow the steps below.')).toBeVisible()
    await expect(page.getByText(/no action needed/i)).toHaveCount(0)
    await expect(band.getByText(/\(89 km away\)/)).toBeVisible()
    await expect(band.getByText('Checked 6 min ago')).toBeVisible()
    await expect(band.getByText(/If you did not feel it/)).toBeVisible()
    await band.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/today-band-far-${scheme}.png` })
  })

  test(`hazard card explains Intensity VIII in plain words ${scheme}`, async ({ page }) => {
    await open(page, '#safety/hazards', scheme, [])
    const card = page.getByRole('article', { name: 'Earthquake' })
    await expect(card.getByText(/very destructive shaking \(Intensity VIII\)/)).toBeVisible()
    await expect(card.getByText(/Drop, cover and hold on when it shakes/)).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/hazard-quake-${scheme}.png` })
  })
}

test('hub has no Phone alerts tile when the phone check is clean or missing', async ({ page }) => {
  await open(page, '#safety', 'light', [{ ...PHONE_CHECK, value: { ...PHONE_CHECK.value, battery_ok: true } }])
  await expect(page.getByRole('link', { name: /Phone alerts/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Storm mode' })).toHaveCount(0)
})
