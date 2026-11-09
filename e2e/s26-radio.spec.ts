import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertNoSideways, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S26 lane W3R: Live radio (board S26Listen). Shots only with S26_SHOTS=<dir>; nothing is written without it.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  // No stream leaves the test: play() "connects" after a moment, and fails for DZRH.
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.src.includes('dzrh')) return Promise.reject(new Error('blocked'))
      setTimeout(() => this.dispatchEvent(new Event('playing')), 150)
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.load = function () {}
  })
  await page.goto('/#discover/listen/radio')
  await expect(page.getByTestId('radio')).toBeVisible()
})

async function shot(page: import('@playwright/test').Page, name: string) {
  const dir = process.env.S26_SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: five cards, one plays at a time, error with retry, no sideways scroll`, async ({ page }) => {
    await setScheme(page, scheme)
    await expect(page.locator('li.rd-st')).toHaveCount(5)
    await page.getByRole('button', { name: 'Play Love Radio' }).click()
    await expect(page.getByTestId('radio-love')).toHaveAttribute('data-state', 'playing')
    await page.getByRole('button', { name: 'Play DZRH' }).click()
    await expect(page.getByTestId('radio-dzrh')).toHaveAttribute('data-state', 'error')
    await expect(page.getByTestId('radio-love')).toHaveAttribute('data-state', 'idle')
    await expect(page.getByText('Could not play. Check data or Wi-Fi.')).toBeVisible()
    await page.getByRole('button', { name: 'Play Easy Rock' }).click()
    await expect(page.getByTestId('radio-easyrock')).toHaveAttribute('data-state', 'playing')
    const small = await page.locator('.rd-play').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width < 44 || e.getBoundingClientRect().height < 44).length)
    expect(small).toBe(0)
    await assertNoSideways(page)
    await shot(page, `radio-${scheme}-390`)
  })
}

test('195 px: no sideways scroll while playing', async ({ page }) => {
  await page.setViewportSize({ width: 195, height: 700 })
  await page.getByRole('button', { name: 'Play Love Radio' }).click()
  await expect(page.getByTestId('radio-love')).toHaveAttribute('data-state', 'playing')
  await assertNoSideways(page)
  await shot(page, 'radio-light-195')
})

test('the Discover and Listen pages link to Live radio', async ({ page }) => {
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-radio-link')).toBeVisible()
  await page.goto('/#discover/listen')
  await expect(page.getByTestId('listen-radio-link')).toBeVisible()
})
