import { expect, test } from '@playwright/test'

const TABS = ['today', 'health', 'records', 'family', 'safety']
const SIZES = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 }
]

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size })
    for (const tab of TABS) {
      test(`${tab}: no sideways scroll`, async ({ page }) => {
        await page.goto(`/#${tab}`)
        await expect(page.locator('h1')).toBeVisible()
        const bad = await page.evaluate(() => {
          const out: string[] = []
          const root = document.scrollingElement as Element
          if (root.scrollWidth > root.clientWidth) out.push('document')
          for (const el of Array.from(document.querySelectorAll('*'))) {
            const cs = getComputedStyle(el)
            if (/(auto|scroll)/.test(cs.overflowY) && el.scrollWidth > el.clientWidth) {
              out.push(`${el.tagName.toLowerCase()}.${el.className}`)
            }
          }
          return out
        })
        expect(bad).toEqual([])
      })
    }
  })
}
