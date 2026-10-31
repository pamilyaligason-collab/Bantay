import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Doctor visits (M7a): next visit card, Follow-up due from a prescription, Bring checklist, the visit summary page and its share fallback. Made-up data only.
const SHOTS = process.env.M7A_SHOTS
const PICTURE_MS = 30_000 // ceiling for the summary picture to be drawn; the assertion returns the moment the picture is on screen

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
    if (phase === 1) await put('bantay-health', {
      people: [{ id: 'p1', name: 'Maria Sample' }],
      readings: [
        { personId: 'p1', takenAt: d(1), test: 'bp_systolic', value: 128, unit: 'mmHg' }, { personId: 'p1', takenAt: d(1), test: 'bp_diastolic', value: 82, unit: 'mmHg' },
        { personId: 'p1', takenAt: d(9), test: 'fasting_glucose', value: 104, unit: 'mg/dL' }
      ]
    })
    if (phase === 2) {
      const visit = new Date(nowMs + 9 * 86_400_000); visit.setHours(9, 0, 0, 0)
      await put('bantay-visits', {
        appointments: [{ clientId: 'a1', personId: 'p1', startsAt: visit.toISOString(), purpose: 'Check-up, internal medicine', provider: 'Dr. Reyes', apptStatus: 'planned' }, { clientId: 'a0', personId: 'p1', startsAt: d(60), purpose: 'Lab tests', apptStatus: 'done' }],
        followUps: [{ clientId: 'r1', serverId: 'rx1', personId: 'p1', followUpOn: '2099-01-15', prescriber: 'Dr. Reyes', status: 'confirmed' }]
      })
      await put('bantay-log', { medications: [{ clientId: 'c1', serverId: 's1', personId: 'p1', name: 'Losartan', strength: '50 mg', dose: '1 tablet', medStatus: 'active', status: 'confirmed', schedule: { v: 1, times: ['08:00'] } }] })
    }
  }, [Date.now(), phase] as const)

test('visits: next visit, follow-up due, Bring checklist stays ticked, summary page', async ({ page }) => {
  test.setTimeout(120_000)
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#health')
  await expect(page.getByTestId('bodyhero')).toBeVisible() // the health database exists once the screen has read it (the headline needs a reading)
  await seed(page, 1)
  await page.reload()
  await expect(page.getByRole('link', { name: /^Visits/ })).toBeVisible() // the log and visits databases exist once a person is on screen
  await seed(page, 2)
  await page.reload()
  await expect(page.getByRole('link', { name: /^Visits/ })).toContainText('Next visit:')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#health/visits')
    await page.reload()
    const next = page.getByTestId('next-visit')
    await expect(next).toContainText('Check-up, internal medicine')
    await expect(next).toContainText('9:00 AM')
    await expect(page.getByTestId('follow-ups')).toContainText('Follow-up due')
    await expect(page.getByRole('heading', { name: 'Past visits' })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/visits-${scheme}.png` })
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  }
  const box = page.getByRole('checkbox', { name: 'Medicine list' })
  await box.click()
  await expect(box).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('A question for the doctor').fill('Is my sugar high enough to change the dose?')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /^Question: Is my sugar/ })).toBeVisible()
  // Add saves to IndexedDB without awaiting; reload only once the question is stored, or the reload can beat the write.
  await expect.poll(() => page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open('bantay')
    r.onsuccess = () => {
      const all = r.result.transaction('kv').objectStore('kv').getAll()
      all.onsuccess = () => { res(all.result.filter((x: { key: string; value: unknown }) => x.key.startsWith('visits.questions.') && Array.isArray(x.value) && x.value.length > 0).length); r.result.close() }
    }
  }))).toBe(1)
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Medicine list' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('checkbox', { name: /^Question: Is my sugar/ })).toBeVisible()

  await page.getByRole('link', { name: 'Prepare visit summary' }).click()
  await expect(page).toHaveURL(/#health\/summary$/)
  const sum = page.getByTestId('summary')
  await expect(sum).toContainText('Maria Sample')
  await expect(sum).toContainText('Blood pressure average 128/82 mmHg')
  await expect(sum).toContainText('Losartan 50 mg: 1 tablet, 8:00 AM')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/summary-light.png` })
  // desktop chromium cannot share files: the page offers to save the picture instead
  await page.getByRole('button', { name: 'Share as picture' }).click()
  // the picture is drawn on a canvas and PNG-encoded: under 4 parallel browsers that takes up to ~7 s (measured), so wait for the app's own result, not a fixed beat
  await expect(page.getByRole('status').filter({ hasText: /Shared|Take a screenshot to share/ }).first()).toBeVisible({ timeout: PICTURE_MS })
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Show full screen' }).click()
  await expect(page.getByRole('dialog', { name: /full screen/ }).getByRole('img')).toBeVisible({ timeout: PICTURE_MS })
  await expect(page.getByText('Take a screenshot to share.')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
