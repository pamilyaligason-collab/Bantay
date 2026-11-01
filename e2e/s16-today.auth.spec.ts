import { expect, test, type Page } from '@playwright/test'
import { assertHero, assertJackClear, assertNoWrappedButtons, assertTargets, assertTextContrast, setScheme } from './v13'
import { startToday, type Variant } from './fixtures/s16/today'

declare const process: { env: Record<string, string | undefined> }

// S16 L1 Today (v13 policy): order, hero first, measured targets and contrast, warning close, buttons at 360, Jack clear at scroll end, 390 shots light + dark (only with S16_SHOTS=<dir>).
const SHOTS = process.env.S16_SHOTS
test.use({ timezoneId: 'Asia/Manila' })

const ids = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))
const shot = async (page: Page, dir: string, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${dir}/${name}.png`, animations: 'disabled', mask: [page.locator('nav.tabbar')] }) }

for (const variant of ['calm', 'alertsOff', 'quake', 'storm'] as Variant[]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${variant} ${scheme}: hero first, order, targets, contrast, buttons, Jack clear`, async ({ page }) => {
      await startToday(page, variant, { scheme })
      await setScheme(page, scheme)
      await assertHero(page); await assertTargets(page); await assertTextContrast(page)
      const order = (await ids(page)).filter((i) => ['weather-hero', 'alerts-off', 'warning-card', 'warning-card-storm', 'family-notice', 'selfcare'].includes(i ?? ''))
      expect(order).toEqual({ calm: ['weather-hero', 'selfcare'], alertsOff: ['weather-hero', 'alerts-off', 'selfcare'], quake: ['weather-hero', 'warning-card', 'selfcare'], storm: ['weather-hero', 'warning-card-storm', 'selfcare'], offline: ['weather-hero', 'selfcare'] }[variant])
      const hero = await page.getByTestId('weather-hero').getAttribute('data-size')
      expect(hero).toBe('expanded') // v13 Today: the weather hero is always the full card, warnings sit under it
      expect(await page.locator('.wxs').count()).toBe(1) // the scene renders in both themes, no pale tint
      // a live red card hides Jack, so hold-for-help must sit on Today itself; a calm Today leaves SOS to the Jack sheet
      await expect(page.getByTestId('warning-sos').getByRole('button', { name: 'Hold to call and text your family' })).toHaveCount(variant === 'quake' || variant === 'storm' ? 1 : 0)
      if (variant === 'quake' || variant === 'storm') { // on the first screen, above the tab bar, without scrolling
        const hold = (await page.getByTestId('warning-sos').boundingBox())!
        const bar = (await page.getByTestId('tabbar').boundingBox())!
        expect(hold.y + hold.height).toBeLessThanOrEqual(bar.y)
      }
      await page.setViewportSize({ width: 360, height: 800 })
      await assertNoWrappedButtons(page)
      await page.setViewportSize({ width: 390, height: 844 })
      await assertJackClear(page)
      await page.locator('main.scroll').evaluate((el) => { el.scrollTop = 0 })
      await shot(page, 'l1', `today-${variant}-${scheme}`)
    })
  }
}

