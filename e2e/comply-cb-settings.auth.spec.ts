import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { assertNoSideways, assertTargets, assertTextContrast, setScheme } from './v13'
import { admin, member } from './fixtures/s16/settings'
import { adminWriter, mockActing } from './fixtures/s16/acting'
import { shotPath } from './shotPath'

// Lane CB: Settings built to docs/redesign-2026-10-31/mockup/Settings.dc.html. Light and dark, 390 and 360, invented people only.
declare const process: { env: Record<string, string | undefined> }
const DIR = shotPath('docs/redesign-2026-10-31/shots/comply-CB')
mkdirSync(DIR, { recursive: true })

/** The whole scroller at the current width (the app scrolls inside .bt .scroll). */
async function full(page: Page, name: string) {
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
  const w = page.viewportSize()!.width
  await page.setViewportSize({ width: w, height: Math.min(h + 140, 5000) })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled' })
  await page.setViewportSize({ width: w, height: 844 })
}

const rowBoxes = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => {
  const r = e.getBoundingClientRect()
  const chip = e.querySelector('.rw-ic')?.getBoundingClientRect()
  const b = e.querySelector('b')
  return { h: Math.round(r.height), chip: chip ? Math.round(chip.width) : 0, title: b ? parseFloat(getComputedStyle(b).fontSize) : 0 }
}))

for (const scheme of ['light', 'dark'] as const) {
  for (const w of [390, 360]) {
    test(`Settings root matches the board (${scheme} ${w})`, async ({ page }) => {
      await admin(page)
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto('/#me')
      await setScheme(page, scheme)
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByText('Family admin tools')).toBeVisible()
      const rows = await rowBoxes(page, '[data-testid="settings-list"] > .st-row')
      expect(rows.length).toBe(8) // admin: Family admin tools, Alerts, Display, Family, Phone, Privacy, Sign-in, About (View as is a look/Row)
      for (const r of rows) { expect(r.h).toBeGreaterThanOrEqual(56); expect(r.chip).toBe(32); expect(r.title).toBe(17) } // board: 56 px rows, 32 px chip, 17 px title
      const radius = await page.locator('[data-testid="settings-list"]').evaluate((e) => getComputedStyle(e).borderRadius)
      expect(radius).toBe('16px') // board .grp
      const tints = await page.locator('[data-testid="settings-list"] .rw-ic').evaluateAll((els) => new Set(els.map((e) => getComputedStyle(e).backgroundColor)).size)
      expect(tints).toBeGreaterThanOrEqual(5) // each row has its own tint, as the board
      const chev = await page.evaluate(() => ['[data-testid="viewas-row"] .rw-main > svg:last-child', '.sh-navrow > svg:last-child'].map((s) => document.querySelector(s) ? getComputedStyle(document.querySelector(s)!).color : 'missing'))
      expect(chev[0]).not.toBe('missing') // View as shows a chevron like the other rows
      expect(chev[0]).toBe(chev[1]) // and it is the same muted colour
      await assertTargets(page); await assertTextContrast(page); await assertNoSideways(page)
      await full(page, `settings-root-${scheme}-${w}`)
    })
    test(`Alerts and reminders matches the board (${scheme} ${w})`, async ({ page }) => {
      await admin(page)
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto('/#me/alerts')
      await setScheme(page, scheme)
      await expect(page.getByRole('heading', { name: 'Alerts and reminders', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'This phone' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'For carers' })).toBeVisible() // the fixture makes this person a carer
      const later = page.getByTestId('world-alerts-later')
      await expect(later).toBeVisible()
      await expect(later.locator('.st-later')).toHaveCount(4)
      await expect(later.getByRole('switch')).toHaveCount(0) // Later rows carry no control: nothing pretends to work
      await expect(later.getByText('Later', { exact: true })).toHaveCount(4)
      await assertTargets(page); await assertTextContrast(page); await assertNoSideways(page)
      await full(page, `settings-alerts-${scheme}-${w}`)
    })
  }

  test(`Settings view only while acting (${scheme})`, async ({ page }) => {
    await mockActing(page, adminWriter)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#me')
    await setScheme(page, scheme)
    await page.getByTestId('viewas-row').click()
    await page.getByRole('dialog').getByRole('button', { name: /Mama/ }).first().click()
    await expect(page.getByText(/Viewing as Mama/).first()).toBeVisible()
    await page.goto('/#me')
    await expect(page.getByRole('button', { name: 'Edit name and photo, view only' })).toBeVisible()
    const locked = await page.locator('[data-testid="settings-list"] [aria-disabled="true"] b').allTextContents()
    expect(locked).toEqual(['Family and sharing', 'Privacy', 'Sign-in'])
    await assertTargets(page); await assertTextContrast(page)
    await full(page, `settings-viewonly-${scheme}-390`)
  })
}

test('About rows (raw children of the list) keep 56 px and 17 px titles', async ({ page }) => {
  await member(page)
  await page.goto('/#me/about')
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible()
  const kids = await page.locator('.sh-card.st-list > *').evaluateAll((els) => els.map((e) => ({ h: Math.round(e.getBoundingClientRect().height), t: e.querySelector('b') ? getComputedStyle(e.querySelector('b')!).fontSize : '17px' })))
  expect(kids.length).toBeGreaterThan(0)
  for (const k of kids) { expect(k.h).toBeGreaterThanOrEqual(56); expect(k.t).toBe('17px') }
})

test('member sees no admin rows', async ({ page }) => {
  await member(page)
  await page.goto('/#me')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Family admin tools')).toHaveCount(0)
  await expect(page.getByTestId('viewas-row')).toHaveCount(0)
})
