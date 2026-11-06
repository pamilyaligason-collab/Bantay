import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Health overview (M7a): My KPIs, the Vitals Latest | Average | Normal toggle, metric detail with Add reading, Refill, Explore (Library and Videos moved to Discover).
// Made-up data only. M7A_SHOTS=<dir> also writes 390x844 light and dark screenshots.
const SHOTS = process.env.M7A_SHOTS

const seed = (page: Page, phase: 1 | 2) =>
  page.evaluate(async ([nowMs, phase]) => {
    const d = (n: number) => new Date(nowMs - n * 86_400_000).toISOString()
    const today = Math.min(0.2, (nowMs - new Date(nowMs).setHours(0, 0, 0, 0)) / 86_400_000 / 2) // still today just after midnight
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
        r('bp_systolic', 124, 'mmHg', today), r('bp_diastolic', 79, 'mmHg', today), r('bp_systolic', 136, 'mmHg', 5), r('bp_diastolic', 88, 'mmHg', 5), r('bp_systolic', 129, 'mmHg', 20),
        r('fasting_glucose', 104, 'mg/dL', 2), r('fasting_glucose', 96, 'mg/dL', 12), r('weight', 61.5, 'kg', 3), r('heart_rate', 70, 'bpm', 0.1), r('ldl', 162, 'mg/dL', 30)
      ]
    })
    const med = (name: string, times: string[], extra: Record<string, unknown> = {}) => ({ clientId: `c-${name}`, serverId: `s-${name}`, personId: 'p1', name, medStatus: 'active', status: 'confirmed', schedule: { v: 1, times }, ...extra })
    if (phase === 2) await put('bantay-log', {
      medications: [med('Losartan', ['08:00']), med('Metformin', ['08:00', '20:00'], { strength: '500 mg', stockQty: 14, stockSetAt: d(0), perDay: 2 }), med('Amlodipine', ['08:00'], { strength: '5 mg' })],
      activity: [{ personId: 'p1', kind: 'steps', minutes: null, steps: 4210, startedAt: d(0), source: 'manual' }]
    })
  }, [Date.now(), phase] as const)

const axe = async (page: Page) => (await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
const shot = async (page: Page, name: string, scheme: 'light' | 'dark') => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) }
const scrollTop = (page: Page, y: number) => page.locator('main.scroll').evaluate((el, v) => el.scrollTo(0, v), y)

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#health')
  await expect(page.getByTestId('bodyhero')).toBeVisible() // the health database exists once the screen has read it
  await seed(page, 1)
  await page.reload()
  await expect(page.getByTestId('browse-visits')).toBeVisible() // the log and visits databases exist once a person is on screen
  await seed(page, 2)
  await page.goto('/#health/readings') // S16: the KPIs, the seven numbers and Latest | Average | Normal live on Readings
  await page.reload()
  await expect(page.getByTestId('kpis')).toBeVisible()
})

test('My KPIs show the latest reading and time; Averages say the days they used; Last readings has no toggle', async ({ page }) => {
  const kpi = page.getByTestId('kpis').locator('[data-kpi="bp_systolic"]')
  await expect(kpi).toContainText('124/79')
  await expect(kpi).toContainText('today')
  await expect(page.getByTestId('kpis').locator('[data-kpi="steps"]')).toContainText('4,210')
  await expect(page.getByTestId('node-bp')).toContainText('130/84') // the average tile
  await expect(page.getByTestId('node-bp')).toContainText(/Average of [0-9]+ days?|7-day average/)
  const row = page.locator('[data-test="bp_systolic"]')
  await expect(row).toContainText('124') // Last readings: the latest
  await expect(page.getByRole('button', { name: 'Average' })).toHaveCount(0)
})

