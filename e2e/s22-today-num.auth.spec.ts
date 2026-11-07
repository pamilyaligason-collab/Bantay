import { expect, test, type Page } from '@playwright/test'
import { assertJackClear, assertTextContrast, setScheme } from './v13'
import { NOW, seed, startToday } from './fixtures/s16/today'

declare const process: { env: Record<string, string | undefined> }

// S22 TODAY-NUM fix2: the dynamic fourth Your numbers tile (weight with a trend) looks like its siblings. Invented data only. Shots are taken before any assertion.
const SHOTS = process.env.TODAY_NUM_SHOTS ?? 'test-results/s22-today-num'
test.use({ timezoneId: 'Asia/Manila' })

const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const r = (test: string, value: number, unit: string, d: number) => ({ personId: 'me', takenAt: ago(d), test, value, unit })

async function open(page: Page, scheme: 'light' | 'dark', width: number) {
  await startToday(page, 'calm', { scheme })
  await seed(page, 'bantay-health', 'readings', [r('bp_systolic', 128, 'mmHg', 0.2), r('bp_diastolic', 82, 'mmHg', 0.2), r('fasting_glucose', 96, 'mg/dL', 1), ...[6, 5, 4, 3, 2, 1].map((d, i) => r('weight', 61 + [0.4, -0.2, 0.3, -0.5, 0.1, 0.6][i]!, 'kg', d))])
  await page.setViewportSize({ width, height: 844 })
  await page.reload()
  await setScheme(page, scheme)
  const numbers = page.getByTestId('numbers')
  await expect(numbers.locator('.pt')).toHaveCount(4)
  await numbers.scrollIntoViewIfNeeded()
  return numbers
}

for (const width of [360, 390]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Your numbers 4th tile at ${width}, ${scheme}: same size, type scale and padding as its siblings, trend inside, clear of the action`, async ({ page }) => {
      const numbers = await open(page, scheme, width)
      await numbers.screenshot({ path: `${SHOTS}/numbers-${width}-${scheme}.png`, animations: 'disabled' })
      await page.screenshot({ path: `${SHOTS}/page-${width}-${scheme}.png`, animations: 'disabled', mask: [page.locator('nav.tabbar')] })

      const m = await numbers.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>('.pt')).map((t) => {
        const q = (s: string) => t.querySelector<HTMLElement>(s)
        const box = t.getBoundingClientRect(); const cs = getComputedStyle(t)
        const font = (e: HTMLElement | null) => (e ? `${getComputedStyle(e).fontSize}/${getComputedStyle(e).fontWeight}` : null)
        const sp = q('.pt-spark')?.getBoundingClientRect(); const act = q('.pt-a')!.getBoundingClientRect(); const kr = (() => { const g = document.createRange(); g.selectNodeContents(q('.pt-k')!); return g.getBoundingClientRect() })(); const vt = q('.pt-v')!.getBoundingClientRect().top - box.top // kr: the label text, not its full-width box
        return { kicker: q('.pt-k')!.textContent, w: Math.round(box.width), h: Math.round(box.height), top: Math.round(box.top), pad: cs.padding, k: font(q('.pt-k')), v: font(q('.pt-v')), s: font(q('.pt-s')), a: font(q('.pt-a')), spark: sp ? { top: sp.top, bottom: sp.bottom, left: sp.left, right: sp.right, inlineStyle: q('.pt-spark')!.getAttribute('style') } : null, tile: { left: box.left, right: box.right, top: box.top }, actTop: act.top, kickerRight: kr.right, vt: Math.round(vt) }
      }))
      expect(m).toHaveLength(4)
      const extra = m[3]!
      for (const t of m.slice(0, 3)) {
        expect(extra.w, 'same width').toBe(t.w); expect(extra.pad, 'same padding').toBe(t.pad)
        expect(extra.k, 'label scale').toBe(t.k); expect(extra.s, 'sub scale').toBe(t.s); expect(extra.a, 'action scale').toBe(t.a)
      }
      expect(m[0]!.v).toBe('26px/700') // BP and Sugar carry data: the house value scale
      expect(m[1]!.v).toBe('26px/700')
      expect(extra.v, 'the tile with data matches the tiles with data').toBe(m[0]!.v)
      expect(extra.h, 'same row height as the tile beside it').toBe(m[2]!.h)
      expect(extra.top, 'row 2 shared with the lab tile').toBe(m[2]!.top)
      expect(extra.spark, 'trend sparkline drawn').not.toBeNull()
      expect(extra.spark!.inlineStyle, 'no inline style on the trend').toBeNull()
      const sp = extra.spark!
      expect(sp.left).toBeGreaterThanOrEqual(extra.tile.left); expect(sp.right).toBeLessThanOrEqual(extra.tile.right)
      expect(sp.top).toBeGreaterThanOrEqual(extra.tile.top)
      expect(extra.vt, 'value starts at the same height as in the tile beside it').toBe(m[2]!.vt)
      expect(extra.vt).toBe(m[0]!.vt)
      expect(sp.bottom - extra.tile.top, 'trend inside the label row, above the value').toBeLessThanOrEqual(extra.vt)
      expect(extra.actTop - sp.bottom, 'trend clear of the action label').toBeGreaterThan(40)
      expect(sp.left, 'trend clear of the label text').toBeGreaterThan(extra.kickerRight)

      await assertTextContrast(page)
      await assertJackClear(page)
    })
  }
}
