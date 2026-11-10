import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { API, mock } from './health-auth-mock'
import { assertNoSideways, FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Phase 2 lane Q: the Weather screen with the blend flag on, the weather-blend function answered here with invented numbers.
// Shots only with Q_SHOTS=<dir> (docs/redesign-2026-10-31/shots/gaps-Q).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const slotTime = (min: number) => new Date(Date.parse(FIXED_CLOCKS[1]) + 8 * 3600_000 + min * 60_000).toISOString().slice(0, 16)
const blendBody = () => {
  return {
    ok: true, cell: { lat: 10.31, lon: 123.89 }, fetchedAt: new Date(FIXED_CLOCKS[1]).toISOString(), tz: 'Asia/Manila', utcOffset: 28800,
    now: { time: slotTime(0), temp: 26, humidity: 70, feels: 27, code: 2, wind: 9, gust: 18, uv: 0 },
    next2h: Array.from({ length: 12 }, (_, i) => ({ time: slotTime(i * 10), mmh: [0, 0, 0, 0.4, 1.2, 2.8, 2.1, 1.4, 0.9, 0.5, 0.3, 0][i], estimated: true })),
    hourly48: Array.from({ length: 48 }, (_, i) => ({ time: slotTime(i * 60), temp: 26, prob: i > 2 ? 70 : 10, code: 2, rain: i > 2 ? 1 : 0 })),
    daily10: Array.from({ length: 10 }, (_, i) => ({ date: slotTime(i * 1440).slice(0, 10), code: 61, min: 24, max: 31, prob: 60, uvMax: 8, sunrise: `${slotTime(i * 1440).slice(0, 10)}T05:40`, sunset: `${slotTime(i * 1440).slice(0, 10)}T17:30` })),
    aqi: { index: 2, label: 'Fair', pm25: 12, pm10: 22 },
    alerts: [{ source: 'OpenWeather', event: 'Invented heavy rain notice', start: '', end: '', description: '' }],
    check: null,
    sources: [
      { id: 'open-meteo', ok: true, credit: 'Weather data by Open-Meteo.com (CC BY 4.0)', url: 'https://open-meteo.com/' },
      { id: 'met-norway', ok: true, credit: 'Data from MET Norway (CC BY 4.0)', url: 'https://api.met.no/' },
      { id: 'openweather', ok: true, credit: 'Weather data by OpenWeather', url: 'https://openweathermap.org/' }
    ]
  }
}

async function open(page: Page, flag: boolean) {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await mock(page, FIXED_CLOCKS[1])
  await page.addInitScript((on) => {
    localStorage.setItem('bantay.onboarded', '1')
    localStorage.setItem('bantay.flag.wx.blend', on ? '1' : '0') // on by default since 2026-11-10; '0' is the Labs opt-out
  }, flag)
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(FIXED_CLOCKS[1]), temp: 26, humidity: 70, feels: 27, code: 2 }) }))
  await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))
  const calls: string[] = []
  await page.route(`${API}/functions/v1/weather-blend`, (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    calls.push(r.request().postData() ?? '')
    return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(blendBody()) })
  })
  await page.goto('/#weather')
  return calls
}

test('flag on: Next 2 hours, credits; only the 1 km cell leaves the phone', async ({ page }) => {
  const calls = await open(page, true)
  await expect(page.getByTestId('wx-next2h')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('wx-next2h')).toContainText('estimated')
  await expect(page.getByTestId('wx-air')).toHaveCount(0)
  await expect(page.getByTestId('wx-other-alerts')).toBeVisible()
  await expect(page.getByText('Data from MET Norway (CC BY 4.0)')).toBeVisible()
  const body = JSON.parse(calls[0]!) as { lat: number; lon: number }
  for (const v of [body.lat, body.lon]) expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6)
  await assertNoSideways(page)
  const dir = process.env.Q_SHOTS
  if (dir) {
    for (const s of ['light', 'dark'] as const) {
      await setScheme(page, s)
      for (const [id, name] of [['wx-next2h', 'next2h']] as const) {
        await page.getByTestId(id).evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await page.waitForTimeout(200)
        await page.screenshot({ path: `${dir}/weather-blend-${name}-${s}.png`, animations: 'disabled' })
      }
      await page.getByText('Data from MET Norway (CC BY 4.0)').evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.screenshot({ path: `${dir}/weather-blend-credits-${s}.png`, animations: 'disabled' })
    }
  }
})

test('flag off: the function is never called and the screen has no blend cards', async ({ page }) => {
  const calls = await open(page, false)
  await expect(page.locator('.wx-temp')).toHaveText('26°', { timeout: 20_000 })
  await expect(page.getByTestId('wx-next2h')).toHaveCount(0)
  await expect(page.getByTestId('wx-air')).toHaveCount(0)
  await expect(page.getByText(/^Forecast for .+rounded to about 1.km.+roughly 10.km/) /* the place is named since S28 */).toBeVisible()
  expect(calls).toHaveLength(0)
})
