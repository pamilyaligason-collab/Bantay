import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Health overview (M7a): My KPIs, the Vitals Latest | Average | Normal toggle, metric detail with Add reading, Refill, Library, Videos, Explore.
// Made-up data only. M7A_SHOTS=<dir> also writes 390x844 light and dark screenshots.
const SHOTS = process.env.M7A_SHOTS

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
        r('bp_systolic', 124, 'mmHg', 0.2), r('bp_diastolic', 79, 'mmHg', 0.2), r('bp_systolic', 136, 'mmHg', 5), r('bp_diastolic', 88, 'mmHg', 5), r('bp_systolic', 129, 'mmHg', 20),
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
  await expect(page.getByTestId('insight')).toBeVisible() // the health database exists once the screen has read it
  await seed(page, 1)
  await page.reload()
  await expect(page.getByRole('link', { name: /^Doctor visits/ })).toBeVisible() // the log and visits databases exist once a person is on screen
  await seed(page, 2)
  await page.reload()
  await expect(page.getByTestId('kpis')).toBeVisible()
})

test('My KPIs show the latest reading and time; the Vitals toggle switches Latest, Average and Normal', async ({ page }) => {
  const kpi = page.getByTestId('kpis').locator('[data-kpi="bp_systolic"]')
  await expect(kpi).toContainText('124/79')
  await expect(kpi).toContainText('today')
  await expect(page.getByTestId('kpis').locator('[data-kpi="steps"]')).toContainText('4,210')
  await expect(page.getByRole('link', { name: /^BP 130\/84/ })).toBeVisible() // the body map is the 7-day average
  await expect(page.getByTestId('avg-note')).toContainText('7-day average')

  const row = page.locator('[data-test="bp_systolic"]')
  await expect(page.getByRole('button', { name: 'Latest' })).toHaveAttribute('aria-pressed', 'true')
  await expect(row).toContainText('124')
  await page.getByRole('button', { name: 'Average' }).click()
  await expect(page.getByRole('button', { name: 'Average' })).toHaveAttribute('aria-pressed', 'true')
  await expect(row).toContainText('130')
  await expect(row).toContainText('7-day average')
  await page.getByRole('button', { name: 'Normal' }).click()
  const normal = page.getByTestId('normal-rows')
  await expect(normal).toContainText('70 to 99 mg/dL (3.9 to 5.5 mmol/L)')
  await expect(normal).toContainText('60 to 100 bpm')
  await expect(normal).toContainText('Normal is under 120 over 80')
  await page.getByRole('button', { name: 'Latest' }).click()
  await expect(row).toContainText('124')
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

test('the overview links to Learn, Refills, Doctor visits and Papers; labs have a plain flag', async ({ page }) => {
  await expect(page.getByRole('link', { name: /^Health library/ })).toHaveAttribute('href', '#health/library')
  await expect(page.getByRole('link', { name: /^Videos/ })).toHaveCount(0) // hidden while every video id is a placeholder
  await expect(page.getByRole('link', { name: /^Papers · / })).toHaveAttribute('href', '#health/papers')
  await expect(page.getByRole('link', { name: /^Refills/ })).toContainText('Metformin 500 mg: 7 days left')
  await expect(page.getByText('LDL cholesterol is a bit high. Ask your doctor at the next visit.')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`screens: overview, vitals modes, metric, add reading, refill, library, videos, explore (${scheme}, axe)`, async ({ page }) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ colorScheme: scheme })
    await page.reload()
    await expect(page.getByTestId('kpis')).toBeVisible()
    await shot(page, 'health-top', scheme)
    expect(await axe(page)).toEqual([])
    await scrollTop(page, 900)
    for (const m of ['Latest', 'Average', 'Normal']) {
      await page.getByRole('button', { name: m }).click()
      await page.getByRole('heading', { name: 'Vitals' }).scrollIntoViewIfNeeded()
      await shot(page, `vitals-${m.toLowerCase()}`, scheme)
    }
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

    await page.goto('/#health/library')
    await expect(page.getByRole('link', { name: /^Metformin/ })).toBeVisible()
    await shot(page, 'library', scheme)
    expect(await axe(page)).toEqual([])
    await page.route('https://connect.medlineplus.gov/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ feed: { entry: [{ title: { _value: 'Metformin' }, link: [{ href: 'https://medlineplus.gov/druginfo/meds/a696005.html' }], summary: { _value: '<p>Metformin is used to treat type 2 diabetes. It lowers the sugar in your blood.</p>' } }] } }) }))
    await page.getByRole('link', { name: /^Metformin/ }).click()
    await expect(page.getByTestId('article')).toContainText('Metformin is used to treat type 2 diabetes')
    await expect(page.getByTestId('article')).toContainText('From MedlinePlus (U.S. National Library of Medicine), summarised; not medical advice')
    await shot(page, 'article', scheme)

    await page.goto('/#health/videos')
    await expect(page.getByRole('heading', { level: 1, name: 'Videos' })).toBeVisible()
    await shot(page, 'videos', scheme)
    expect(await axe(page)).toEqual([])

    await page.goto('/#health/body')
    await page.getByRole('button', { name: 'Heart and blood' }).click()
    await expect(page.getByTestId('system-info')).toContainText('Amlodipine 5 mg: relaxes vessels')
    await shot(page, 'anatomy', scheme)
    expect(await axe(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