test('closing a warning hides it on Today, a reload keeps it hidden, and the roll call survives a storm close', async ({ page }) => {
  await startToday(page, 'quake')
  await expect(page.getByRole('region', { name: 'Active warning' })).toContainText('Drop, cover and hold on.')
  await page.getByRole('button', { name: /Hide this warning/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Hidden here. Still in Safety.' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Active warning' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Active warning' })).toHaveCount(0)
})

test('storm: the roll-call pair, Do now rows and links; closing keeps the roll call', async ({ page }) => {
  await startToday(page, 'storm')
  const card = page.getByRole('region', { name: 'Storm mode' })
  await expect(card.getByRole('button', { name: "I'm OK" })).toBeVisible({ timeout: 15_000 })
  await expect(card.getByRole('list', { name: 'Do now' }).locator('li')).toHaveCount(4)
  await expect(card.getByRole('link', { name: /Track the storm/ })).toHaveAttribute('href', '#safety/storms')
  await expect(page.locator('.bt .scroll img.jack')).toHaveCount(0) // no Jack art on a storm (D-91)
  await card.getByRole('button', { name: /Hide this warning/ }).click()
  await expect(page.getByRole('region', { name: 'Storm check-in' }).getByRole('button', { name: "I'm OK" })).toBeVisible()
})

test('Next up: Take, Snooze and Skip; the More tile opens the log sheet; the breath row opens the sheet and back closes it', async ({ page }) => {
  await startToday(page, 'calm', { dose: true })
  const card = page.locator('.td-next')
  await expect(card.getByRole('button', { name: 'Take, mark as taken' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Snooze, in 10 minutes' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Skip' })).toBeVisible()
  await page.getByRole('button', { name: 'More things to log' }).click()
  const more = page.getByRole('dialog', { name: 'More' })
  await expect(more).toBeVisible()
  for (const t of ['Dose taken', 'Food', 'Walk', 'Move', 'Pain', 'Sleep', 'Temperature', 'Mood', 'Water']) await expect(more.getByRole('button', { name: t, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Start breathing' }).click()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toHaveCount(0)
})

test('the whole stack in order: hero, alerts-off, warning, family notice, Next up, breathing, quick log (SOS moved to the Jack sheet, v13 0.3)', async ({ page }) => {
  await startToday(page, 'quake', { dose: true, notice: true, alertsOff: true })
  const sels = ['[data-testid=weather-hero]', '[data-testid=alerts-off]', '[data-testid=warning-card]', '[data-testid=family-notice]', '.td-next', '[data-testid=selfcare]', '.td-quick']
  const tops = await page.evaluate((list) => list.map((q) => { const el = document.querySelector(q); return el ? el.getBoundingClientRect().top + (document.querySelector('main.scroll')?.scrollTop ?? 0) : null }), sels)
  expect(tops.every((t) => t != null), `missing: ${sels.filter((_, i) => tops[i] == null)}`).toBe(true)
  for (let i = 1; i < tops.length; i++) expect(tops[i]!, `${sels[i]} must sit below ${sels[i - 1]}`).toBeGreaterThan(tops[i - 1]!)
  await expect(page.getByTestId('weather-hero')).toHaveAttribute('data-size', 'expanded')
  await assertJackClear(page)
})

test('a family notice opens what it is about; its close button marks it seen', async ({ page }) => {
  await startToday(page, 'calm', { notice: true })
  const row = page.getByTestId('family-notice')
  await expect(row.getByRole('link')).toHaveAttribute('href', '#health') // the dose_missed template opens Health (templates.ts tab)
  await row.getByRole('button', { name: 'Dismiss this family alert' }).click()
  await expect(row).toHaveCount(0)
})

// Weather screen (PLAN 1.1 row 12): place switcher, scene hero, heat strip, four tiles, Season and sun.
for (const scheme of ['light', 'dark'] as const) {
  test(`Weather screen ${scheme}: targets, contrast, place switcher, hero, heat strip, tiles, Season and sun`, async ({ page }) => {
    await startToday(page, 'calm', { scheme })
    await page.goto('/#weather')
    await expect(page.getByRole('group', { name: 'Place' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Now' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Details' }).locator('.wx-tile')).toHaveCount(4)
    await expect(page.getByRole('region', { name: 'Season and sun' })).toBeVisible()
    await expect(page.locator('.wx-scale')).toBeVisible()
    await setScheme(page, scheme)
    await page.setViewportSize({ width: 390, height: 844 })
    await assertTargets(page); await assertTextContrast(page)
    await page.setViewportSize({ width: 360, height: 800 })
    await assertNoWrappedButtons(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await assertJackClear(page)
    await page.locator('main.scroll').evaluate((el) => { el.scrollTop = 0 })
    await shot(page, 'l1', `weather-${scheme}`)
  })
}
