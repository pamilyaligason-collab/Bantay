import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { seed } from './fixtures/s16/health'
import { skipOnboarding } from './helpers'

// S26 P3B: Sleep and Activity detail, Year view, Family today. Synthetic data only. Shots go to SHOTS_DIR (outside the repo when set).
const SHOTS = process.env.SHOTS_DIR ?? 'test-results/s26-p3b'
const at = (daysAgo: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString() }

test('sleep and activity detail, light + dark, 390 and 195 wide', async ({ page }) => {
  test.setTimeout(180_000)
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#health')
  await expect(page.locator('h1')).toHaveText('Health')
  await seed(page, 'bantay-health', { people: [{ id: 'p1', name: 'Ana Sample' }, { id: 'p2', name: 'Jun Sample' }] })
  await seed(page, 'bantay', { profiles: [{ id: 'p1', photoPath: null, phone: null, birthdate: `${new Date().getFullYear() - 60}-03-05`, bloodType: null, allergies: [], conditions: [], medicines: [], updatedAt: null }] })
  await page.reload()
  await expect(page.locator('h1')).toHaveText('Health')
  const act: Record<string, unknown>[] = []
  for (let i = 0; i < 40; i++) {
    // the manual path is shaped like QuickLog: logged on the morning after, so startedAt is the log time and carries no bed time
    if (i > 0) act.push({ personId: 'p1', kind: 'sleep', minutes: 300 + ((i * 37) % 200), steps: null, startedAt: at(i, 7, 30), source: 'manual' })
    act.push({ personId: 'p1', kind: 'steps', minutes: null, steps: 2000 + ((i * 911) % 7000), startedAt: at(i, 9), source: 'manual' })
  }
  act.push({ personId: 'p1', kind: 'sleep', minutes: 310, steps: null, startedAt: at(1, 23, 10), source: 'health-connect' }) // last night from a watch: a real start
  act.push({ personId: 'p1', kind: 'sleep', minutes: 45, steps: null, startedAt: at(0, 14), source: 'health-connect' })
  act.push({ personId: 'p2', kind: 'steps', minutes: null, steps: 5400, startedAt: at(0, 8), source: 'manual' })
  await seed(page, 'bantay-log', { activity: act })
  for (const [w, h] of [[390, 844], [195, 844]] as const) {
    await page.setViewportSize({ width: w, height: h })
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/#health/metric/sleep')
      await page.reload()
      const hero = page.getByTestId('sleep-hero')
      await expect(hero).toContainText('Went to sleep')
      await expect(page.getByTestId('sleep-sentence')).toContainText('hours recommended for adults')
      await expect(page.getByText('Deep, light and REM sleep show only when your watch shares them')).toBeVisible()
      await expect(page.locator('rect.mc-band')).toHaveCount(1)
      await page.screenshot({ path: `${SHOTS}/sleep-week-${w}-${scheme}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Year' }).click()
      await expect(page.getByTestId('year-chart')).toBeVisible()
      await expect(page.locator('rect.mc-band')).toHaveCount(1)
      await page.screenshot({ path: `${SHOTS}/sleep-year-${w}-${scheme}.png`, fullPage: true })
      expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])

      await page.goto('/#health/metric/steps')
      await page.reload()
      await expect(page.getByTestId('activity-hero')).toContainText('Steps today')
      await expect(page.getByTestId('activity-compare')).toBeVisible()
      await expect(page.getByTestId('family-today').getByRole('rowheader')).toHaveText(['Ana Sample', 'Jun Sample'])
      await expect(page.getByTestId('family-today')).toContainText('5,400')
      await page.screenshot({ path: `${SHOTS}/activity-${w}-${scheme}.png`, fullPage: true })
      expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
    }
  }
})
