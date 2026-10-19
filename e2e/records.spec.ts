import { expect, test, type Page } from '@playwright/test'

// Synthetic data only: "Test Person", made-up test table.
const seed = (page: Page) =>
  page.evaluate(async () => {
    const open = () =>
      new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('bantay-health')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const db = await open()
    const tx = db.transaction(['people', 'readings', 'consults'], 'readwrite')
    tx.objectStore('people').put({ id: 'p1', name: 'Test Person' })
    const rd = tx.objectStore('readings')
    rd.put({ personId: 'p1', takenAt: '2024-02-01', test: 'ldl', value: 120, unit: 'mg/dL', labLow: 0, labHigh: 130 })
    rd.put({ personId: 'p1', takenAt: '2024-06-01', test: 'ldl', value: 95, unit: 'mg/dL', labLow: 0, labHigh: 130 })
    rd.put({ personId: 'p1', takenAt: '2024-06-01', test: 'made_up_test', value: 7, unit: 'u' })
    tx.objectStore('consults').put({ personId: 'p1', takenAt: '2024-04-08', doctor: 'Dr Test', reason: 'Check up' })
    await new Promise((r) => (tx.oncomplete = r))
    db.close()
  })

test('empty states', async ({ page }) => {
  await page.goto('/#records')
  await expect(page.getByText('No records yet')).toBeVisible()
  await page.goto('/#health')
  await expect(page.getByText('No results yet')).toBeVisible()
})

test('timeline, trend chart and latest vs normal from seeded data', async ({ page }) => {
  await page.goto('/#records')
  await expect(page.getByText('No records yet')).toBeVisible()
  await seed(page)
  await page.reload()
  await expect(page.getByTestId('timeline')).toContainText('Doctor visit: Dr Test')
  await expect(page.locator('.uplot canvas').first()).toBeVisible()
  await page.goto('/#health')
  const ldl = page.locator('[data-test="ldl"]')
  await expect(ldl).toContainText('95')
  await expect(ldl).toContainText('Within range')
  // the lab range, the general guide and the source now live on the metric page
  await page.goto('/#health/metric/ldl')
  await expect(page.getByText('Lab range: 0 to 130')).toBeVisible()
  await expect(page.getByText(/MedlinePlus/).first()).toBeVisible()
})
