import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openFamily } from './fixtures/v13/family'
import { setScheme, settled, shotsLightDark } from './v13'

// Gaps batch 1, lane G0: the checks that need a signed-in Family root (T12 and S5 on #family). Invented data only.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`#family ${scheme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    })

    test('carousel gutter: the first person card sits at x 16', async ({ page }) => {
      await openFamily(page)
      await setScheme(page, scheme)
      await settled(page)
      const lefts = () => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.carousel')).map((c) => ({ scroll: c.scrollLeft, left: (c.firstElementChild as HTMLElement).getBoundingClientRect().left })))
      expect((await lefts()).length, 'Family has a carousel').toBeGreaterThan(0)
      await expect.poll(async () => (await lefts()).every((l) => Math.abs(l.left - 16) <= 1), { message: 'first card left edge settles on 16' }).toBe(true)
      expect((await lefts()).map((l) => l.scroll)).toEqual((await lefts()).map(() => 0))
    })

    test('title row: no top bar, title top <= 70, bell and avatar 44 px, at 390 and 360', async ({ page }) => {
      await openFamily(page)
      await setScheme(page, scheme)
      for (const width of [390, 360]) {
        await page.setViewportSize({ width, height: 844 })
        await settled(page)
        const m = await page.evaluate(() => {
          const sc = document.querySelector('.bt .scroll') as HTMLElement
          const box = (id: string) => { const b = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect(); return b ? [Math.round(b.width), Math.round(b.height)] : null }
          return { top: document.querySelector('h1.lt-title')!.getBoundingClientRect().top - sc.getBoundingClientRect().top, bell: box('head-bell'), me: box('head-me'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
        })
        expect(m.top, `${width}: title top`).toBeLessThanOrEqual(70)
        expect(m.bell).toEqual([44, 44]); expect(m.me).toEqual([44, 44]); expect(m.over).toBeLessThanOrEqual(0)
      }
    })

    test('shot (only with V13_SHOTS=<dir>)', async ({ page }) => {
      await openFamily(page)
      await settled(page)
      await shotsLightDark(page, 'family') // writes both schemes; a rerun overwrites the same two files
    })
  })
}
