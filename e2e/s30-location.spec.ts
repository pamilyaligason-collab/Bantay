import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'

// S30 L1: standing in Manila, Today's Climate outlook reads the Metro Manila row (the offline map calls the unit "City of Manila", PAGASA says "Metro Manila").
// The e2e build has no Supabase, so the outlook is the saved copy in IndexedDB, as in s29-climate.spec.ts.
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila', geolocation: { latitude: 14.5995, longitude: 120.9842 }, permissions: ['geolocation'] })

const CLOCK = '2026-11-10T12:00:00+08:00'
const METRO_MANILA = {
  province: 'Metro Manila', issued_at: '2026-11-03',
  months: [['2026-10', 'not_affected', 'assessment'], ['2026-11', 'not_affected', 'outlook'], ['2026-12', 'dry_condition', 'outlook'], ['2027-01', 'dry_spell', 'outlook']]
    .map(([month, level, kind]) => ({ month, level, kind }))
}

async function seedKv(page: Page, list: { key: string; value: unknown }[]) {
  await expect.poll(() => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'bantay')) return false
    return new Promise<boolean>((res) => { const o = indexedDB.open('bantay'); o.onerror = () => res(false); o.onsuccess = () => { const ok = o.result.objectStoreNames.contains('kv'); o.result.close(); res(ok) } })
  })).toBe(true)
  await page.evaluate(async (l) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); for (const r of l) tx.objectStore('kv').put(r); tx.oncomplete = () => { open.result.close(); res() }; tx.onerror = () => rej(tx.error) }
    })
  }, list)
}

test('in Manila Today shows the Metro Manila climate outlook', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(CLOCK)
  await skipOnboarding(page)
  await stubWindy(page)
  await page.route('**/open.er-api.com/**', (r) => r.abort())
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(CLOCK), temp: 30, humidity: 70, feels: 34, code: 2, hourlyProb: () => 10 }) }))
  await page.goto('/#today')
  await expect(page.getByTestId('myday')).toBeVisible()
  await seedKv(page, [{ key: 'garden.drought.Metro Manila', value: METRO_MANILA }])
  await page.reload()
  const cl = page.getByTestId('today-climate')
  await expect(cl).toBeVisible()
  await expect(cl).toContainText('Metro Manila · PAGASA')
  await expect(cl).not.toContainText('Climate outlook not available yet')
  await expect(cl).toContainText('Dry spell expected from January')
})
