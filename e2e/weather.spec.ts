import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'

// Made-up forecast, no network: every Open-Meteo call is answered here. 33 C at 70% humidity is a heat index of about 43 C (PAGASA Danger).
async function mockForecast(page: Page, seen: string[] = []) {
  await page.route('https://api.open-meteo.com/**', (route) => {
    seen.push(route.request().url())
    return route.fulfill({ json: openMeteoFixture({ now: new Date(), temp: 33, humidity: 70 }) })
  })
}

test.use({ viewport: { width: 390, height: 844 } })

test('weather: action line first, place toggle, forecast sections', async ({ page }) => {
  const seen: string[] = []
  await skipOnboarding(page)
  await mockForecast(page, seen)
  await page.goto('/#weather')
  await expect(page.getByRole('heading', { name: 'Weather', level: 1 })).toBeVisible()
  const action = page.getByRole('region', { name: 'What to do' })
  await expect(action).toContainText('Stay indoors 11 AM-3 PM')
  await expect(action).toContainText(/Heat index 4\d° · Danger/)
  // the action line is above the hero card
  const a = await action.boundingBox()
  const h = await page.getByRole('region', { name: 'Now' }).boundingBox()
  expect(a!.y).toBeLessThan(h!.y)
  await expect(page.locator('.wx-temp')).toHaveText('33°')
  await expect(page.getByRole('region', { name: 'Details' })).toContainText('UV today')
  await expect(page.getByRole('region', { name: '10 days' }).getByRole('listitem')).toHaveCount(10)
  await expect(page.getByRole('link', { name: /^PAGASA/ })).toHaveAttribute('href', /pagasa\.dost\.gov\.ph/)
  await expect(page.getByText('Your rounded location is sent only to the weather service.')).toBeVisible()
  expect(seen[0]).toContain('timezone=auto')
  expect(seen[0]).toContain('forecast_days=10')
  expect(seen[0]).toContain('latitude=9.65')

  // place toggle: Home 2 is Conel
  await expect(page.getByRole('button', { name: 'Home 1' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Home 2' }).click()
  await expect(page.getByRole('button', { name: 'Home 2' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^Conel · updated/)).toBeVisible()
  expect(seen.some((u) => u.includes('latitude=6.2&'))).toBe(true)
})

test('weather: the live map stays closed behind "Open live map"', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open live map' }).click()
  await expect(page.getByRole('group', { name: 'Weather layer' })).toBeVisible()
})

test('safety weather tile opens #weather; the old page keeps maps behind Open live map', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#safety')
  await page.getByRole('navigation', { name: 'Safety topics' }).getByRole('link', { name: /^Weather/ }).click()
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

test('weather: the live map and Zoom Earth follow my place (Home 2 = Conel), not 12N 128E', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#weather')
  await page.getByRole('button', { name: 'Home 2' }).click()
  await page.getByRole('button', { name: 'Open live map' }).click()
  await expect(page.getByRole('link', { name: /Zoom Earth/ })).toHaveAttribute('href', /#view=6\.20,125\.19,5z/)
})

test('today weather card: from=action only when an action line shows, and it is the Weather screen line', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page) // 33 C at 70% humidity: Danger, so an action line shows
  await page.goto('/#today')
  const hero = page.getByRole('region', { name: 'Weather' })
  await expect(hero.getByRole('link')).toHaveAttribute('href', '#weather?from=action')
  await expect(hero).toContainText('Stay indoors 11 AM-3 PM')
})

test('weather: rain card shows hourly bars + PAGASA radar link, chips switch to storm track, no map provider loads', async ({ page }) => {
  await skipOnboarding(page)
  await mockForecast(page)
  await page.goto('/#weather')
  const card = page.getByRole('region', { name: 'Rain and storm map' })
  await expect(card).toContainText('Saved for offline · updated')
  await expect(card.getByRole('list', { name: 'Chance of rain, next 12 hours' }).getByRole('listitem')).toHaveCount(12)
  await expect(card.getByRole('link', { name: /Radar images from PAGASA/ })).toHaveAttribute('href', /pagasa\.dost\.gov\.ph/)
  await card.getByRole('button', { name: 'Storm track' }).click()
  await expect(card).toContainText('From GDACS and Open-Meteo')
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('today weather card: a calm day opens plain #weather', async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now: new Date(), temp: 26, humidity: 50, hourlyProb: () => 5, uvMax: 3 }) }))
  await page.goto('/#today')
  await expect(page.getByRole('region', { name: 'Weather' }).getByRole('link')).toHaveAttribute('href', '#weather')
})
