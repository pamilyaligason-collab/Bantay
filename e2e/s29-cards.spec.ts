import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackClear, expectJackAtRest, layoutStable } from './v13'

// S29 lane A (D-184): cards run the full width (no Jack gutter on grids), Jack hides while scrolling down, and no control has its centre point under him at rest and at the end.
// Shots only when S29_SHOTS=<dir>. Runs in the chromium project (no sign-in).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S29_SHOTS
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 780 }]
const SCREENS: [string, string][] = [['Today', '#today'], ['Health', '#health'], ['Family', '#family'], ['Discover', '#discover'], ['Discover Play', '#discover/play'], ['Discover Listen', '#discover/listen'], ['Safety', '#safety']]
const GRIDS = '.tk-grid, .hb-grid, .fm-tiles, .pt-grid, .dc-rgrid, .dc-lgrid'

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size })
    test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

    for (const [name, hash] of SCREENS) {
      test(`${name}: centre point clear of Jack at rest and at the end; grids equal columns and equal gutters`, async ({ page }) => {
        await page.goto(`/${hash}`)
        await expect(page.locator('.bt .scroll')).toBeVisible()
        await expect(page.getByTestId('jack')).toBeVisible()
        await assertJackClear(page)
        await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0 })
        const bad = await page.evaluate((sel) => {
          const out: string[] = []
          const v = (document.querySelector('.bt .scroll') as HTMLElement).getBoundingClientRect()
          for (const g of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
            const kids = Array.from(g.children).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
            if (kids.length < 2) continue
            const label = (g.getAttribute('data-testid') || g.className).toString().slice(0, 30)
            const minL = Math.min(...kids.map((r) => r.left)), maxR = Math.max(...kids.map((r) => r.right))
            const gl = minL - v.left, gr = v.right - maxR
            if (Math.abs(gl - gr) > 1.5) out.push(`${label}: gutters ${gl.toFixed(1)} left vs ${gr.toFixed(1)} right`)
            const cols = kids.filter((r) => r.width < (maxR - minL) * 0.9) // a card that spans the row is not a column
            if (cols.length > 1) {
              const w = cols.map((r) => r.width)
              if (Math.max(...w) - Math.min(...w) > 1.5) out.push(`${label}: unequal columns ${w.map((x) => x.toFixed(1)).join('/')}`)
            }
          }
          return out
        }, GRIDS)
        expect(bad, 'lopsided grids').toEqual([])
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-')}-${size.width}x${size.height}.png`, animations: 'disabled' })
      })
    }

    test('Discover: Top stories See all keeps its centre clear of Jack at rest and at the end (rule A margin)', async ({ page }) => {
      await page.goto('/#discover')
      await expect(page.getByTestId('dc-top-story')).toBeVisible()
      await expect(page.locator('[data-testid="dc-top-story"] > .sec-h a')).toBeVisible()
      await layoutStable(page)
      for (const at of ['rest', 'end'] as const) {
        await page.evaluate((to) => { const s = document.querySelector('.bt .scroll') as HTMLElement; s.scrollTop = to === 'rest' ? 0 : s.scrollHeight }, at)
        await expectJackAtRest(page, `top stories ${at}`)
        const m = await page.evaluate(() => {
          const a = document.querySelector('[data-testid="dc-top-story"] > .sec-h a')!.getBoundingClientRect()
          const f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
          const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2
          return { under: cx >= f.left && cx <= f.right && cy >= f.top && cy <= f.bottom, right: a.right, jackLeft: f.left }
        })
        expect(m.under, `See all centre under Jack ${at}`).toBe(false)
        expect(m.right, `See all right edge left of Jack ${at}`).toBeLessThanOrEqual(m.jackLeft + 1)
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/Discover-topstories-${size.width}x${size.height}.png`, animations: 'disabled' })
    })

    test('Jack slides out on scroll down, returns on scroll up and 600 ms after the scroll stops', async ({ page }) => {
      await page.goto('/#today')
      const jack = page.getByTestId('jack')
      await expect(jack).toBeVisible()
      const scroll = page.locator('.bt .scroll')
      await expect(jack).not.toHaveAttribute('data-away', /.*/) // at the top: visible
      await scroll.evaluate((el) => { el.scrollTop = 400 })
      await expect(jack).toHaveAttribute('data-away', 'true')
      await expect(jack).not.toHaveAttribute('data-away', /.*/, { timeout: 2000 }) // back after the scroll stops
      await scroll.evaluate((el) => { el.scrollTop = 900 })
      await expect(jack).toHaveAttribute('data-away', 'true')
      await scroll.evaluate((el) => { el.scrollTop = 700 }) // up
      await expect(jack).not.toHaveAttribute('data-away', /.*/)
    })
  })
}
