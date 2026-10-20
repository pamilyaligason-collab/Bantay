import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Health v6 (body map, Previous switch, metric detail, medicines). Synthetic data only.
const SHOTS = '.scratch/shots/L3-health'

// Two phases: the log and profile databases only exist once a person is on screen.
const seed = (page: Page, phase: 1 | 2) =>
  page.evaluate(async ([nowMs, phase]) => {
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
    if (phase === 1) await put('bantay-health', {
      people: [{ id: 'p1', name: 'Maria Sample' }],
      readings: [
        r('bp_systolic', 124, 'mmHg', 0.2), r('bp_diastolic', 79, 'mmHg', 0.2), r('bp_systolic', 136, 'mmHg', 5), r('bp_diastolic', 88, 'mmHg', 5), r('bp_systolic', 129, 'mmHg', 40),
        r('fasting_glucose', 104, 'mg/dL', 2), r('fasting_glucose', 96, 'mg/dL', 12), r('weight', 61.5, 'kg', 3), r('heart_rate', 70, 'bpm', 0.1)
      ]
    })
    const med = (name: string, times: string[], extra: Record<string, unknown> = {}) => ({ clientId: `c-${name}`, serverId: `s-${name}`, personId: 'p1', name, medStatus: 'active', status: 'confirmed', schedule: { v: 1, times }, ...extra })
    if (phase === 2) await put('bantay-log', {
      medications: [med('Losartan', ['08:00']), med('Metformin', ['08:00', '20:00'], { strength: '500 mg' }), med('Vitamin D', [], { asNeeded: true })],
      activity: [
        { personId: 'p1', kind: 'sleep', minutes: 400, steps: null, startedAt: d(0.3), source: 'manual' },
        { personId: 'p1', kind: 'steps', minutes: null, steps: 2100, startedAt: d(0), source: 'manual' },
        { personId: 'p1', kind: 'mood-good', minutes: null, steps: null, startedAt: d(0.05), source: 'manual' }
      ]
    })
  }, [Date.now(), phase] as const)

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
})

test('overview: body map, Previous switch, medicines; metric detail; axe light and dark', async ({ page }) => {
  test.setTimeout(120_000) // two colour schemes, each with screenshots and two axe runs
  await page.goto('/#health')
  await expect(page.locator('h1')).toHaveText('Health')
  await expect(page.getByTestId('insight')).toHaveText('No results yet')
  await expect(page.getByTestId('health-empty').getByRole('link')).toHaveCount(1)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.screenshot({ path: `${SHOTS}/health-empty-${scheme}.png` })
  }
  await seed(page, 1)
  await page.reload()
  await expect(page.getByTestId('insight')).toContainText('this week')
  await seed(page, 2)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#health')
    await page.reload()
    await expect(page.getByTestId('insight')).toContainText('this week')
    await expect(page.getByRole('link', { name: /^BP 124\/79/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Steps 2,?100/ })).toBeVisible()
    await page.getByRole('switch', { name: 'Previous' }).click()
    await expect(page.getByText(/^Before: 136 mmHg/).first()).toBeVisible()
    await expect(page.getByTestId('meds-summary')).toContainText('0 of 3 doses today')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${SHOTS}/health-${scheme}.png` })
    await page.locator('main.scroll').evaluate((el) => el.scrollTo(0, 760))
    await page.screenshot({ path: `${SHOTS}/health-lower-${scheme}.png` })
    await page.locator('main.scroll').evaluate((el) => el.scrollTo(0, 1500))
    await page.screenshot({ path: `${SHOTS}/health-meds-${scheme}.png` })
    await page.getByTestId('meds-summary').click()
    await expect(page).toHaveURL(/#health\/meds$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Medicines' })).toBeVisible()
    await expect(page.getByTestId('meds-today')).toContainText('Metformin 500 mg')
    await page.screenshot({ path: `${SHOTS}/medicines-screen-${scheme}.png` })
    await page.getByRole('link', { name: 'Back to Health' }).click()
    await expect(page.getByTestId('insight')).toBeVisible()
    await page.locator('main.scroll').evaluate((el) => el.scrollTo(0, 0))
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])

    await page.getByRole('link', { name: /^BP 124\/79/ }).click()
    await expect(page).toHaveURL(/#health\/metric\/bp_systolic$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Blood pressure, top number' })).toBeVisible()
    await page.getByRole('button', { name: 'This month' }).click()
    await expect(page.locator('.uplot canvas').first()).toBeVisible()
    await expect(page.getByTestId('monthly')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${SHOTS}/metric-${scheme}.png` })
    await page.locator('main.scroll').evaluate((el) => el.scrollTo(0, 900))
    await page.screenshot({ path: `${SHOTS}/metric-lower-${scheme}.png` })
    await page.locator('main.scroll').evaluate((el) => el.scrollTo(0, 0))
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await page.getByRole('link', { name: 'Back to Health' }).click()
    await expect(page.getByTestId('insight')).toBeVisible()
  }
})

test('medicines list shows and is read-only when nobody is signed in', async ({ page }) => {
  await page.goto('/#health')
  await expect(page.locator('h1')).toBeVisible()
  await seed(page, 1)
  await page.reload()
  await expect(page.getByTestId('insight')).toContainText('this week')
  await seed(page, 2)
  await page.reload()
  // Signed out in the no-auth e2e build: nobody is "me", so the dose is read-only here and says so.
  await page.goto('/#health/meds')
  await expect(page.getByTestId('meds-today')).toContainText('Losartan')
  await expect(page.getByRole('button', { name: /^Take / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0)
})
