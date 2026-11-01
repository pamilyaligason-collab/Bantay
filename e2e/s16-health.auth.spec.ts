import { expect, test } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'
import { assertTargets, assertTextContrast, assertJackClear, assertNoWrappedButtons, FIXED_CLOCKS, setScheme } from './v13'
import { empty, full, seed } from './fixtures/s16/health'

declare const process: { env: Record<string, string | undefined> }

// S16 lane L2: Health version B (mockup v12 frames health-B, health-empty, health-labs-s16). Runs in the auth project; all data is invented.
const SHOTS = process.env.S16_SHOTS
const shot = async (page: import('@playwright/test').Page, name: string, scheme: string) => { if (SHOTS) await page.screenshot({ path: `docs/session-16/shots/L2/${name}-${scheme}.png` }) }

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await mock(page, FIXED_CLOCKS[1])
})

// v13 lane H: the overview order (hero, Pinned, Family health, Browse, For you) is checked in e2e/v13-health.spec.ts.
for (const scheme of ['light', 'dark'] as const) {
  test(`full (${scheme}): shots and no wrapped buttons at 360`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await full(page)
    await setScheme(page, scheme)
    await shot(page, 'health-B', scheme)
    await page.setViewportSize({ width: 360, height: 740 })
    await assertNoWrappedButtons(page)
  })

  test(`empty (${scheme}): one hero and the More grid`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await empty(page, FIXED_CLOCKS[1])
    await expect(page.getByTestId('bodyhero')).toContainText('No readings yet')
    await expect(page.getByTestId('glance')).toHaveCount(0)
    await expect(page.getByTestId('nudge')).toHaveCount(0)
    await setScheme(page, scheme)
    await shot(page, 'health-empty', scheme)
    await assertTargets(page); await assertTextContrast(page)
    await assertJackClear(page)
  })
}

test('the admin lands on Me, even when another person has readings (v13 0.4: no pre-pick before the member is known)', async ({ page }) => {
  await full(page)
  await seed(page, 'bantay-health', { readings: [{ personId: 'ma', takenAt: new Date().toISOString(), test: 'weight', value: 55, unit: 'kg' }] })
  await page.reload()
  await expect(page.getByTestId('health-loading')).toHaveCount(0)
  await expect(page.locator('.ps-pill')).toHaveText(/^Me/) // v13: the Me switcher pill replaced the person chips
})

test('the seven numbers, Kpis and the Latest list live on Readings; Refills on Medicines; Move links to Food', async ({ page }) => {
  await full(page)
  await page.getByTestId('browse-readings').click()
  await expect(page).toHaveURL(/#health\/readings$/)
  for (const id of ['sleep', 'mood', 'bp', 'pulse', 'sugar', 'weight', 'steps']) await expect(page.getByTestId(`node-${id}`)).toBeVisible()
  await expect(page.getByTestId('kpis')).toBeVisible()
  await page.goto('/#health/meds')
  await page.getByTestId('refills-door').getByRole('link').click()
  await expect(page).toHaveURL(/#health\/refill$/)
  await page.goto('/#health/move')
  await expect(page.getByTestId('food-door').getByRole('link')).toHaveAttribute('href', '#health/nutrition')
})

test('labs keep the v9 design: eyebrow, source card link, previous switch, v9 footer, short sub line', async ({ page }) => {
  await full(page)
  await page.goto('/#health/labs')
  await expect(page.getByText("from the lab's own paper")).toBeVisible()
  await expect(page.getByTestId('lab-source')).toHaveAttribute('href', '#family/papers')
  await expect(page.getByTestId('lab-source')).toContainText("Ranges are the lab's own printed ranges, not Bantay's.")
  await expect(page.getByRole('switch', { name: 'Show previous result' })).toBeVisible()
  await expect(page.getByText('A result outside the range is a question for your doctor, not a diagnosis. Tap a test to see what it means and the last 3 results.')).toBeVisible()
  await shot(page, 'health-labs', 'light')
  await page.goto('/#health/metric/hba1c')
  await expect(page.getByTestId('lab-short')).toHaveText('Average sugar over about 3 months')
})

test('the nudge row link does not cover the overview: a glance tile still opens its own screen', async ({ page }) => {
  await full(page)
  await page.getByTestId('glance-meds').click()
  await expect(page).toHaveURL(/#health\/meds/)
})

test('a carer who picks Ma logs the meal for Ma, not for themself', async ({ page }) => {
  await full(page)
  await page.goto('/#health/nutrition')
  await page.getByRole('button', { name: /Ma/ }).first().click()
  await page.getByRole('button', { name: /Log a meal/ }).click()
  await page.getByRole('group', { name: 'Salty extras on this meal' }).getByRole('button', { name: /^Add Toyo/ }).click()
  await page.getByRole('button', { name: 'Save meal' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Saved 1 food/ })).toBeVisible()
  const who = await page.evaluate(() => new Promise<string[]>((res, rej) => {
    const o = indexedDB.open('bantay-log')
    o.onerror = () => rej(o.error)
    o.onsuccess = () => { const g = o.result.transaction('food').objectStore('food').getAll(); g.onsuccess = () => { o.result.close(); res((g.result as { personId: string }[]).map((x) => x.personId)) } }
  }))
  expect(who).toEqual(['ma'])
})
