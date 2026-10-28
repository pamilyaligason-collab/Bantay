import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 14 lane J: Jack Jack placements (D-91). Each screen draws one <img> with an alt attribute, at a fixed size, with no sideways scroll at 375 px
// and at 200% text. Shots are written only when S14_SHOTS=<dir> is set (ML-32), so a gate rerun leaves the tree clean.
const SHOTS = process.env.S14_SHOTS
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return
  await page.evaluate(() => document.fonts.ready)
  const take = () => page.screenshot({ animations: 'disabled', caret: 'hide' })
  let prev = await take()
  for (let i = 0; i < 20; i++) { const next = await take(); if (next.equals(prev)) break; prev = next }
  mkdirSync(SHOTS, { recursive: true })
  writeFileSync(`${SHOTS}/${name}.png`, prev)
}

test.use({ viewport: { width: 375, height: 812 } })

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.addInitScript(() => { // a web voice, so Listen shows its list; and a wake lock for cook mode
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: () => undefined, cancel: () => undefined } })
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ released: false, release: async () => undefined, addEventListener: () => undefined }) } })
  })
})

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** A Jack picture on the screen: loaded, a fixed width and height, and an alt attribute (empty when decorative). */
async function expectJack(page: Page, alt: string | null, size: number) {
  const img = page.locator('img.jack:not([aria-label="Ask Bantay"] img)')
  await expect(img).toHaveCount(1) // exactly one Jack per screen, of any width; the Ask button's head is chrome and has its own test
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true)
  expect(await img.getAttribute('width')).toBe(String(size))
  expect(await img.getAttribute('height')).toBe(String(size))
  if (alt === null) expect(await img.getAttribute('alt')).toBe('')
  else expect(await img.getAttribute('alt')).toBe(alt)
}

const PLACES: { name: string; hash: string; ready: string; alt: string | null; size: number }[] = [
  { name: 'reading', hash: '#discover/learn', ready: 'learn-home', alt: 'Jack Jack reading a book', size: 96 },
  { name: 'cooking-recipes', hash: '#discover/learn/recipes', ready: 'recipe-card', alt: 'Jack Jack in an apron beside a pot of soup', size: 96 },
  { name: 'listening', hash: '#discover/listen', ready: 'listen', alt: 'Jack Jack sitting with one paw raised, listening', size: 96 },
  { name: 'watching', hash: '#discover/watch', ready: 'watch', alt: 'Jack Jack watching a laptop', size: 96 },
  { name: 'playing', hash: '#discover/play', ready: 'play-hub', alt: 'Jack Jack playing with a ball', size: 96 },
  { name: 'walking', hash: '#health/move', ready: 'mv-page', alt: 'Jack Jack trotting in a harness on a leash', size: 96 },
]

for (const p of PLACES) {
  for (const zoom of [100, 200]) {
    test(`${p.name} at 375 px and ${zoom}% text: one Jack, an alt, no sideways scroll`, async ({ page }) => {
      await page.goto('/' + p.hash)
      await page.waitForFunction((hash) => location.hash === hash, p.hash)
      if (p.ready === 'mv-page') await expect(page.locator('.mv-page')).toBeVisible()
      else await expect(page.getByTestId(p.ready).first()).toBeVisible()
      if (zoom === 200) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await expectJack(page, p.alt, p.size)
      expect(await sideways(page)).toBe(0)
      if (zoom === 100) await shot(page, p.name)
    })
  }
}

test('cook mode shows a small decorative Jack in the top row', async ({ page }) => {
  await page.goto('/#discover/learn/recipes')
  await page.getByTestId('recipe-card').first().click()
  await page.getByRole('link', { name: /Cook mode/ }).click()
  const cook = page.getByTestId('cook')
  await expect(cook).toBeVisible()
  const img = cook.locator('img.jack')
  await expect(img).toHaveCount(1)
  expect(await img.getAttribute('alt')).toBe('')
  expect(await img.getAttribute('width')).toBe('48')
  expect(await sideways(page)).toBe(0)
})

test('the Ask button wears the Jack head, decorative, 48 px, still named Ask Bantay', async ({ page }) => {
  await page.goto('/#today')
  const fab = page.getByRole('button', { name: 'Ask Bantay' })
  await expect(fab).toBeVisible()
  const img = fab.locator('img')
  await expect(img).toHaveCount(1)
  expect(await img.getAttribute('alt')).toBe('')
  expect(await img.getAttribute('width')).toBe('48')
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true)
  expect(await sideways(page)).toBe(0)
  await shot(page, 'ask-button')
})

test('the offline band carries a small decorative Jack and keeps its words', async ({ page, context }) => {
  await page.goto('/#today')
  await context.setOffline(true)
  const bar = page.getByTestId('offline-bar')
  await expect(bar).toBeVisible()
  const img = bar.locator('img')
  await expect(img).toHaveCount(1)
  expect(await img.getAttribute('alt')).toBe('')
  expect(await img.getAttribute('width')).toBe('40')
  await expect(bar).toHaveText(/^Offline · showing (saved data|data from \d{1,2}:\d{2} (AM|PM)) · will sync$/)
  expect(await sideways(page)).toBe(0)
  await shot(page, 'offline')
  await context.setOffline(false)
})

