import { expect, test } from '@playwright/test'

test('sky renders behind content and cards are frosted', async ({ page }) => {
  await page.goto('/#today')
  await expect(page.locator('.sky')).toHaveAttribute('data-state', 'clear')
  await expect(page.locator('.tabs')).toHaveCSS('backdrop-filter', /blur\(20px\)/)
})

test('reduced motion stops the sky animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#today')
  expect(await page.locator('.sky').evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('none')
})

test('swiping left moves to the next tab', async ({ page }) => {
  await page.goto('/#today')
  const box = (await page.locator('main.scroll').boundingBox())!
  const y = box.y + 200
  await page.mouse.move(box.x + 300, y)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, y + 5, { steps: 6 })
  await page.mouse.up()
  await expect(page).toHaveURL(/#health$/)
})
