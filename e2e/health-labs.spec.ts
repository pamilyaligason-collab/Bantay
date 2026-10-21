import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Lab results (session 8): grouped number-line cards, detail page with last 3 values and doctor questions. Made-up data only.

const seed = (page: Page) =>
  page.evaluate(async (nowMs) => {
    const d = (n: number) => new Date(nowMs - n * 86_400_000).toISOString()
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('bantay-health'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const tx = db.transaction(['people', 'readings'], 'readwrite')
    tx.objectStore('people').put({ id: 'p1', name: 'Maria Sample' })
    const r = (test: string, value: number, unit: string, ago: number, extra: Record<string, unknown> = {}) => ({ personId: 'p1', takenAt: d(ago), test, value, unit, ...extra })
    for (const x of [
      r('ldl', 162, 'mg/dL', 3), r('ldl', 171, 'mg/dL', 90), r('ldl', 150, 'mg/dL', 180),
      r('creatinine', 0.9, 'mg/dL', 3, { labLow: 0.6, labHigh: 1.3 }),
      r('hemoglobin', 11.2, 'g/dL', 3, { labLow: 12, labHigh: 17.5 }),
      r('uric_acid', 5.1, 'mg/dL', 3)
    ]) tx.objectStore('readings').put(x)
    await new Promise((res) => (tx.oncomplete = res))
    db.close()
  }, Date.now())

const axe = async (page: Page) => (await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && Array.from(document.querySelectorAll('main, main *')).every((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1))

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#health')
  await expect(page.getByTestId('insight')).toBeVisible()
  await seed(page)
  await page.reload()
  await expect(page.getByTestId('labs-list')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`labs list groups out-of-range first, with verdict words and a number line (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    const list = page.getByTestId('labs-list')
    await expect(list.locator('[data-group="ask"] [data-test]')).toHaveCount(2)
    await expect(list.locator('[data-group="usual"] [data-test="creatinine"]')).toContainText('In range')
    await expect(list.locator('[data-test="ldl"]')).toContainText('High')
    await expect(list.locator('[data-test="hemoglobin"]')).toContainText('Low')
    await expect(list.locator('[data-test="ldl"] .lr-track')).toBeVisible()
    await expect(list.locator('[data-test="ldl"] .lr-you')).toContainText('You')
    const none = list.locator('[data-group="none"] [data-test="uric_acid"]')
    await expect(none).toContainText('No range on the paper')
    await expect(none.locator('.lr-track')).toHaveCount(0)
    expect(await axe(page)).toEqual([])
    expect(await noSideways(page)).toBe(true)
    if (process.env.LAB_SHOTS) await list.screenshot({ path: `${process.env.LAB_SHOTS}/labs-${scheme}.png` })
  })

  test(`lab detail shows what it measures, the last 3 values and questions, and adds them to the visit list (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.getByTestId('labs-list').locator('[data-test="ldl"]').click()
    await expect(page.getByTestId('lab-measures')).toContainText('LDL')
    const last = page.getByTestId('lab-last3')
    await expect(last.locator('.row')).toHaveCount(3)
    await expect(last).toContainText('162')
    await expect(last).toContainText('toward the usual range') // 171 -> 162, top limit 99
    expect(await axe(page)).toEqual([])
    await page.getByRole('button', { name: 'Add to visit list' }).click()
    await expect(page.getByTestId('lab-questions').getByRole('status')).toContainText('Added')
    await page.getByRole('link', { name: 'Open your visit list' }).click()
    await expect(page.getByText('Is my LDL where you want it for me?').first()).toBeVisible()
  })
}

test('lab list and detail do not scroll sideways at 200% text zoom (195px wide)', async ({ page }) => {
  await page.setViewportSize({ width: 195, height: 844 })
  expect(await noSideways(page)).toBe(true)
  await page.getByTestId('labs-list').locator('[data-test="ldl"]').click()
  await expect(page.getByTestId('lab-last3')).toBeVisible()
  expect(await noSideways(page)).toBe(true)
})
