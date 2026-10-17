import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

test.use({ viewport: { width: 375, height: 812 } })

test('the button sits above the tab bar and the open sheet does not scroll sideways', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  const fab = page.getByRole('button', { name: 'Ask Bantay' })
  const f = (await fab.boundingBox())!
  const t = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!
  expect(f.width).toBe(56)
  expect(f.y + f.height).toBeLessThanOrEqual(t.y)
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
