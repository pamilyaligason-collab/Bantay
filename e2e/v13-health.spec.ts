import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'
import { empty, full } from './fixtures/s16/health'
import { assertHero, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertOrder, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

// v13 lane H: the Health overview (hero, Pinned, Family health, Browse, For you), the view-only member page and the six sub-screens.
// Signed in as the made-up member `me` (health-auth-mock); all data is invented. V13_SHOTS=<dir> also writes the 390x844 light and dark set (docs/redesign-2026-10-31/shots/health).

// The file name keeps it in the chromium project, but the signed-in mock needs the Supabase-env build the config serves on PW_PORT + 500.
test.use({ baseURL: `http://localhost:${Number(process.env.PW_PORT ?? 4317) + 500}`, serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await mock(page, FIXED_CLOCKS[1])
})

const at = async (page: Page, hash: string, h1: string | RegExp) => {
  await page.goto(`/${hash}`)
  await expect(page.locator('h1').first()).toHaveText(h1)
}

test('overview: hero, Pinned, Family health, Browse, For you in that order, one hero near the top', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await expect(page.getByTestId('for-you')).toBeVisible()
  await assertHero(page)
  await assertOrder(page, ['bodyhero', 'glance', 'browse', 'for-you']) // Family health hides for a one-person roster; it is ordered below when present
  if (await page.getByTestId('family-health').count()) await assertOrder(page, ['glance', 'family-health', 'browse'])
  for (const k of ['readings', 'labs', 'meds', 'visits', 'move', 'body']) await expect(page.getByTestId(`browse-${k}`)).toBeVisible()
  await expect(page.getByTestId('glance-video')).toHaveAttribute('href', '#discover/watch')
  await expect(page.getByTestId('nudge')).toBeVisible()
})

for (const [w, h] of [[390, 844], [360, 740]] as const) {
  test(`overview: 44 px targets and no sideways scroll at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await full(page, FIXED_CLOCKS[1])
    await expect(page.getByTestId('browse')).toBeVisible()
    await assertTargets(page)
    await assertNoSideways(page)
    await assertNoWrappedButtons(page)
  })
}

test('overview: no sideways scroll or small targets at 195 px (200% text zoom)', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await assertNarrow(page)
})

test('Me switcher opens the member page, which has no Take, Skip or Add; Back to me returns', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await page.locator('.ps-pill').click()
  await expect(page.getByRole('dialog', { name: 'Whose health' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Whose health' }).getByRole('button', { name: /Ma/ }).click()
  await expect(page).toHaveURL(/#health\/member\/ma$/)
  await expect(page.getByTestId('member-bar')).toContainText(/view only|you can log for them/) // the bar follows whether logging is shared
  await expect(page.getByRole('button', { name: /^(Take|Skip)\b/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^(Take|Skip)\b/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Reading|Add/ })).toHaveCount(0)
  await assertTargets(page)
  await page.getByRole('link', { name: 'Back to me' }).click()
  await expect(page).toHaveURL(/#health$/)
  await expect(page.getByTestId('bodyhero')).toBeVisible()
  await expect(page.locator('.ps-pill')).toContainText('Me')
})

test('sub-screens: Readings, Labs, Medicines, Visits, Move and food, Body wiki', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/readings', 'Readings')
  await expect(page.getByRole('group', { name: 'Period' })).toBeVisible() // segmented groups
  await expect(page.getByRole('group', { name: 'Time of day' })).toBeVisible()
  await expect(page.getByTestId('readings-hero')).toBeVisible() // chart with its band
  await assertHero(page)
  await at(page, '#health/labs', /Lab results|Labs/)
  await expect(page.getByTestId('labs-list')).toBeVisible()
  const zones = await page.locator('.lr-zones').first().evaluate((e) => e.textContent ?? '')
  expect(zones).toMatch(/Normal/)
  await expect(page.getByTestId('labs-list')).toContainText(/Above|Below|In range|Normal|Within/i) // a plain word, not colour alone
  await at(page, '#health/meds', 'Medicines')
  await at(page, '#health/visits', 'Visits')
  await expect(page.getByRole('link', { name: 'Plan a visit' })).toHaveAttribute('href', '#family/plan')
  await at(page, '#health/move', 'Move and food')
  await at(page, '#health/body', 'Body wiki')
  await expect(page.getByTestId('body-systems').getByRole('button')).not.toHaveCount(0) // system chips
})

test('Medicines with nobody added says so and offers the first step', async ({ page }) => {
  await empty(page, FIXED_CLOCKS[1])
  await at(page, '#health/meds', 'Medicines')
  await expect(page.getByText('No medicines yet').first()).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`overview and sub-screens meet 4.5:1 contrast (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ colorScheme: scheme })
    await full(page, FIXED_CLOCKS[1])
    await setScheme(page, scheme)
    await expect(page.getByTestId('browse')).toBeVisible()
    await assertTextContrast(page)
    for (const hash of ['#health/readings', '#health/labs', '#health/meds', '#health/visits', '#health/move', '#health/body']) {
      await page.goto(`/${hash}`)
      await expect(page.locator('h1').first()).toBeVisible()
      await setScheme(page, scheme)
      await assertTextContrast(page)
    }
  })
}

test('reduced motion: the overview draws and nothing keeps animating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await full(page, FIXED_CLOCKS[1])
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && (a.effect.getComputedTiming().iterations ?? 1) === Infinity).length)
  expect(running, 'infinite animations under reduce').toBe(0)
  await expect(page.getByTestId('for-you')).toBeVisible()
})

test('shots (V13_SHOTS)', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'evidence only, set V13_SHOTS=<dir>')
  test.setTimeout(240_000)
  await full(page, FIXED_CLOCKS[1])
  await page.mouse.move(0, 0)
  await shotsLightDark(page, 'health')
  for (const [name, hash] of [['member', '#health/member/ma'], ['readings', '#health/readings'], ['labs', '#health/labs'], ['meds', '#health/meds'], ['visits', '#health/visits'], ['move', '#health/move'], ['body', '#health/body']] as const) {
    await page.goto(`/${hash}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await page.waitForTimeout(400)
    await shotsLightDark(page, name)
  }
})

declare const process: { env: Record<string, string | undefined> }
