import { expect, test, type Page } from '@playwright/test'
import { assertBudget, assertJackClear, assertNoWrappedButtons, setScheme } from './s16'
import { startToday, type Variant } from './fixtures/s16/today'

declare const process: { env: Record<string, string | undefined> }

// S16 L1 Today: order, budgets (D-102), warning close, buttons at 360, Jack clear at scroll end, 390 shots light + dark (only with S16_SHOTS=<dir>).
const SHOTS = process.env.S16_SHOTS
test.use({ timezoneId: 'Asia/Manila' })

const BUDGET: Record<Variant, number> = { calm: 1150, alertsOff: 1150, quake: 1400, storm: 1500, offline: 1150 }
const ids = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))
const shot = async (page: Page, dir: string, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${dir}/${name}.png`, animations: 'disabled', mask: [page.locator('nav.tabbar')] }) }

for (const variant of ['calm', 'alertsOff', 'quake', 'storm'] as Variant[]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${variant} ${scheme}: budget, order, buttons, Jack clear`, async ({ page }) => {
      await startToday(page, variant, { scheme })
      await setScheme(page, scheme)
      await assertBudget(page, BUDGET[variant])
      const order = (await ids(page)).filter((i) => ['weather-hero', 'alerts-off', 'warning-card', 'warning-card-storm', 'family-notice', 'selfcare'].includes(i ?? ''))
      expect(order[0]).toBe('weather-hero')
      if (variant === 'alertsOff') expect(order[1]).toBe('alerts-off')
      if (variant === 'quake') expect(order).toContain('warning-card')
      if (variant === 'storm') expect(order).toContain('warning-card-storm')
      const hero = await page.getByTestId('weather-hero').getAttribute('data-size')
      expect(hero).toBe(variant === 'calm' ? 'expanded' : 'compact')
      expect(await page.locator('.wxs').count()).toBe(1) // the scene renders in both themes, no pale tint
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
  await expect(card.getByRole('button', { name: 'Mark as taken' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'In 10 minutes' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Skip' })).toBeVisible()
  await page.getByRole('button', { name: 'More things to log' }).click()
  await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Start breathing' }).click()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toHaveCount(0)
})
