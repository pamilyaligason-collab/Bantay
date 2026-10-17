import { expect, test } from '@playwright/test'

const ALERT = {
  id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now',
  doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: 'https://www.phivolcs.dost.gov.ph/', issuedAt: '2026-10-17T01:00:00Z',
  lat: 10.1, lon: 124.0, bulletin: 'Magnitude 5.1. No tsunami threat.', previousBulletin: 'Magnitude 4.9. No tsunami threat.'
}

test('safety screen: no alerts, hotlines, unknown places, maps load only on request', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.locator('h1')).toHaveText('Safety')
  await expect(page.getByText('No active warnings for Dampas')).toBeVisible()
  await expect(page.getByRole('link', { name: '911' }).first()).toBeVisible()
  await expect(page.getByText('160', { exact: true })).toHaveCount(0)
  // unconfirmed values are shown plainly and there is no Go button for them
  await expect(page.getByRole('button', { name: 'Not confirmed yet, tap to add' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /^Go to/ })).toHaveCount(0)
  // iframes are not mounted until asked
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByText('Ventusky weather map').click()
  const frame = page.locator('iframe[title^="Ventusky"]')
  await expect(frame).toHaveAttribute('src', /^https:\/\/embed\.ventusky\.com\/\?p=9\.65;123\.88;7&l=rain-3h&w=soft&pin=9\.65;123\.88;dot;Home$/)
  await expect(frame).toHaveAttribute('loading', 'lazy')
  // earthquake card says what Bantay is not
  await page.locator('summary', { hasText: /^Earthquake$/ }).click()
  await expect(page.getByText('Do not wait for a message.').first()).toBeVisible()
})

test('adding a pin gives a Go button that survives reload (offline store)', async ({ page }) => {
  await page.goto('/#safety')
  await page.getByRole('button', { name: 'Not confirmed yet, tap to add' }).first().click()
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
