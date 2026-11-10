import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackClear, expectJackAtRest, layoutStable } from './v13'

// S29 lane A (D-184): cards run the full width (no Jack gutter on grids), Jack hides while scrolling down, and no control has its centre point under him at rest and at the end.
// Shots only when S29_SHOTS=<dir>. Runs in the chromium project (no sign-in).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S29_SHOTS
const SIZES = [{ width: 390, height: 844, full: true }, { width: 360, height: 780, full: true }, { width: 360, height: 740, full: false }, { width: 390, height: 720, full: false }] // S29: every screen is gated at all four sizes; full: false skips only the Jack slide test
const SCREENS: [string, string][] = [['Today', '#today'], ['Health', '#health'], ['Family', '#family'], ['Discover', '#discover'], ['Discover Play', '#discover/play'], ['Discover Listen', '#discover/listen'], ['Safety', '#safety']]
const GRIDS = '.tk-grid, .hb-grid, .fm-tiles, .pt-grid, .dc-rgrid, .dc-lgrid'

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })
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

    test('Discover: Top stories "See all stories" row (S29 A8) is full width, 44 px+, and its centre is clear of Jack at rest and at the end', async ({ page }) => {
      await page.goto('/#discover')
      await expect(page.getByTestId('dc-top-story')).toBeVisible()
      await expect(page.locator('[data-testid="dc-top-story"] > .sec-h a')).toHaveCount(0) // no header link: nothing sits in Jack's corner
      await expect(page.getByTestId('dc-top-all')).toBeVisible()
      await layoutStable(page)
      // 'row': the row scrolled to the bottom edge of the view, in Jack's row, Jack back at rest (S29 TD round 2, ML-44); 'top': scrollTop 0; 'page end': the very end
      for (const at of ['row', 'top', 'page end'] as const) {
        await page.evaluate((to) => {
          const s = document.querySelector('.bt .scroll') as HTMLElement
          if (to === 'row') { const r = document.querySelector('[data-testid="dc-top-all"]')!; r.scrollIntoView({ block: 'end' }); const tabs = document.querySelector('.sh-tabs'); if (tabs) s.scrollTop += r.getBoundingClientRect().bottom - tabs.getBoundingClientRect().top } // the tab bar covers the scroll box's bottom edge: park the row just above it, in Jack's row
          else s.scrollTop = to === 'top' ? 0 : s.scrollHeight
        }, at)
        await expectJackAtRest(page, `top stories ${at}`)
        const m = await page.evaluate(() => {
          const a = document.querySelector('[data-testid="dc-top-all"]')!.getBoundingClientRect()
          const f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
          const sec = document.querySelector('[data-testid="dc-top-story"]')!.getBoundingClientRect()
          const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2
          const box = document.querySelector('.bt .scroll')!.getBoundingClientRect()
          const row = document.querySelector('[data-testid="dc-top-all"]')!
          const hit = document.elementFromPoint(cx, cy)
          return { under: cx >= f.left && cx <= f.right && cy >= f.top && cy <= f.bottom, height: a.height, fullWidth: Math.abs(a.width - sec.width) <= 1, onScreen: a.top >= Math.max(box.top, 0) - 1 && a.bottom <= Math.min(box.bottom, innerHeight, document.querySelector('.sh-tabs')?.getBoundingClientRect().top ?? innerHeight) + 1 && a.left >= 0 && a.right <= innerWidth, hitIsRow: !!hit && row.contains(hit), hitIsJack: !!hit && !!hit.closest(".sh-jackfab"), hitDesc: hit ? hit.tagName + "." + String(hit.className).slice(0, 40) + " in " + (hit.parentElement?.className ?? "") : "none" }
        })
        if (at === 'row') expect(m.onScreen, `See all stories is inside the viewport ${at} (a row scrolled off screen proves nothing)`).toBe(true)
        if (m.onScreen) { // the hit target at the row's centre is the row, not Jack (ML-44)
          expect(m.hitIsJack, `Jack is the hit target at the row centre ${at}`).toBe(false)
          expect(m.hitIsRow, `the row is the hit target at its centre ${at}: ${m.hitDesc}`).toBe(true)
        }
        expect(m.under, `See all stories centre under Jack ${at}`).toBe(false)
        expect(m.height, 'target height').toBeGreaterThanOrEqual(44)
        expect(m.fullWidth, 'spans the section').toBe(true)
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/Discover-topstories-${size.width}x${size.height}.png`, animations: 'disabled' })
    })

    if (size.full) test('Jack slides out on scroll down, returns on scroll up and 600 ms after the scroll stops', async ({ page }) => {
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