for (const width of [390, 360]) {
  test(`KPI tiles keep every child inside the tile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.reload()
    await expect(page.getByTestId('kpis')).toBeVisible()
    const over = await page.locator('.kp-tile').evaluateAll((tiles) => tiles.flatMap((t) => { const r = t.getBoundingClientRect(); return [...t.querySelectorAll('*')].filter((c) => { const b = c.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 0.5 || b.left < r.left - 0.5) }).map((c) => c.className.toString() || c.tagName) }))
    expect(over).toEqual([])
  })
}

test('a whole vital row is the link, 44px tall, with one tab stop', async ({ page }) => {
  const row = page.locator('.hv-row[data-test="bp_systolic"]')
  await row.scrollIntoViewIfNeeded()
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await row.locator('a, button, [tabindex]').count()).toBe(1)
  const b = (await row.boundingBox())!
  await page.mouse.click(b.x + b.width - 6, b.y + 6) // far from the name
  await expect(page).toHaveURL(/#health\/metric\/bp_systolic$/)
})

test('refill rows give the text the full row width at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 })
  await page.goto('/#health/refill')
  await expect(page.getByTestId('refill-soon')).toBeVisible()
  const rows = page.locator('.rf-row')
  await expect(rows.first()).toBeVisible()
  const ratios = await rows.evaluateAll((rs) => rs.map((r) => r.querySelector('.grow')!.getBoundingClientRect().width / r.getBoundingClientRect().width))
  expect(ratios.length).toBeGreaterThan(0)
  expect(ratios.every((x) => x > 0.5)).toBe(true)
})

test('a lab result opens as a dated list: no period, time-of-day or monthly average controls', async ({ page }) => {
  await page.goto('/#health/metric/ldl')
  await expect(page.getByTestId('lab-last3')).toContainText('162') // S14: a lab page has no Readings block, the last 3 results are the list
  await expect(page.getByTestId('recent')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Period' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Time of day' })).toHaveCount(0)
  await expect(page.getByText('Monthly averages')).toHaveCount(0)
  await page.goto('/#health/metric/bp_systolic')
  await expect(page.getByRole('group', { name: 'Time of day' })).toBeVisible()
})

test('Browse links to Readings, Labs, Move and Visits', async ({ page }) => {
  await page.goto('/#health')
  await expect(page.getByTestId('readings-card').getByRole('link', { name: 'All readings' })).toHaveAttribute('href', '#health/readings')
  await expect(page.getByTestId('browse-move')).toHaveAttribute('href', '#health/move')
  await expect(page.getByTestId('browse-visits')).toHaveAttribute('href', '#health/visits')
  await expect(page.getByTestId('browse-labs')).toHaveAttribute('href', '#health/labs')
  await expect(page.getByRole('link', { name: /^(Library|Videos|Papers)/ })).toHaveCount(0)
  await page.goto('/#health/meds')
  await expect(page.getByTestId('refills-door').getByRole('link')).toContainText('Refill')
})

test('refill rows still read their stock line', async ({ page }) => {
  await page.goto('/#health/refill')
  await expect(page.getByTestId('refill-soon')).toContainText('Metformin 500 mg: 7 days left')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`screens: readings, vitals modes, metric, add reading, refill, explore (${scheme}, axe)`, async ({ page }) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ colorScheme: scheme })
    await page.reload()
    await expect(page.getByTestId('kpis')).toBeVisible()
    await shot(page, 'health-top', scheme)
    expect(await axe(page)).toEqual([])
    await scrollTop(page, 900)
    await page.getByRole('heading', { name: 'Last readings' }).scrollIntoViewIfNeeded()
    await shot(page, 'vitals-latest', scheme)
    expect(await axe(page)).toEqual([])

    await page.goto('/#health/metric/bp_systolic')
    await expect(page.getByTestId('metric-chart')).toBeVisible()
    await shot(page, 'metric', scheme)
    await page.getByRole('button', { name: 'Morning' }).click()
    await expect(page.getByTestId('recent')).toBeVisible()
    expect(await axe(page)).toEqual([])

    await page.goto('/#health/refill')
    await expect(page.getByTestId('refill-soon')).toContainText('Metformin 500 mg: 7 days left')
    await shot(page, 'refill', scheme)
    expect(await axe(page)).toEqual([])

    await page.goto('/#health/body')
    await page.getByRole('button', { name: 'Heart and blood' }).click()
    await expect(page.getByTestId('system-info')).toContainText('Amlodipine 5 mg: relaxes vessels')
    await shot(page, 'anatomy', scheme)
    expect(await axe(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
