import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture, type FixtureOpts } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { seed } from './fixtures/s16/today'
import { setScheme } from './v13'
import { shotPath } from './shotPath'

// Lane CW round 2: full-page evidence of each weather state, 390 and 360 wide, light and dark. Made-up forecasts, no network.
// Shots are written under docs/ only when DOC_SHOTS=1 (ML-32); a plain run writes under test-results/.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const NOON = '2026-10-31T12:00:00+08:00'
const DIR = 'docs/redesign-2026-10-31/shots/comply-CW'
const CYCLONE = { id: 'gdacs-TC-9001', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone INVENTED', what: 'Tropical cyclone', where: 'Philippines', when: 'Now', doNow: 'Prepare', source: 'GDACS', sourceUrl: null, issuedAt: NOON, lat: 10.1, lon: 124.5, bulletin: 'b' }

const STATES: Record<string, FixtureOpts> = {
  dry: { code: 0, temp: 28, humidity: 50, hourlyProb: () => 5 },
  rain: { code: 63, temp: 26, humidity: 92, hourlyProb: () => 85 },
  storm: { code: 0, temp: 28, humidity: 50, hourlyProb: () => 5 },
  hot: { code: 0, temp: 36, humidity: 75, hourlyProb: () => 5 },
  failed: { code: 0, temp: 28, humidity: 50, hourlyProb: () => 5 }
}

async function open(page: Page, name: string) {
  await page.clock.setFixedTime(NOON)
  await skipOnboarding(page)
  const serve = (r: { fulfill: (o: { json: unknown }) => Promise<void> }) => r.fulfill({ json: openMeteoFixture({ now: new Date(NOON), ...STATES[name] }) })
  await page.route('**/api.open-meteo.com/**', serve)
  await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toHaveText(/\d°/)
  if (name === 'storm') {
    await seed(page, 'bantay', 'kv', [{ key: 'alerts:checkedAt', value: NOON }, { key: 'safety.alerts', value: [CYCLONE] }])
    await page.reload()
    await expect(page.getByRole('region', { name: 'Storm track' })).toBeVisible()
  }
  if (name === 'failed') { // the saved reading is 12 minutes old and the network is down: "as of ..., could not refresh"
    await page.evaluate(async () => {
      await new Promise<void>((res, rej) => {
        const o = indexedDB.open('bantay')
        o.onsuccess = () => {
          const tx = o.result.transaction('kv', 'readwrite'); const st = tx.objectStore('kv')
          st.openCursor().onsuccess = (e) => {
            const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result
            if (!c) return
            if (String(c.key).startsWith('weather.forecast.')) c.update({ ...c.value, value: { ...c.value.value, fetchedAt: new Date(Date.now() - 12 * 60_000).toISOString() } })
            c.continue()
          }
          tx.oncomplete = () => { o.result.close(); res() }
          tx.onerror = () => rej(tx.error)
        }
      })
    })
    await page.unroute('**/api.open-meteo.com/**')
    await page.route('**/api.open-meteo.com/**', (r) => r.abort())
    await page.reload()
    await expect(page.getByText(/could not refresh/)).toBeVisible()
  }
}

for (const name of Object.keys(STATES)) {
  for (const w of [390, 360]) {
    test(`${name} at ${w}`, async ({ page }) => {
      await open(page, name)
      for (const s of ['light', 'dark'] as const) {
        await setScheme(page, s)
        await page.setViewportSize({ width: w, height: 844 })
        const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement).scrollHeight)
        await page.setViewportSize({ width: w, height: Math.min(h + 140, 6000) })
        await page.waitForTimeout(400)
        await page.screenshot({ path: shotPath(`${DIR}/${name}-${w}-${s}.png`), animations: 'disabled' })
      }
    })
  }
}
