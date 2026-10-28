import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// Session 13 lane H shots (auth project: signed in, so Add a reading is offered): Health overview (summary, then Browse), a person with nothing logged, and a person with labs only.
// The clock is frozen (26 Oct 2026, 10:20 local), motion is reduced, and the data is made up, so a rerun writes the same pixels (ML-32).
const SHOTS = shotPath('docs/session-13/shots/H')
const NOW = new Date(2026, 9, 26, 10, 20, 0)
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })

const seed = (page: Page, mode: 'full' | 'empty' | 'labs' | 'log') =>
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
    const r = (test: string, value: number, unit: string, ago: number) => ({ personId: 'me', takenAt: d(ago), test, value, unit })
    if (mode === 'log') { await put('bantay-log', { activity: [{ personId: 'me', kind: 'steps', minutes: null, steps: 4210, startedAt: d(0.05), source: 'manual' }] }); return }
    const readings = mode === 'empty' ? [] : mode === 'labs' ? [r('ldl', 162, 'mg/dL', 2), r('hdl', 55, 'mg/dL', 2)] : [
      r('bp_systolic', 124, 'mmHg', 0.05), r('bp_diastolic', 79, 'mmHg', 0.05), r('bp_systolic', 136, 'mmHg', 5), r('bp_diastolic', 88, 'mmHg', 5),
      r('fasting_glucose', 104, 'mg/dL', 2), r('weight', 61.5, 'kg', 3), r('heart_rate', 70, 'bpm', 0.1), r('ldl', 162, 'mg/dL', 30)
    ]
    await put('bantay-health', { people: [{ id: 'me', name: 'Lloyd' }], readings })
  }, [NOW.getTime(), mode] as const)

async function open(page: Page, mode: 'full' | 'empty' | 'labs') {
  await page.clock.setFixedTime(NOW)
  await skipOnboarding(page)
  await mock(page) // signed in as a made-up member whose own person id is 'me'
  await page.goto('/#health')
  await expect(page.locator('h1')).toHaveText('Health')
  await seed(page, mode)
  await page.reload()
  await expect(page.getByTestId('browse')).toBeVisible() // the skeleton is gone and the Browse grid is drawn
  if (mode === 'full') {
    await expect.poll(() => page.evaluate(() => new Promise<boolean>((res) => { const o = indexedDB.open('bantay-log'); o.onerror = () => res(false); o.onsuccess = () => { const ok = o.result.objectStoreNames.contains('activity'); o.result.close(); res(ok) } }))).toBe(true)
    await seed(page, 'log'); await page.reload(); await expect(page.getByTestId('browse')).toBeVisible() } // the log database exists once a person is on screen
}

async function shot(page: Page, name: string, scheme: string, anchor?: string) {
  if (anchor) await page.locator(anchor).evaluate((el) => { (el as HTMLElement).style.scrollMarginTop = '16px'; el.scrollIntoView({ block: 'start' }) })
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, animations: 'disabled' })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`health overview: summary, vitals, Browse grid (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, 'full')
    await expect(page.getByTestId('kpis')).toBeVisible()
    await expect(page.locator('[data-kpi="steps"]')).toContainText('4,210')
    await shot(page, 'overview-top', scheme)
    await shot(page, 'overview-kpis', scheme, '[data-testid="kpis"]')
    await shot(page, 'overview-vitals', scheme, '#lvn-vitals')
    await shot(page, 'overview-browse', scheme, '#hb-h')
    await page.locator('main.scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await shot(page, 'overview-end', scheme)
    // 2 columns at 360 px, every tile 48 px or taller
    await page.setViewportSize({ width: 360, height: 780 })
    const boxes = await page.locator('[data-browse]').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) } }))
    expect(boxes.length).toBeGreaterThanOrEqual(9)
    expect(boxes.every((b) => b.h >= 48)).toBe(true)
    expect(new Set(boxes.map((b) => b.x)).size).toBeLessThanOrEqual(2) // two columns (a lone last tile may span both)
    await page.getByTestId('browse').locator('[data-browse="readings"]').click()
    await expect(page.getByRole('heading', { name: 'Vitals' })).toBeInViewport()
  })

  test(`health overview: a person with nothing logged (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, 'empty')
    await expect(page.getByTestId('health-empty').getByRole('button', { name: 'Add a reading' })).toBeVisible()
    await shot(page, 'empty-person', scheme)
    await shot(page, 'empty-person-card', scheme, '[data-testid="health-empty"]')
    await page.getByTestId('health-empty').getByRole('button', { name: 'Add a reading' }).click()
    await expect(page.getByText(/^Add blood pressure/)).toBeVisible()
  })

  test(`health overview: labs only has one no-vitals state and the Browse grid (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, 'labs')
    await expect(page.getByTestId('no-vitals')).toBeVisible()
    await shot(page, 'no-vitals', scheme, '[data-testid="no-vitals"]')
    await shot(page, 'no-vitals-browse', scheme, '#hb-h')
  })
}
