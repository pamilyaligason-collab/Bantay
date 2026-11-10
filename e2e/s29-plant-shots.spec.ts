import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S29 lane C: Plant this month on Today, climate type 2 picked in Bohol, February 2027, PAGASA dry spell ahead. Shots only when S29_C_SHOTS names a folder (never into the repo).
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const CLOCK = '2027-02-10T12:00:00+08:00'
const BOHOL = {
  province: 'Bohol', issued_at: '2027-02-03',
  months: [['2027-01', 'not_affected', 'assessment'], ['2027-02', 'dry_spell', 'outlook'], ['2027-03', 'drought', 'outlook']].map(([month, level, kind]) => ({ month, level, kind }))
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

for (const [w, h] of [[390, 844], [360, 780]] as const) {
  test(`Plant card, dry outlook, climate type 2, February, ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.clock.setFixedTime(CLOCK)
    await skipOnboarding(page)
    await stubWindy(page)
    await page.route('**/open.er-api.com/**', (r) => r.abort())
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(CLOCK), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
    await page.goto('/#today')
    await expect(page.getByTestId('myday')).toBeVisible()
    await seedKv(page, [{ key: 'garden.drought.Bohol', value: BOHOL }, { key: 'garden.climate', value: { type: 2, province: 'Bohol' } }])
    await page.reload()
    const pl = page.getByTestId('today-plant')
    await expect(pl).toBeVisible()
    await expect(pl).not.toContainText('No dry season') // S29 A4: the dry outlook replaces the climate-type words
    await expect(page.getByTestId('plant-dry')).toBeVisible()
    await pl.scrollIntoViewIfNeeded()
    const dir = process.env.S29_C_SHOTS
    if (dir) await pl.screenshot({ path: `${dir}/plant-type2-feb-${w}x${h}.png` })
    // after the fix: photo tiles first, the tip (no tolerant crop with a guide), and a credit for the photos shown
    if (process.env.S29_C_AFTER) {
      await expect(pl.locator('.gpl-tile img')).toHaveCount(3)
      await expect(page.getByTestId('plant-dry')).toHaveText('Bohol is in a dry spell. Water early in the morning and mulch to keep the soil damp.')
      await expect(page.getByTestId('plant-photos')).toBeVisible()
    }
  })
}
