import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openFamily } from './fixtures/v13/family'
import { assertJackClear, assertNoSideways, assertTargets, setScheme } from './v13'
import { shotPath } from './shotPath'

// Lane CT (comply round): Family against board Family. Invented people only. Shots in shots/comply-CT with DOC_SHOTS=1.
const SHOTS = shotPath('docs/redesign-2026-10-31/shots/comply-CT')

async function shoot(page: Page, name: string) {
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement | null; if (s) s.scrollTop = 0 })
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h + 20, 844), 4500) })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  await page.setViewportSize(vp)
}

for (const scheme of ['light', 'dark'] as const) {
  for (const w of [390, 360] as const) {
    test(`Family ${scheme} ${w}: shot, Activity card has no dead space, Jack clear`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await skipOnboarding(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openFamily(page)
      await setScheme(page, scheme)
      const chart = page.getByTestId('week-chart')
      await expect(chart).toBeVisible()
      // the card ends right after its last line: the gap under the last child is the card padding (<= 16 px), not a fixed 460 px minimum
      const gap = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="activity"] .ac')!.getBoundingClientRect()
        const last = Array.from(document.querySelectorAll('[data-testid="activity"] .ac > *')).pop()!.getBoundingClientRect()
        return card.bottom - last.bottom
      })
      console.log('ACGAP', scheme, w, gap)
      await shoot(page, `family-${scheme}-${w}`)
      expect(gap, 'dead space under the Activity card content').toBeLessThanOrEqual(16)
      await assertNoSideways(page)
      await assertTargets(page)
      await assertJackClear(page)
    })
  }
}
