import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

test('v2 look: cream ground, frosted tab bar (D-71), system font stack', async ({ page }) => {
  await page.goto('/#today')
  await expect(page.locator('.sky')).toHaveAttribute('data-state', 'clear')
  await expect(page.locator('.bt')).toHaveCSS('background-color', 'rgb(245, 243, 239)')
  await expect(page.locator('.tabbar')).toHaveCSS('backdrop-filter', /blur\(20px\)/)
  await expect(page.locator('.card, .grp').first()).toHaveCSS('backdrop-filter', 'none') // content cards stay solid
  // v13 dropped the web fonts (Fraunces and Plus Jakarta Sans now live only in the admin desk): the app sets the platform system stack
  await expect(page.locator('body')).toHaveCSS('font-family', /^-apple-system, "SF Pro Text"/)
  expect(await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').length })).toBe(0)
})

test('shell frame: no top bar anywhere (S5), sub-page header is one row', async ({ page }) => {
  await page.goto('/#health') // v13 gaps S5: the old top bar is deleted; the title row carries the bell and avatar
  await expect(page.locator('h1.lt-title').first()).toBeVisible()
  await expect(page.locator('.topbar')).toHaveCount(0)
  await page.goto('/#safety/hazards')
  const h = page.locator('.lt')
  await expect(h).toBeVisible()
  expect((await h.locator('h1').boundingBox())!.height).toBeLessThan(80)
  await expect(h.locator('a').first()).toBeVisible() // back link and h1 share the .lt header (v13 stacks Back above the title)
})

test('reduced motion stops the sky animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#today')
  expect(await page.locator('.sky').evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('none')
})

test('tab title follows the tab', async ({ page }) => {
  await page.goto('/#health')
  await expect(page).toHaveTitle('Health - Family Bantay')
})

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 800 } })

  /** Real touch events via CDP, so the browser emits pointerType "touch". */
  async function swipe(page: Page, x0: number, x1: number, y = 300) {
    const cdp = await page.context().newCDPSession(page)
    const pt = (x: number) => [{ x, y, id: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0) })
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + ((x1 - x0) * i) / 6) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  test('touch swipe left moves to the next tab and focuses the heading', async ({ page }) => {
    await page.goto('/#today')
    await expect(page.locator('h1')).toBeVisible()
    await swipe(page, 300, 100)
    await expect(page).toHaveURL(/#health$/)
    await expect(page.locator('h1')).toBeFocused()
  })

  test('a swipe that starts at the screen edge is left to the OS', async ({ page }) => {
    await page.goto('/#today')
    await expect(page.locator('h1')).toBeVisible()
    await swipe(page, 10, 250)
    await expect(page).toHaveURL(/#today$/)
  })

  test('mouse drags do not change tab', async ({ page }) => {
    await page.goto('/#today')
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(100, 300, { steps: 6 })
    await page.mouse.up()
    await expect(page).toHaveURL(/#today$/)
  })
})
