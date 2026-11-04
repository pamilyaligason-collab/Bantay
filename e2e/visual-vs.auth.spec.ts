import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openFamily } from './fixtures/v13/family'
import { admin } from './fixtures/s16/settings'
import { assertJackClear, assertNoSideways, assertTargets, assertTextContrast, setScheme } from './v13'
import { shotPath } from './shotPath'

// Lane VS, auth build: Family and Me/Settings full-page shots and the measured assertions for the Family `wrong` items. Invented people only.
const SHOTS = shotPath('docs/redesign-2026-10-31/shots/visual-VS')

async function shoot(page: Page, name: string) {
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement | null; if (s) s.scrollTop = 0 })
  await page.screenshot({ path: `${SHOTS}/${name}-top.png` })
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h + 20, 844), 4500) })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  await page.setViewportSize(vp)
}

const contrast = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => {
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  const rgb = (s: string) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0]!, d[1]!, d[2]!, d[3]! / 255] }
  const lum = ([r, g, b]: number[]) => { const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!) }
  let bg = [255, 255, 255]
  for (let n: Element | null = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.95) { bg = c; break } }
  const a = lum(rgb(getComputedStyle(e).color)); const b = lum(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test(`Family ${scheme}: Mark taken is the primary button, chart labels are clear of Jack`, async ({ page }) => {
      await skipOnboarding(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openFamily(page)
      await setScheme(page, scheme)
      const mark = page.locator('.pc-primary').first()
      await expect(mark).toBeVisible()
      // the same look as the app's .btn primary: its background and text colours
      const same = await page.evaluate(() => {
        const b = document.createElement('button'); b.className = 'btn'; document.body.appendChild(b)
        const ref = getComputedStyle(b); const out = [ref.backgroundColor, ref.color]; b.remove()
        const m = getComputedStyle(document.querySelector('.pc-primary')!)
        return { ref: out, mark: [m.backgroundColor, m.color] }
      })
      expect(same.mark, `Mark taken ${scheme} matches .btn`).toEqual(same.ref)
      expect(await contrast(page, '.pc-primary')).toBeGreaterThanOrEqual(4.5)
      await shoot(page, `family-${scheme}`)
      await assertNoSideways(page)
      await assertTargets(page)
      // the Activity chart's day labels: none sits inside Jack's box at rest
      const hits = await page.evaluate(() => {
        const sc = document.querySelector('.bt .scroll') as HTMLElement; sc.scrollTop = 0
        const fab = document.querySelector('.sh-jackfab'); if (!fab) return []
        const f = fab.getBoundingClientRect()
        return Array.from(document.querySelectorAll('[data-testid="week-chart"] text')).filter((t) => { const r = t.getBoundingClientRect(); return r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top }).map((t) => t.textContent)
      })
      expect(hits, 'chart labels under Jack at rest').toEqual([])
    })

    test(`Me / Settings ${scheme}: shots, targets, contrast`, async ({ page }) => {
      await admin(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto('/#me')
      await setScheme(page, scheme)
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await shoot(page, `me-${scheme}`)
      await assertTargets(page); await assertTextContrast(page); await assertJackClear(page)
      for (const g of ['alerts', 'display', 'family', 'phone', 'signin', 'about']) {
        await page.goto(`/#me/${g}`)
        await setScheme(page, scheme)
        await page.waitForTimeout(300)
        await shoot(page, `me-${g}-${scheme}`)
      }
    })
  })
}
