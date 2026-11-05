import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding, stubWindy } from './helpers'
import { seed } from './fixtures/s16/today'
import { assertNoSideways, assertTextContrast } from './v13'
import { setScheme } from './s16'

// Session 21 lane W round 2: the Windy map loads once, the Pause switch has a width, the storm map and the calm card in both themes. Invented data only.
// Shots go outside the repo: S21_SHOTS=<dir> writes the 390x844 and 450x949 light and dark set.
declare const process: { env: Record<string, string | undefined> }
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const NOW = new Date('2026-11-05T10:00:00+08:00')
const stormRow = { id: 'gdacs-TC-9', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone SAMPLE', what: '', where: 'Invented Sea', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: NOW.toISOString(), lat: 12, lon: 128, bulletin: '', checkedAt: NOW.toISOString() }

async function open(page: Page, alerts: unknown[] = [], delayMs = 0) {
  await skipOnboarding(page)
  await page.clock.setFixedTime(NOW)
  await page.route('https://api.open-meteo.com/**', async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    await route.fulfill({ json: openMeteoFixture({ now: NOW, temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) })
  })
  if (!process.env.S21_SHOTS) await stubWindy(page) // shots load the real embed (read-only): an empty stub page made two shots blank
  await page.goto('/#weather')
  await seed(page, 'bantay', 'kv', [{ key: 'safety.alerts', value: alerts }, { key: 'alerts:checkedAt', value: NOW.toISOString() }])
  await page.reload()
}

test('D-128: a cold open with a slow forecast asks embed.windy.com exactly once', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (r) => { if (r.url().includes('embed.windy.com')) asked.push(r.url()) })
  await open(page, [], 1500)
  await expect(page.locator('.wx-temp')).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(1)
  await page.waitForLoadState('networkidle')
  expect(asked).toHaveLength(1)
})

test('D-128: forecast failed with a point still shows the map', async ({ page }) => {
  await skipOnboarding(page)
  await stubWindy(page)
  await page.route('https://api.open-meteo.com/**', (route) => route.abort())
  await page.goto('/#weather')
  await expect(page.getByText(/Could not load the forecast/)).toBeVisible()
  await expect(page.getByTestId('wx-live-map').locator('iframe')).toHaveCount(1)
})

test('map cards carry no backdrop-filter, which leaves a cross-origin frame blank in Chromium', async ({ page }) => {
  await open(page)
  const card = page.getByTestId('wx-live-map')
  await expect(card.locator('iframe')).toHaveCount(1)
  expect(await card.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none')
})

for (const [name, path] of [['Weather', '/#weather'], ['Storm tracker', '/#safety/storms']] as const) {
  test(`Pause on mobile data switch has width and a visible track in both states (${name})`, async ({ page }) => {
    await open(page)
    if (path !== '/#weather') await page.goto(path)
    const sw = page.getByRole('switch', { name: 'Pause on mobile data' })
    await sw.scrollIntoViewIfNeeded()
    const states = new Set<string>()
    for (let i = 0; i < 2; i++) { // Weather starts off, Storm tracker on: each is walked through both states
      const was = (await sw.getAttribute('aria-checked'))!
      states.add(was)
      const box = (await sw.boundingBox())!
      expect(box.width).toBe(52)
      expect(box.height).toBeGreaterThanOrEqual(44)
      const track = await sw.locator('span').first().evaluate((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { w: r.width, h: r.height, bg: s.backgroundColor, ring: s.boxShadow } })
      expect(track.w).toBe(52)
      expect(track.h).toBe(28)
      expect(track.bg !== 'rgba(0, 0, 0, 0)' || track.ring !== 'none').toBe(true) // painted: a fill, or the ring of the off state
      await sw.click()
      await expect(sw).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true')
    }
    expect(states.size).toBe(2)
  })
}

test('the live map card: 300 px frame, chips above it, no box round the pause row, 44 px targets', async ({ page }) => {
  await open(page)
  const card = page.getByTestId('wx-live-map')
  await expect(card.locator('iframe')).toHaveCount(1)
  expect((await card.locator('iframe').boundingBox())!.height).toBe(300)
  const chips = (await card.getByRole('group', { name: 'Weather layer' }).boundingBox())!
  expect(chips.y + chips.height).toBeLessThanOrEqual((await card.locator('iframe').boundingBox())!.y) // a chip over an iframe would block the map
  await expect(card.locator('.grp')).toHaveCount(0)
  for (const b of await card.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
})

test('round 3: the map runs edge to edge in its card, the calm card says when it was checked, Storm tracker is a 44 px chevron row', async ({ page }) => {
  await open(page)
  const live = page.getByTestId('wx-live-map')
  const [c, f] = [(await live.boundingBox())!, (await live.locator('iframe').boundingBox())!]
  expect(c.width - f.width).toBeLessThanOrEqual(2) // the card's 1 px borders only
  const calm = page.getByTestId('wx-storms-none')
  await expect(calm.getByText(/^Checked /)).toBeVisible()
  const go = calm.getByRole('link', { name: /^Storm tracker/ })
  expect((await go.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(go.locator('svg')).toHaveCount(1) // the shared chevron Icon
})

for (const scheme of ['light', 'dark'] as const) {
  for (const [state, alerts] of [['calm', []], ['storm', [stormRow]]] as const) {
    test(`new cards, ${state}, ${scheme}: text contrast, no sideways scroll, shots`, async ({ page }) => {
      await open(page, [...alerts])
      await setScheme(page, scheme)
      const card = page.getByTestId(state === 'calm' ? 'wx-storms-none' : 'wx-storms-near')
      await expect(card).toBeVisible()
      if (state === 'calm') await expect(card.locator('.wx-dot')).toHaveAttribute('data-tone', 'calm')
      else await expect(card.locator('iframe')).toHaveAttribute('src', /zoom=6&overlay=wind.*lat=10\.33&lon=125\.94&detailLat=9\.65&detailLon=123\.88/)
      await assertTextContrast(page)
      await assertNoSideways(page)
      const dir = process.env.S21_SHOTS
      if (dir) for (const [w, h] of [[390, 844], [450, 949]] as const) {
        await page.setViewportSize({ width: w, height: h })
        for (const [name, el] of [['weather', card], ['weather-map', page.getByTestId('wx-live-map')]] as const) {
          await el.evaluate((n) => n.scrollIntoView({ block: 'center' }))
          // the map card had shots with an empty frame: the iframe mounts only once near the screen, so wait until Windy has drawn tiles in it
          if (el !== card || state === 'storm') await page.frameLocator(`[data-testid="${name === 'weather-map' ? 'wx-live-map' : 'wx-storms-near'}"] iframe`).locator('.leaflet-tile-loaded').first().waitFor({ timeout: 45_000 })
          await page.screenshot({ path: `${dir}/${name}-${state}-${scheme}-${w}.png`, animations: 'disabled' })
        }
      }
    })
  }
}
