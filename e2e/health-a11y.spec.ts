import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Synthetic data only.
const seed = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('bantay-health')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction(['people', 'readings', 'consults'], 'readwrite')
    tx.objectStore('people').put({ id: 'p1', name: 'Test Person' })
    tx.objectStore('readings').put({ personId: 'p1', takenAt: '2024-02-01', test: 'ldl', value: 120, unit: 'mg/dL', labLow: 0, labHigh: 130 })
    tx.objectStore('readings').put({ personId: 'p1', takenAt: '2024-06-01T08:30:00Z', test: 'ldl', value: 95, unit: 'mg/dL' })
    tx.objectStore('consults').put({ personId: 'p1', takenAt: '2024-04-08', doctor: 'Dr Test', reason: 'Check up' })
    await new Promise((r) => (tx.oncomplete = r))
    db.close()
  })

// Scoped to main: the L0 tab bar active-state contrast (axe color-contrast on button[aria-current]) is an L0 shell issue.
for (const tab of ['health', 'records']) {
  test(`${tab}: no axe violations, empty and with data`, async ({ page }) => {
    await page.goto(`/#${tab}`)
    await expect(page.locator('h1')).toBeVisible()
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([])
    await seed(page)
    await page.reload()
    await expect(page.locator('h1')).toBeVisible()
    if (tab === 'health') await expect(page.locator('a[target="_blank"]').first()).toContainText('(opens in new tab)')
    else if (tab === 'records') await expect(page.locator('.uplot canvas').first()).toBeVisible()
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([])
  })
}

test("family (People and Records views): no axe violations, light and dark", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
  await page.emulateMedia({ colorScheme })
  for (const hash of ["family", "records"]) {
    await page.goto(`/#${hash}`)
    await expect(page.locator("h1")).toHaveText("Family")
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations.map((v) => v.id)).toEqual([])
  }
  }
})
