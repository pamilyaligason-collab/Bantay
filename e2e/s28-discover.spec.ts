import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { FIXED_CLOCKS, settled } from './v13'

// S28 fix round 1 (lane D): the "See all" links stay on the right of each section header, but clear of the floating Jack button.
// Each header link is scrolled level with Jack (the worst case) and its box must not meet his box; the point at its centre must hit the link itself.
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h })
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 }))
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-fact')).toBeVisible()
  await expect(page.getByTestId('dc-hero')).toBeVisible()
  await settled(page)
}

for (const [w, h] of [[360, 740], [412, 915]] as const) {
  test(`section links clear of Jack at ${w}x${h}`, async ({ page }) => {
    await open(page, w, h)
    const n = await page.locator('section.sec > .sec-h a').count()
    expect(n, 'section header links').toBeGreaterThanOrEqual(5)
    for (let i = 0; i < n; i++) {
      const m = await page.evaluate((k) => {
        const sc = document.querySelector('.bt .scroll') as HTMLElement
        const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
        const a = document.querySelectorAll<HTMLElement>('section.sec > .sec-h a')[k]!
        const r0 = a.getBoundingClientRect()
        sc.scrollTop += (r0.top + r0.bottom) / 2 - (fab.top + fab.bottom) / 2 // level with Jack
        const r = a.getBoundingClientRect()
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
        return { text: a.textContent, meets: r.left < fab.right && r.right > fab.left && r.top < fab.bottom && r.bottom > fab.top, gap: fab.left - r.right, h: r.height, hit: !!hit && a.contains(hit) }
      }, i)
      expect(m.meets, `"${m.text}" meets Jack (gap ${m.gap})`).toBe(false)
      expect(m.hit, `"${m.text}" centre is tappable`).toBe(true)
      expect(m.h, `"${m.text}" target height`).toBeGreaterThanOrEqual(43.5)
    }
  })
}
