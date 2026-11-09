import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { seed } from './fixtures/s16/today'

// Made-up forecast, no network: every Open-Meteo call is answered here. 33 C at 70% humidity is a heat index of about 43 C (PAGASA Danger).
async function mockForecast(page: Page, seen: string[] = []) {
  await page.route('https://api.open-meteo.com/**', (route) => {
    seen.push(route.request().url())
    return route.fulfill({ json: openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 }) })
  })
}

test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ page }) => { await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' })) }) // the live map is on by default: tests stay offline

test('weather: hero first, place toggle, forecast sections', async ({ page }) => {
  const seen: string[] = []
  await skipOnboarding(page)
  await mockForecast(page, seen)
  await page.goto('/#weather')
  await expect(page.getByRole('heading', { name: 'Weather', level: 1 })).toBeVisible()
  const action = page.getByRole('region', { name: 'What to do' })
  await expect(action).toContainText('Stay indoors 11 AM-3 PM')
  await expect(action).toContainText(/Heat index 4\d° · Danger/)
  // v13: the hero card is above the action line
  const a = await action.boundingBox()
  const h = await page.getByRole('region', { name: 'Now' }).boundingBox()
  expect(h!.y).toBeLessThan(a!.y)
  await expect(page.locator('.wx-temp')).toHaveText('33°')
  await expect(page.getByRole('region', { name: 'Details' })).toContainText('UV today')
  await expect(page.getByRole('region', { name: '10 days' }).getByRole('listitem')).toHaveCount(5)
  await page.getByRole('button', { name: 'Show all 10 days' }).click()
  await expect(page.getByRole('region', { name: '10 days' }).getByRole('listitem')).toHaveCount(10)
  await expect(page.getByRole('link', { name: /^PAGASA/ })).toHaveAttribute('href', /pagasa\.dost\.gov\.ph/)
  await expect(page.getByText('Your rounded location is sent only to the weather and map services.')).toBeVisible()
  expect(seen[0]).toContain('timezone=auto')
  expect(seen[0]).toContain('forecast_days=10')
  expect(seen[0]).toContain('latitude=9.65')

  // the zone chip: Conel is the second home zone
  await page.getByRole('button', { name: /^Place: / }).click()
  await page.getByRole('button', { name: 'Conel' }).click()
  await expect(page.locator('.wx-k')).toContainText('Conel')
  await expect(page.getByText(/Updated \d/)).toBeVisible()
  expect(seen.some((u) => u.includes('latitude=6.2&'))).toBe(true)
})

test('weather: the live map loads by default, one frame, layers do not stack (D-125)', async ({ page }) => {
  await skipOnboarding(page)
  await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' })) // tests stay offline
  await mockForecast(page)
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toBeVisible()
  await seed(page, 'bantay', 'kv', [{ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } }])
  await page.reload()
  await expect(page.locator('.wx-temp')).toBeVisible()
  const card = page.getByTestId('wx-live-map')
  await expect(card.getByRole('group', { name: 'Weather layer' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(1)
  await card.getByRole('button', { name: 'Temp' }).click()
  await expect(page.locator('iframe')).toHaveCount(1)
  await expect(page.locator('iframe')).toHaveAttribute('src', /overlay=temp/)
})

test('safety Right now weather row opens #weather; the old page keeps maps behind Open live map', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#safety')
  await page.getByRole('list', { name: 'Right now' }).getByRole('link', { name: /rain|Rain|clouds/ }).click()
  await expect(page).toHaveURL(/#weather$/)
  await expect(page.locator('.wx-temp')).toBeVisible()
  await page.goto('/#safety/weather')
  await expect(page.getByRole('link', { name: 'See the forecast' })).toHaveAttribute('href', '#weather')
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('weather: no sideways scroll at 390px, and the hourly strip scrolls on its own', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toBeVisible()
  const wide = await page.evaluate(() => {
    const root = document.scrollingElement as Element
    const main = document.querySelector('main.scroll') as Element
    return { doc: root.scrollWidth - root.clientWidth, main: main.scrollWidth - main.clientWidth }
  })
  expect(wide).toEqual({ doc: 0, main: 0 })
  const strip = await page.locator('.wx-strip').evaluate((el) => ({ more: el.scrollWidth > el.clientWidth }))
  expect(strip.more).toBe(true)
})

test('weather offline: the cached forecast shows "as of"', async ({ page, context }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toHaveText('33°')
  await context.setOffline(true)
  await page.goto('/#today') // client-side: the page stays loaded, the forecast comes back from the cache
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toHaveText('33°')
  await expect(page.getByText(/as of \d{1,2}:\d\d [AP]M/)).toBeVisible()
})

test('weather: the live map follows my last fix (Conel here), not 12N 128E', async ({ page }) => {
  await skipOnboarding(page)
  await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))
  await mockForecast(page)
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toBeVisible()
  await seed(page, 'bantay', 'kv', [{ key: 'loc.last', value: { lat: 6.2, lon: 125.19, at: Date.now() } }])
  await page.reload()
  await expect(page.getByTestId('wx-live-map').locator('iframe')).toHaveAttribute('src', /lat=6\.20&lon=125\.19/)
})

test('today weather card: from=action only when an action line shows, and it is the Weather screen line', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page) // 33 C at 70% humidity: Danger, so an action line shows
  await page.goto('/#today')
  const hero = page.getByRole('region', { name: 'Weather', exact: true })
  await expect(hero.getByRole('link', { name: /Open the weather/ })).toHaveAttribute('href', '#weather?from=action') // the cover link; the Full forecast row beside it is plain #weather
  await expect(hero).toContainText('Stay indoors 11 AM-3 PM')
})

test('weather: rain card shows hourly bars + PAGASA radar link, no layer tabs, no map provider loads', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#weather')
  const card = page.getByRole('region', { name: 'Rain chance' })
  await expect(card).toContainText('Saved for offline · updated')
  await expect(card.getByRole('list', { name: 'Chance of rain, next 12 hours' }).getByRole('listitem')).toHaveCount(12)
  await expect(card.getByRole('link', { name: /Radar images from PAGASA/ })).toHaveAttribute('href', /pagasa\.dost\.gov\.ph/)
  await expect(card.getByRole('button')).toHaveCount(0) // no Rain/Wind/Storm tabs; a storm block shows only while one is listed
  await expect(page.getByTestId('wx-rain').locator('iframe, img')).toHaveCount(0)
})

test('today weather card: a calm day opens plain #weather', async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now: new Date(), temp: 26, humidity: 50, hourlyProb: () => 5, uvMax: 3 }) }))
  await page.goto('/#today')
  await expect(page.getByRole('region', { name: 'Weather', exact: true }).getByRole('link', { name: /Open the weather/ })).toHaveAttribute('href', '#weather')
})
