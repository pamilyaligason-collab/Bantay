import { expect, test, type Page } from '@playwright/test'
import { assertBudget, assertJackClear, assertNoWrappedButtons, setScheme } from './s16'
import { startToday, type Variant } from './fixtures/s16/today'

declare const process: { env: Record<string, string | undefined> }

// S16 L1 Today: order, budgets (D-102), warning close, buttons at 360, Jack clear at scroll end, 390 shots light + dark (only with S16_SHOTS=<dir>).
const SHOTS = process.env.S16_SHOTS
test.use({ timezoneId: 'Asia/Manila' })

// alertsOff is the worst stack (alerts-off card + Next up + quick log + SOS + breath + See week + More with the setup row and week line); PLAN D-102 Q6 gives it 1150
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
      expect(order).toEqual({ calm: ['weather-hero', 'selfcare'], alertsOff: ['weather-hero', 'alerts-off', 'selfcare'], quake: ['weather-hero', 'warning-card', 'selfcare'], storm: ['weather-hero', 'warning-card-storm', 'selfcare'], offline: ['weather-hero', 'selfcare'] }[variant])
      const hero = await page.getByTestId('weather-hero').getAttribute('data-size')
      expect(hero).toBe(variant === 'calm' ? 'expanded' : 'compact')
      const hh = await page.getByTestId('weather-hero').evaluate((e) => e.querySelector('.sc')!.getBoundingClientRect().height)
      expect(Math.abs(hh - (variant === 'calm' ? 232 : 196)), `hero is ${hh} px`).toBeLessThanOrEqual(2) // PLAN 1.1 row 2: 232 expanded, 196 compact
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

test('the whole stack in order: hero, alerts-off, warning, family notice, Next up, quick log, SOS, breathing (PLAN 1.1 rows 2-9)', async ({ page }) => {
  await startToday(page, 'quake', { dose: true, notice: true, alertsOff: true })
  const sels = ['[data-testid=weather-hero]', '[data-testid=alerts-off]', '[data-testid=warning-card]', '[data-testid=family-notice]', '.td-next', '.td-quick', '.td-sos', '[data-testid=selfcare]']
  const tops = await page.evaluate((list) => list.map((q) => { const el = document.querySelector(q); return el ? el.getBoundingClientRect().top + (document.querySelector('main.scroll')?.scrollTop ?? 0) : null }), sels)
  expect(tops.every((t) => t != null), `missing: ${sels.filter((_, i) => tops[i] == null)}`).toBe(true)
  for (let i = 1; i < tops.length; i++) expect(tops[i]!, `${sels[i]} must sit below ${sels[i - 1]}`).toBeGreaterThan(tops[i - 1]!)
  await expect(page.getByTestId('weather-hero')).toHaveAttribute('data-size', 'compact')
  await assertJackClear(page)
})

test('a family notice opens what it is about; its close button marks it seen', async ({ page }) => {
  await startToday(page, 'calm', { notice: true })
  const row = page.getByTestId('family-notice')
  await expect(row.getByRole('link')).toHaveAttribute('href', '#health') // the dose_missed template opens Health (templates.ts tab)
  await row.getByRole('button', { name: 'Dismiss this family alert' }).click()
  await expect(row).toHaveCount(0)
})

// Weather screen (D-102 budget 1900; PLAN 1.1 row 12): place switcher, scene hero, heat strip, four tiles, Season and sun.
for (const scheme of ['light', 'dark'] as const) {
  test(`Weather screen ${scheme}: budget, place switcher, hero, heat strip, tiles, Season and sun`, async ({ page }) => {
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
    await assertBudget(page, 1900)
    await page.setViewportSize({ width: 360, height: 800 })
    await assertNoWrappedButtons(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await assertJackClear(page)
    await page.locator('main.scroll').evaluate((el) => { el.scrollTop = 0 })
    await shot(page, 'l1', `weather-${scheme}`)
  })
}

// SOS block (TB fix run 5): the hold line sits inside the button but never over the label, at 390 / 360 / 195 px, idle and holding, light and dark; the holding line is >= 4.5:1.
const lum = (c: string) => { const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
for (const scheme of ['light', 'dark'] as const) {
  test(`SOS block ${scheme}: label and hold line never intersect (390, 360, 195), holding line contrast >= 4.5`, async ({ page }) => {
    await startToday(page, 'alertsOff', { scheme })
    await setScheme(page, scheme)
    await expect(page.locator('.bt[data-jack]')).toHaveCount(1) // the overlap this guards came from the Jack margin, so Jack must be shown
    const btn = page.locator('.td-sos .sos-simple-btn')
    const gap = () => page.evaluate(() => {
      const b = document.querySelector('.td-sos .sos-simple-btn')!
      const label = b.querySelector('span')!.getBoundingClientRect()
      const r = document.createRange(); r.selectNodeContents(document.querySelector('.td-sos .sos-simple-sub')!)
      const sub = r.getBoundingClientRect()
      const bb = b.getBoundingClientRect()
      return { overlap: label.bottom > sub.top && sub.bottom > label.top, labelBottom: label.bottom, subTop: sub.top, subBottom: sub.bottom, btnBottom: bb.bottom, h: bb.height }
    })
    for (const w of [390, 360, 195]) {
      await page.setViewportSize({ width: w, height: 800 })
      await btn.scrollIntoViewIfNeeded()
      const g = await gap()
      expect(g.overlap, `idle ${w}px ${JSON.stringify(g)}`).toBe(false)
      expect(g.subBottom, `idle ${w}px line stays inside the button`).toBeLessThanOrEqual(g.btnBottom + 0.5)
      await btn.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
      await expect(page.locator('.td-sos .sos-simple-sub')).toHaveText('Let go to cancel. Nothing is sent yet.')
      const h = await gap()
      expect(h.overlap, `holding ${w}px ${JSON.stringify(h)}`).toBe(false)
      expect(h.subBottom, `holding ${w}px line stays inside the button`).toBeLessThanOrEqual(h.btnBottom + 0.5)
      const c = await page.evaluate(() => ({ fg: getComputedStyle(document.querySelector('.td-sos .sos-simple-sub')!).color, bg: getComputedStyle(document.querySelector('.td-sos .sos-simple-btn')!).backgroundColor }))
      expect(ratio(c.fg, c.bg), `holding ${w}px ${c.fg} on ${c.bg}`).toBeGreaterThanOrEqual(4.5)
      await btn.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true })
      await expect(page.locator('.td-sos .sos-simple-sub')).toHaveText(/Hold 3 seconds/)
    }
  })
}
