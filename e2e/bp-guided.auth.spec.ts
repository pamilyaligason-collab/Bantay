import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'

// Runs in the "auth" project (signed in as a made-up member with a mocked server; own person id is 'me').
// S9: the one BP table, the guided two-reading check and the crisis card. Made-up data only.
// Shots (390x844, light and dark) go to docs/session-10/shots/s9/<data-s>-<scheme>.png and are compared with the mockup sections health-vitals, health-bp, health-bpresult.
const SHOTS = 'docs/session-10/shots/s9'

const seed = (page: Page) =>
  page.evaluate(async (nowMs) => {
    const at = (h: number, daysAgo = 0) => { const d = new Date(nowMs - daysAgo * 86_400_000); d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0); return d.toISOString() }
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('bantay-health'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const tx = db.transaction(['readings'], 'readwrite')
    const rows: [number, number, number, number][] = [[8.7, 0, 134, 84], [8.08, 1, 138, 86], [7.83, 2, 126, 78], [8.08, 3, 118, 76], [21.17, 4, 142, 90]]
    for (const [h, ago, s, d] of rows) {
      tx.objectStore('readings').put({ personId: 'me', takenAt: at(h, ago), test: 'bp_systolic', value: s, unit: 'mmHg' })
      tx.objectStore('readings').put({ personId: 'me', takenAt: at(h, ago), test: 'bp_diastolic', value: d, unit: 'mmHg' })
    }
    await new Promise((r) => (tx.oncomplete = r))
    db.close()
  }, Date.now())

const axe = async (page: Page, scope: string) => (await new AxeBuilder({ page }).include(scope).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
// shots are rewritten only when SHOTS=1, so a plain gate run never dirties the committed PNGs
const shot = async (page: Page, name: string, scheme: string) => { if (process.env.SHOTS === '1') await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) }

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await mock(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#health')
  await expect(page.locator('h1')).toHaveText('Health')
  await expect(page.getByTestId('insight')).toBeVisible()
  await seed(page)
  await page.reload()
})

test('vitals page: Above target for 134/84, the five words, the Guided check button; no axe violations', async ({ page }) => {
  test.setTimeout(120_000)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#health/metric/bp_systolic')
    await page.reload()
    await expect(page.locator('.hv-latest')).toContainText('134/84')
    await expect(page.locator('.hv-latest .hv-state')).toContainText('Above target')
    await expect(page.getByTestId('recent').locator('.bc-lvl[data-level="high"]').first()).toContainText('High') // 138/86 and 142/90
    await expect(page.getByTestId('recent').locator('.bc-lvl[data-level="raised"]')).toContainText('A little raised') // 126/78
    await expect(page.getByTestId('recent').locator('.bc-lvl[data-level="in"]')).toContainText('In range') // 118/76
    await expect(page.getByRole('heading', { name: 'What the words mean' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guided check' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await shot(page, 'health-vitals', scheme)
    expect(await axe(page, 'main')).toEqual([])
  }
})

test('guided check: first reading, a minute of rest, second reading, average and 7-day number', async ({ page }) => {
  test.setTimeout(120_000)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#health/metric/bp_systolic')
    await page.reload()
    await page.getByRole('button', { name: 'Guided check' }).click()
    const dlg = page.getByRole('dialog', { name: 'Blood pressure' })
    await dlg.getByLabel('Top').fill('138')
    await dlg.getByLabel('Bottom').fill('86')
    await dlg.getByLabel('Pulse').fill('74')
    await dlg.getByRole('button', { name: 'Next' }).click()
    await expect(dlg.getByRole('timer')).toBeVisible()
    await shot(page, 'health-bp', scheme)
    expect(await axe(page, '[role="dialog"]')).toEqual([])
    await page.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 61_000 }) // the rest is judged on the clock
    await dlg.getByLabel('Top').fill('130')
    await dlg.getByLabel('Bottom').fill('82')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(dlg.getByTestId('bp-avg')).toHaveText('134/84')
    await expect(dlg.getByText('Above target').first()).toBeVisible()
    await expect(dlg.getByTestId('bp-week')).toBeVisible()
    await shot(page, 'health-bpresult', scheme)
    expect(await axe(page, '[role="dialog"]')).toEqual([])
    await dlg.getByRole('button', { name: 'Done' }).click()
  }
})

test('a dangerous reading asks about symptoms first, then shows the 911 dial link', async ({ page }) => {
  await page.goto('/#health/metric/bp_systolic')
  await page.getByRole('button', { name: 'Add reading' }).click()
  await page.getByRole('textbox', { name: 'Top' }).fill('185')
  await page.getByRole('textbox', { name: 'Bottom' }).fill('95')
  await page.getByRole('button', { name: 'Save reading' }).click()
  const card = page.getByTestId('crisis-card')
  await expect(card).toContainText('chest pain')
  expect(await axe(page, '[role="dialog"]')).toEqual([])
  await card.getByRole('button', { name: 'Yes' }).click()
  await expect(card.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
  await expect(card).toContainText('Your family will see this in Bantay.')
})
