import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 13 lane D: Discover. Behaviour checks always run; shots (390x844, light and dark) are written only when S13_SHOTS=1 (ML-32).
// The clock is frozen, so the pick and the season are the same on every run.
test.use({ viewport: { width: 390, height: 844 } })
const SHOTS = 'docs/session-13/shots/D'
const UNDAS = new Date(2026, 9, 28, 10, 20, 0) // 28 Oct: Undas window
const HEAT = new Date(2026, 3, 20, 10, 20, 0) // 20 Apr: hot season

/** Scroll `anchor` to the top of the window, let every transition finish, then take two equal frames in a row. */
async function shot(page: Page, name: string, scheme: string, anchor?: string) {
  if (process.env.S13_SHOTS !== '1') return
  if (anchor) await page.locator(anchor).first().evaluate((el) => { (el as HTMLElement).style.scrollMarginTop = '84px'; el.scrollIntoView({ block: 'start' }) })
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const take = () => page.screenshot({ animations: 'disabled', caret: 'hide' })
  let prev = await take()
  for (let i = 0; i < 20; i++) { const next = await take(); if (next.equals(prev)) break; prev = next }
  mkdirSync(SHOTS, { recursive: true })
  writeFileSync(`${SHOTS}/${name}-${scheme}.png`, prev)
}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  // A voice that starts and never ends, so "playing" stays on screen.
  await page.addInitScript(() => {
    const w = window as unknown as { __said: string[] }
    w.__said = []
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u: { text: string }) => { w.__said.push(u.text) }, cancel: () => undefined } })
  })
})

test('sub-nav: one pill, moved by transform, none under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/#discover/learn')
  const pill = page.locator('.dc-pill')
  await expect(pill).toHaveCount(1)
  const x0 = (await pill.boundingBox())!.x
  await page.getByRole('group', { name: 'Discover sections' }).getByRole('button', { name: 'Play' }).click()
  await expect.poll(async () => (await pill.boundingBox())!.x).toBeGreaterThan(x0 + 100)
  expect(await pill.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('transform')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await pill.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
})

test('Learn: 2x2 tiles plus Your benefits, benefits open outside', async ({ page }) => {
  await page.goto('/#discover/learn')
  await expect(page.getByTestId('learn-home')).toBeVisible()
  await expect(page.getByTestId('pick')).toHaveCount(0)
  for (const k of ['recipes', 'library', 'together', 'benefits']) await expect(page.getByTestId('learn-' + k)).toBeVisible()
  await page.getByTestId('learn-benefits').click()
  await expect(page.getByRole('heading', { name: 'Your benefits' })).toBeVisible()
  await expect(page.getByRole('link', { name: /PhilHealth Konsulta/ })).toHaveAttribute('href', /philhealth\.gov\.ph/)
  await expect(page.getByRole('link', { name: /Senior citizen discount/ })).toHaveAttribute('target', '_blank')
  await page.goto('/#discover/learn')
  await page.getByTestId('learn-recipes').click()
  await expect(page.getByTestId('pick')).toHaveCount(0)
})

test('Today pick (trivia on 28 Oct) opens the same question Play asks, and back lands on the Play hub', async ({ page }) => {
  await page.clock.setFixedTime(UNDAS)
  await page.goto('/#discover')
  const q = 'The first jeepneys were made from old what?' // hand-computed: trivia #16 for 2026-10-28
  await expect(page.getByTestId('pick')).toContainText(q)
  await page.getByTestId('pick').click()
  await expect(page.getByTestId('trivia')).toContainText(q)
  await page.getByRole('button', { name: 'Back to Play' }).click()
  await expect(page.getByTestId('play-hub')).toBeVisible()
  await page.getByRole('button', { name: /Alam mo ba/ }).click()
  await expect(page.getByTestId('trivia')).toContainText(q)
})

test('the season is one row on the overview that opens the season page', async ({ page }) => {
  await page.clock.setFixedTime(UNDAS)
  await page.goto('/#discover')
  await expect(page.getByTestId('season-row')).toContainText('Undas')
  await page.getByTestId('season-row').getByRole('link').click()
  await expect(page.getByTestId('season')).toContainText('Undas')
  await expect(page.getByTestId('season')).toContainText('Source:')
  await page.goto('/#discover/watch')
  await expect(page.getByTestId('season-row')).toHaveCount(0)
})

test('Listen: one at a time, and leaving the sub stops the voice', async ({ page }) => {
  await page.goto('/#discover/listen')
  const plays = page.getByRole('button', { name: /^Play / })
  await expect(plays).toHaveCount(20)
  await plays.nth(0).click()
  await expect(page.getByRole('button', { name: /^Stop / })).toHaveCount(1)
  await page.getByRole('button', { name: /^Play / }).nth(0).click()
  await expect(page.getByRole('button', { name: /^Stop / })).toHaveCount(1)
  expect(await page.evaluate(() => (window as unknown as { __said: string[] }).__said.length)).toBe(2)
  await page.getByRole('group', { name: 'Discover sections' }).getByRole('button', { name: 'Watch' }).click()
  await expect(page.getByTestId('watch')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Stop / })).toHaveCount(0)
})

test('Watch: posters scroll inside their row, a poster picks a video, nothing is embedded before the tap', async ({ page }) => {
  await page.goto('/#discover/watch')
  await expect(page.getByTestId('watch')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Choose / })).toHaveCount(12)
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByTestId('live-tv')).toContainText('Coming soon')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: /^Choose Hands-only CPR/ }).click()
  await expect(page.getByRole('link', { name: /Open in YouTube/ })).toHaveAttribute('href', /youtube\.com\/watch\?v=M4ACYp75mjU/)
  await expect(page.locator('iframe')).toHaveCount(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`shots ${scheme}`, () => {
    test.beforeEach(async ({ page }) => { await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' }) })
    test('discover root, undas', async ({ page }) => {
      await page.clock.setFixedTime(UNDAS)
      await page.goto('/#discover')
      await expect(page.getByTestId('season-row')).toContainText('Undas')
      await shot(page, 'discover-undas', scheme)
    })
    test('discover root, hot season', async ({ page }) => {
      await page.clock.setFixedTime(HEAT)
      await page.goto('/#discover')
      await expect(page.getByTestId('season-row')).toContainText('Hot season')
      await shot(page, 'discover-heat', scheme)
    })
    test('learn shelves', async ({ page }) => {
      await page.clock.setFixedTime(UNDAS)
      await page.goto('/#discover/learn')
      await expect(page.getByTestId('learn-benefits')).toBeVisible()
      await shot(page, 'learn-shelves', scheme)
    })
    test('listen, one playing', async ({ page }) => {
      await page.clock.setFixedTime(UNDAS)
      await page.goto('/#discover/listen')
      await page.getByRole('button', { name: /^Play / }).nth(1).click()
      await expect(page.getByRole('button', { name: /^Stop / })).toHaveCount(1)
      await shot(page, 'listen', scheme)
    })
    test('watch', async ({ page }) => {
      await page.clock.setFixedTime(UNDAS)
      await page.goto('/#discover/watch')
      await expect(page.getByTestId('watch')).toBeVisible()
      await shot(page, 'watch', scheme)
    })
  })
}
