import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { seed } from './fixtures/s16/today'
import { assertHero, assertNarrow, assertOrder, assertNoSideways, assertNoWrappedButtons, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

// v13 lane W: the Weather screen per board Weather. Made-up forecast, no network (Open-Meteo and the Windy embed are both answered here).
// V13_SHOTS=<dir> also writes the 390x844 light and dark set (docs/redesign-2026-10-31/shots/weather).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const seedLast = (page: Page) => seed(page, 'bantay', 'kv', [{ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() } }])

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(FIXED_CLOCKS[1]), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: (h) => (h >= 20 ? 80 : 10) }) }))
  await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))
  await page.goto('/#weather')
  await expect(page.locator('.wx-temp')).toHaveText('26°')
})

test('X6: board order, hero first, one [data-hero]', async ({ page }) => {
  await assertHero(page)
  await assertOrder(page, ['wx-hero', 'wx-warn', 'wx-advice', 'wx-live-map', 'wx-48', 'wx-rain', 'wx-storms-none', 'wx-10', 'wx-details', 'wx-official']) // dry at 00:30 (rain only after 8 PM): the strip leads; with rain likely or falling the rain card leads (adapt.test.tsx)
})

test('X1: the whole screen is the sky; no band behind the cards; temperature centred and large', async ({ page }) => {
  const bg = await page.locator('.bt .scroll').evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(bg).toContain('linear-gradient')
  expect(await page.locator('.wx').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none') // the old wash behind the first cards
  const t = await page.locator('.wx-temp').evaluate((el) => { const r = el.getBoundingClientRect(); return { mid: r.left + r.width / 2, fs: parseFloat(getComputedStyle(el).fontSize), w: getComputedStyle(el).fontWeight } })
  expect(Math.abs(t.mid - 195)).toBeLessThan(6)
  expect(t.fs).toBeGreaterThanOrEqual(72)
  expect(t.w).toBe('200')
  // cards are glass: translucent, not the opaque white/navy fill
  const alpha = await page.locator('.wx-tile').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(alpha).toMatch(/rgba\(.*0\.\d+\)|color\(srgb .*\/ 0\.\d+\)/)
})

test('rain chart: one baseline, every column the same three rows; no Rain/Wind/Storm tabs, no Season card', async ({ page }) => {
  const m = await page.locator('.wx-bars li').evaluateAll((lis) => lis.map((li) => ({ track: li.querySelector('em')!.getBoundingClientRect().bottom, fig: li.querySelector('b')!.getBoundingClientRect().top, hour: li.querySelector('span')!.getBoundingClientRect().top, h: li.querySelector('em')!.getBoundingClientRect().height })))
  expect(m).toHaveLength(12)
  for (const k of ['track', 'fig', 'hour', 'h'] as const) expect(Math.max(...m.map((x) => x[k])) - Math.min(...m.map((x) => x[k]))).toBeLessThan(1)
  // A1: value and hour are labelled on the same columns (one pace), and the whole chart sits above the caption (no fixed height spilling the hour row into it)
  const pace = await page.locator('.wx-bars li').evaluateAll((lis) => lis.map((li) => [li.querySelector('b')!.getAttribute('data-show'), li.querySelector('span')!.getAttribute('data-show')]))
  expect(pace.every(([a, b]) => a === b)).toBe(true)
  expect(pace.filter(([a]) => a === '1').length).toBeGreaterThanOrEqual(3)
  const gap = await page.locator('.wx-bars').evaluate((ul) => ul.nextElementSibling!.getBoundingClientRect().top - ul.getBoundingClientRect().bottom)
  expect(gap, 'caption starts below the chart').toBeGreaterThanOrEqual(0)
  await expect(page.getByRole('radio', { name: /Storm track|Wind/ })).toHaveCount(0)
  await expect(page.getByTestId('wx-rain').getByRole('button', { name: /Storm track|^Wind$/ })).toHaveCount(0)
  await expect(page.getByText('Season and sun')).toHaveCount(0)
})

test('X5: no heat strip, no Home 1/2 switch; the zone chip names the place', async ({ page }) => {
  await expect(page.locator('.wx-scale')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Home [12]$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Place: / })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Place: / })).toHaveText(/\S/) // S29: the place is said once, in the header pill
  await expect(page.locator('.wx-k')).toHaveCount(0)
})

test('X4: every percentage on the page has a word that says what it is', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out: string[] = []
    const walker = document.createTreeWalker(document.querySelector('.bt .scroll')!, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent ?? ''
      if (!/\d%/.test(t)) continue
      const el = n.parentElement!
      if (el.closest('[aria-hidden="true"]')) continue
      // a list column takes its label from the section meta ("rain chance ..."); a lone figure from the words around it
      const head = el.closest('.sec')?.querySelector('.sec-meta')?.textContent ?? ''
      const around = (el.closest('.wx-tile, .wx-rain, .wx-action, li')?.textContent ?? '') + ' ' + (el.closest('ul')?.getAttribute('aria-label') ?? '')
      if (!/chance/i.test(head) && !/(up to|next|chance|humidity|heat)/i.test(around)) out.push(t.trim())
    }
    return out
  })
  expect(bad).toEqual([])
})

for (const [w, h] of [[390, 844], [360, 740]] as const) {
  for (const fix of [false, true]) {
    test(`44 px targets, no sideways scroll at ${w}${fix ? ' with a last fix' : ''}`, async ({ page }) => {
      if (fix) { await seedLast(page); await page.reload(); await expect(page.getByTestId('place-last')).toBeVisible() }
      await page.setViewportSize({ width: w, height: h })
      await assertTargets(page)
      await assertNoSideways(page)
      await assertNoWrappedButtons(page)
    })
  }
}

test('195 px (200% text zoom)', async ({ page }) => {
  await assertNarrow(page)
})

test('195 px with a last fix', async ({ page }) => {
  await seedLast(page)
  await assertNarrow(page)
  await expect(page.getByTestId('place-last')).toBeVisible()
})

test('contrast, light and dark', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // no colour transition, so the dark read is the settled colour
  for (const s of ['light', 'dark'] as const) {
    await setScheme(page, s)
    await assertTextContrast(page)
  }
})

test('map: no fix shows the prompt, a last fix centres the map', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open live map' })).toHaveCount(0)
  await expect(page.getByTestId('wx-live-map')).toBeVisible() // D-125: open by default, on the home zone when there is no fix
  await expect(page.getByText(/nothing to centre on/)).toHaveCount(0)
  await seedLast(page)
  await page.reload()
  await expect(page.getByTestId('place-last')).toBeVisible()
  const frame = page.getByTestId('wx-live-map').locator('iframe')
  await expect(frame).toHaveAttribute('src', /lat=10\.32/)
  await expect(frame).not.toHaveAttribute('src', /9\.65/)
})

test('reduced motion: the scene is still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.locator('.wx-hero .wxs')).toHaveAttribute('data-still', '1')
})

test('full-page shots', async ({ page }) => {
  const dir = process.env.V13_FULL
  test.skip(!dir, 'V13_FULL not set')
  for (const w of [390, 360]) {
    await page.setViewportSize({ width: w, height: 3300 })
    for (const s of ['light', 'dark'] as const) { await setScheme(page, s); await page.waitForTimeout(400); await page.screenshot({ path: `${dir}/weather-${s}-${w}.png`, animations: 'disabled' }) }
  }
})

test('shots', async ({ page }) => {
  await shotsLightDark(page, 'weather')
  await seedLast(page)
  await page.reload()
  await expect(page.locator('iframe').first()).toBeVisible()
  await shotsLightDark(page, 'weather-map')
})
