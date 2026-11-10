import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { FIXED_CLOCKS, settled } from './v13'

// S28 fix round 1 (lane D), S29 (D-184): the "See all" links stay on the right of each section header with no gutter. The box-overlap gate is replaced: while the page scrolls Jack is away (data-away),
// so a link scrolled level with him is still tappable at its centre point; at rest and at the end the centre-point gate is e2e/s29-cards.spec.ts.
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
    await expect(page.getByTestId('jack')).not.toHaveAttribute('data-away', /.*/) // at the top he is shown
    for (let i = 0; i < n; i++) {
      const m = await page.evaluate(async (k) => {
        const sc = document.querySelector('.bt .scroll') as HTMLElement
        const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
        const a = document.querySelectorAll<HTMLElement>('section.sec > .sec-h a')[k]!
        const r0 = a.getBoundingClientRect()
        sc.scrollTop += (r0.top + r0.bottom) / 2 - (fab.top + fab.bottom) / 2 // level with Jack
        for (let f = 0; f < 3; f++) await new Promise((res) => requestAnimationFrame(() => res(null))) // the scroll event hides him (pointer-events none)
        const r = a.getBoundingClientRect()
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
        return { text: a.textContent, h: r.height, hit: !!hit && a.contains(hit) }
      }, i)
      expect(m.hit, `"${m.text}" centre is tappable`).toBe(true)
      expect(m.h, `"${m.text}" target height`).toBeGreaterThanOrEqual(43.5)
    }
  })
}
