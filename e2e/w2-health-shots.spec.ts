import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// W2-HEALTH: the nudge card in its empty, partial and all-done states, light and dark, 390x844 and 360 wide. Synthetic data only.
const SHOTS = shotPath('docs/session-9/shots/w2-health')

const seed = (page: Page, mode: 'empty' | 'some' | 'done') =>
  page.evaluate(async ([nowMs, mode]) => {
    const d = (n: number) => new Date(nowMs - n * 86_400_000).toISOString()
    const open = (name: string) => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const put = async (name: string, rows: Record<string, unknown[]>) => {
      const db = await open(name)
      const tx = db.transaction(Object.keys(rows), 'readwrite')
      for (const [store, list] of Object.entries(rows)) for (const row of list) tx.objectStore(store).put(row)
      await new Promise((r) => (tx.oncomplete = r))
      db.close()
    }
    const r = (test: string, value: number, unit: string, ago: number) => ({ personId: 'p1', takenAt: d(ago), test, value, unit })
    const days = mode === 'done' ? [0.1, 1, 2, 3] : mode === 'some' ? [0.1, 1] : []
    await put('bantay-health', {
      people: [{ id: 'p1', name: 'Maria Sample' }],
      readings: days.flatMap((n) => [r('bp_systolic', 124, 'mmHg', n), r('bp_diastolic', 79, 'mmHg', n)])
    })
  }, [Date.now(), mode] as const)

for (const [w, h] of [[390, 844], [360, 780]] as const) {
  for (const mode of ['empty', 'some', 'done'] as const) {
    test(`nudge ${mode} ${w}`, async ({ page }) => {
      await skipOnboarding(page)
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/#health')
      await expect(page.locator('h1')).toHaveText('Health')
      await seed(page, mode)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto('/#health')
        await page.reload()
        await expect(page.getByTestId('nudge')).toBeVisible()
        await expect(page.getByTestId('nudge')).not.toContainText(/\b0\b/)
        if (mode === 'empty') await expect(page.getByTestId('nudge')).toContainText('Not yet this week')
        if (mode === 'done') await expect(page.getByTestId('nudge')).toContainText('Done this week')
        await page.screenshot({ path: `${SHOTS}/health-nudge-${mode}-${w}-${scheme}.png` })
      }
    })
  }
}
