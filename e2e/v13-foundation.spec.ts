import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertHero, assertJackClear, FIXED_CLOCKS, assertNarrow, assertNoSideways, assertTargets, assertTextContrast, setScheme, shotsLightDark } from './v13'

// v13 Phase 0 foundation: the shell and the four tab roots Phase 0 touched, light and dark at 390x844, then the 195 px narrow check.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  const now = new Date(FIXED_CLOCKS[1])
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 28, humidity: 55, feels: 30, code: 63, hourlyProb: () => 10 }) }))
})

// Known until a Phase 1 lane lands (listed in TESTING.md): the root test is fixme, never deleted.
const KNOWN: Record<string, string> = {
}

for (const root of ['today', 'health', 'safety', 'me']) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`#${root} ${scheme}: targets, contrast, no sideways scroll, Jack clear`, async ({ page }) => {
      test.fixme(!!KNOWN[root], KNOWN[root])
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`/#${root}`)
      await expect(page.locator('h1').first()).toBeVisible()
      await setScheme(page, scheme)
      if (root === 'today') await assertHero(page)
      await assertTargets(page)
      await assertTextContrast(page)
      await assertNoSideways(page)
      await assertJackClear(page)
    })
  }

  test(`#${root}: holds at 195 px`, async ({ page }) => {
    await page.goto(`/#${root}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await assertNarrow(page)
  })

  test(`#${root}: shots light and dark (only with V13_SHOTS=<dir>)`, async ({ page }) => {
    await page.goto(`/#${root}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await shotsLightDark(page, root)
  })
}

test('the tab bar is 64 px tall and every tab is a 44 px target', async ({ page }) => {
  await page.goto('/#today')
  const bar = (await page.getByTestId('tabbar').boundingBox())!
  expect(Math.round(bar.height)).toBe(64)
  for (const t of ['today', 'health', 'discover', 'family', 'safety']) {
    const box = (await page.getByTestId(`tab-${t}`).boundingBox())!
    expect(box.height, `tab-${t}`).toBeGreaterThanOrEqual(44)
    expect(box.width, `tab-${t}`).toBeGreaterThanOrEqual(44)
  }
})
