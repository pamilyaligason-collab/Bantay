import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertBudget, assertJackClear } from './s16'

// Self-test of the S16 helpers: they must FAIL on a bad page, otherwise every lane gate is vacuous.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

test('assertBudget measures the scroller: passes above the real height, fails below it', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('h1').first()).toBeVisible()
  const measure = () => page.evaluate(() => { const el = document.querySelector('.bt .scroll') as HTMLElement; return el.scrollHeight - (parseFloat(getComputedStyle(el, '::after').height) || 0) })
  let h = 0
  await expect.poll(async () => { const n = await measure(); const same = n === h; h = n; return same }, { timeout: 10_000 }).toBe(true) // the page has stopped growing
  await assertBudget(page, h)
  await expect(assertBudget(page, h - 1)).rejects.toThrow(/over the/)
  await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '2000px'; document.querySelector('.bt .scroll')!.prepend(d) })
  await expect(assertBudget(page, h + 1000)).rejects.toThrow(/over the/)
})

test('assertJackClear passes on #today and fails when a control sits under the Jack button', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-jackfab')).toBeVisible()
  await assertJackClear(page)
  await page.evaluate(() => {
    const f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
    const b = document.createElement('button')
    b.textContent = 'trap'
    b.style.cssText = `position:fixed;left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px;z-index:1`
    document.body.append(b)
  })
  await expect(assertJackClear(page)).rejects.toThrow(/Jack button/)
})
