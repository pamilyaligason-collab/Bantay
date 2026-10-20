import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

test.use({ viewport: { width: 375, height: 812 } })

test('the centre Ask tab is raised in the tab bar, there is no floating button, and the open sheet does not scroll sideways', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  const fab = page.getByRole('button', { name: 'Ask Bantay' })
  const f = (await fab.boundingBox())!
  expect(f.width).toBeGreaterThanOrEqual(44)
  expect(await page.locator('.as-fab').count()).toBe(0)
  expect(await page.getByRole('navigation', { name: 'Main' }).getByRole('button').count()).toBe(5)
  await fab.click()
  const bad = await page.evaluate(() => {
    const root = document.scrollingElement as Element
    const out = root.scrollWidth > root.clientWidth ? ['document'] : []
    for (const el of Array.from(document.querySelectorAll('[role=dialog] *')))
      if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) out.push(el.tagName)
    return out
  })
  expect(bad).toEqual([])
})

test('with the keyboard open the composer sits directly above it, and the caution line is the new one', async ({ page }) => {
  await skipOnboarding(page)
  // A fake visualViewport: the keyboard then covers the bottom 300px of the 812px screen.
  await page.addInitScript(() => {
    const vv = Object.assign(new EventTarget(), { height: 812, offsetTop: 0, width: 375, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    (window as unknown as { __kb: (h: number) => void }).__kb = (h) => { vv.height = h; vv.dispatchEvent(new Event('resize')) }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Ask Bantay' }).click()
  await expect(page.getByText('I can be wrong. Check with your doctor for medical decisions.')).toBeVisible()
  await expect(page.getByText(/mix things up/)).toHaveCount(0)
  await page.waitForTimeout(600) // the sheet slides in
  const form = page.locator('.as-form')
  const closed = (await form.boundingBox())!
  expect(812 - (closed.y + closed.height)).toBeLessThanOrEqual(40)
  await page.evaluate(() => (window as unknown as { __kb: (h: number) => void }).__kb(512))
  await page.waitForTimeout(300)
  const open = (await form.boundingBox())!
  const gap = 512 - (open.y + open.height)
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(16) // no dead band between the composer and the keyboard
})
