import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S5 ALERTS-AUTO: storm mode (safety-storm), warnings list (safety-warnings), hub with the Phone alerts tile (safety-hub), phone warnings guide (safety-phonewarn).
// 390x844, light and dark. Synthetic rows in the shape alerts-ingest writes for a PAGASA wind signal and flood advisory.
declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = 'docs/session-10/shots/S5'
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
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
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

test('hub has no Phone alerts tile when the phone check is clean or missing', async ({ page }) => {
  await open(page, '#safety', 'light', [{ ...PHONE_CHECK, value: { ...PHONE_CHECK.value, battery_ok: true } }])
  await expect(page.getByRole('link', { name: /Phone alerts/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Storm mode' })).toHaveCount(0)
})
