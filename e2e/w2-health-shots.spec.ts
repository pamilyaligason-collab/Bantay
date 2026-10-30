import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'
import { seed } from './fixtures/s16/health'

// W2-HEALTH: the nudge card in its empty, partial and all-done states, light and dark, 390x844 and 360 wide. Synthetic data only.
const SHOTS = shotPath('docs/session-9/shots/w2-health')

const seedMode = (page: Page, mode: 'empty' | 'some' | 'done') => {
  const d = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  const r = (test: string, value: number, unit: string, ago: number) => ({ personId: 'p1', takenAt: d(ago), test, value, unit })
  const days = mode === 'done' ? [0.1, 1, 2, 3] : mode === 'some' ? [0.1, 1] : []
  return seed(page, 'bantay-health', {
    people: [{ id: 'p1', name: 'Maria Sample' }],
    readings: days.flatMap((n) => [r('bp_systolic', 124, 'mmHg', n), r('bp_diastolic', 79, 'mmHg', n)])
  })
}

for (const [w, h] of [[390, 844], [360, 780]] as const) {
  for (const mode of ['empty', 'some', 'done'] as const) {
    test(`nudge ${mode} ${w}`, async ({ page }) => {
      await skipOnboarding(page)
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/#health')
      await expect(page.locator('h1')).toHaveText('Health')
      await seedMode(page, mode)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto('/#health')
        await page.reload()
        if (mode === 'empty') {
          // v12: no readings means no nudge row; the one hero says so and shows no bare zero
          await expect(page.getByTestId('bodyhero')).toContainText('No readings yet')
          await expect(page.getByTestId('nudge')).toHaveCount(0)
          await expect(page.getByTestId('bodyhero')).not.toContainText(/(?<![\d/])0(?![\d/])/)
        } else {
          await expect(page.getByTestId('nudge')).toBeVisible()
          await expect(page.getByTestId('nudge')).not.toContainText(/(?<![\d/])0(?![\d/])/)
          // v12 headline is the next step; only the BP goal is met by this data, so the ring says 3/3 and the next goal is Meals
          if (mode === 'done') await expect(page.getByTestId('nudge')).toContainText('BP 3/3')
        }
        await page.screenshot({ path: `${SHOTS}/health-nudge-${mode}-${w}-${scheme}.png` })
      }
    })
  }
}
