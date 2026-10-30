import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { assertBudget, assertJackClear, assertNoWrappedButtons, setScheme } from './s16'
import { admin, member } from './fixtures/s16/settings'

// S16 L5: Settings overview (<= 850) and groups (<= 700), light and dark at 390, buttons at 360, no control under the Jack button, TopBar greeting wraps.
declare const process: { env: Record<string, string | undefined> }
const SHOTS = 'docs/session-16/shots/L5'
const shot = async (page: Page, name: string, scheme: string) => {
  if (!process.env.S16_SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
}
const GROUPS: [string, string][] = [['alerts', 'Alerts and reminders'], ['display', 'Display'], ['family', 'Family and sharing'], ['phone', 'Phone'], ['signin', 'Sign-in'], ['about', 'About']]

for (const scheme of ['light', 'dark'] as const) {
  test(`overview: every row reaches its screen, within budget (${scheme})`, async ({ page }) => {
    await admin(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#me')
    await setScheme(page, scheme)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText('Admin', { exact: true })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Simple mode' })).toBeVisible()
    for (const [g, title] of GROUPS) await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `#me/${g}`)
    await expect(page.getByRole('link', { name: /Privacy/ })).toHaveAttribute('href', '#privacy')
    await assertBudget(page, 850)
    await assertJackClear(page)
    await shot(page, 'settings-s16', scheme)
    await expect(page).toHaveTitle('Settings - Family Bantay')
  })

  for (const [g, title] of GROUPS) {
    test(`#me/${g}: own Back and title, one screen, back lands on #me (${scheme})`, async ({ page }) => {
      await admin(page)
      await page.setViewportSize({ width: 390, height: 640 }) // shorter than the 700 budget, so scrollHeight is the content and assertBudget can fail
      await page.goto(`/#me/${g}`)
      await setScheme(page, scheme)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.locator('.sh-top')).toHaveCount(0) // the group draws its own header, no avatar bar
      await assertBudget(page, 700)
      await page.setViewportSize({ width: 390, height: 844 })
      await assertJackClear(page)
      await shot(page, `settings-${g}`, scheme)
      await page.getByRole('link', { name: 'Back to Settings' }).click()
      await expect(page).toHaveURL(/#me$/)
    })
  }

  test(`Display: the Theme choice sheet is a radiogroup and Back closes it (${scheme})`, async ({ page }) => {
    await member(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#me/display')
    await setScheme(page, scheme)
    await page.getByRole('button', { name: /Theme/ }).click()
    const group = page.getByRole('radiogroup', { name: 'Theme' })
    await expect(group.getByRole('radio')).toHaveCount(3)
    await expect(group.getByRole('radio', { name: 'System default' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('dialog', { name: 'Theme' }).getByRole('button', { name: 'Cancel' })).toBeInViewport() // the sheet has finished sliding in
    await shot(page, 'settings-display-sheet', scheme)
    await page.goBack()
    await expect(group).toHaveCount(0)
    await expect(page).toHaveURL(/#me\/display$/)
    await page.getByRole('button', { name: /Theme/ }).click()
    await group.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
}

test('no button wraps at 360 on the overview or any group', async ({ page }) => {
  await admin(page)
  await page.setViewportSize({ width: 360, height: 800 })
  for (const h of ['#me', ...GROUPS.map(([g]) => `#me/${g}`)]) {
    await page.goto(`/${h}`)
    await expect(page.locator('.sh-me')).toBeVisible()
    await assertNoWrappedButtons(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sideways scroll on ${h}`).toBe(true)
  }
})

test('Family phones is a route of the Phone group: one Back, and the hardware Back returns to Phone', async ({ page }) => {
  await admin(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#me/phone')
  await page.getByRole('link', { name: /Family phones/ }).click()
  await expect(page).toHaveURL(/#me\/phone\/phones$/)
  await expect(page.getByRole('heading', { name: 'Family phones' })).toBeVisible()
  await expect(page.locator('.st-group').getByRole('button', { name: /^Family$/ })).toHaveCount(0) // FamilyPhones' own Back is hidden here
  await page.goBack()
  await expect(page).toHaveURL(/#me\/phone$/)
})

test('a member sees no admin rows', async ({ page }) => {
  await member(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#me/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  await expect(page.getByText('Family admin tools')).toHaveCount(0)
})

test('the top bar greeting wraps and never ends in an ellipsis (Today)', async ({ page }) => {
  await member(page)
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/#today')
  const greet = page.locator('.sh-top-greet')
  await expect(greet).toContainText('Magdalena')
  const r = await greet.evaluate((el) => ({ clamp: getComputedStyle(el).webkitLineClamp, over: el.scrollHeight - el.clientHeight, size: getComputedStyle(el).fontSize }))
  expect(r.clamp).toBe('none')
  expect(r.over).toBeLessThanOrEqual(1)
  expect(r.size).toBe('22px')
})
