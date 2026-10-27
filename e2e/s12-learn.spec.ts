import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 12 lane F2: Discover > Learn. Recipes and cook mode always show; medicine cards only when kv learn.medcards is on.
test.use({ viewport: { width: 390, height: 844 } })

/** Put one kv row in the app's own database (wait until Dexie has made it, then reload so the screen reads it). */
async function setKv(page: Page, key: string, value: unknown) {
  await expect.poll(() => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'bantay')) return false
    return new Promise<boolean>((res) => { const o = indexedDB.open('bantay'); o.onerror = () => res(false); o.onsuccess = () => { const ok = o.result.objectStoreNames.contains('kv'); o.result.close(); res(ok) } })
  })).toBe(true)
  await page.evaluate(([k, v]) => new Promise<void>((res, rej) => {
    const o = indexedDB.open('bantay')
    o.onerror = () => rej(o.error)
    o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ key: k, value: v }); tx.oncomplete = () => { o.result.close(); res() } }
  }), [key, value] as const)
  await page.reload()
}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  // A wake lock the page can ask for, so the spec can see cook mode ask and let go.
  await page.addInitScript(() => {
    const w = window as unknown as { __lock: { requested: number; released: number } }
    w.__lock = { requested: 0, released: 0 }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { w.__lock.requested++; return { released: false, release: async () => { w.__lock.released++ }, addEventListener: () => undefined } } } })
  })
})

test('flag off: Learn shows recipes only, and a medicine link falls back to the Learn home', async ({ page }) => {
  await page.goto('/#discover/learn')
  await expect(page.getByTestId('learn-home')).toBeVisible()
  await expect(page.getByText('Healthy recipes')).toBeVisible()
  await expect(page.getByText('Medicine wiki')).toHaveCount(0)
  await page.goto('/#discover/learn/med/losartan')
  await expect(page.getByTestId('learn-home')).toBeVisible()
  await expect(page.getByTestId('medcard')).toHaveCount(0)
})

test('recipes to a recipe to cook mode: big steps, a one tap timer, wake lock asked and let go', async ({ page }) => {
  await page.goto('/#discover/learn')
  await page.getByRole('link', { name: /Healthy recipes/ }).click()
  await expect(page.getByTestId('recipe-card')).toHaveCount(20)
  await page.getByRole('link', { name: /Sinigang na isda/ }).click()
  await expect(page.getByTestId('salt')).toContainText('240 mg')
  await page.getByRole('link', { name: /Cook mode/ }).click()
  const cook = page.getByTestId('cook')
  await expect(cook).toBeVisible()
  await expect(cook.getByText('Cook mode, screen stays on')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __lock: { requested: number } }).__lock.requested)).toBe(1)
  await expect(page.getByTestId('timer')).toHaveCount(0)
  await cook.getByRole('button', { name: /Next/ }).click()
  await expect(page.getByTestId('cook-step')).toHaveText('Step 2 of 4')
  await page.getByTestId('timer').click()
  await expect(page.getByTestId('timer')).toContainText('left. Tap to pause')
  const over = await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth)
  expect(over).toBe(false)
  await cook.getByRole('link', { name: 'Leave cook mode' }).click()
  await expect(page.getByTestId('recipe')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __lock: { released: number } }).__lock.released)).toBe(1)
})

test('flag on: medicine wiki lists the cards and a card ends with Talk to your doctor first', async ({ page }) => {
  await page.goto('/#discover/learn')
  await setKv(page, 'learn.medcards', true)
  await page.getByRole('link', { name: /Medicine wiki/ }).click()
  await expect(page.getByTestId('all').getByRole('link')).toHaveCount(15)
  await page.getByLabel('Search medicines').fill('losartan')
  await page.getByTestId('all').getByRole('link', { name: /Losartan/ }).click()
  await expect(page.getByTestId('medcard')).toBeVisible()
  await expect(page.getByTestId('nomix')).toContainText('Salt substitutes made with potassium')
  await expect(page.getByTestId('doctor')).toContainText('Talk to your doctor first')
})

test('Learn pages fit at 360 px without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/#discover/learn')
  await setKv(page, 'learn.medcards', true)
  for (const h of ['learn', 'learn/meds', 'learn/med/calcium', 'learn/recipes', 'learn/recipe/pinakbet-light']) {
    await page.goto('/#discover/' + h)
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth), h).toBe(false)
  }
})
