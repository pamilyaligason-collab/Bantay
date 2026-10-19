import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

type Row = Record<string, unknown>
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Raw IndexedDB writes (the app owns the schema; the page has opened it once already). Reload after, raw writes do not notify live queries. */
async function seed(page: Page, dbName: string, store: string, rows: Row[], mode: 'put' | 'add' = 'put') {
  await page.evaluate(async ([name, st, list, m]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string)[m as 'put' | 'add'](r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows, mode] as const)
}

const FAMILY = [{ personId: 'me', displayName: 'Lloyd' }, { personId: 'ma', displayName: 'Ma' }, { personId: 'pa', displayName: 'Pa' }]

// The check-in confirmation and my own Mark taken need a signed-in identity; the no-auth e2e build has none, so they are covered by unit tests (today.test.tsx, selfId.test.ts).
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.addInitScript((f) => localStorage.setItem('bantay.family', JSON.stringify(f)), FAMILY)
  await page.goto('/')
  await expect(page.getByRole('button', { name: "I'm OK" })).toBeVisible()
})

test('Today is short: no news, no video, one weather line at most, a round quick-log row', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible()
  await expect(page.getByRole('heading', { name: "Today's plan" })).toBeVisible()
  await expect(page.getByRole('link', { name: /Your week/ })).toBeVisible()
  for (const gone of ['Video of the day', 'Your day', 'Top news', 'News']) await expect(page.getByRole('heading', { name: gone })).toHaveCount(0)
  const row = page.getByRole('group', { name: 'Quick log' })
  await expect(row.getByRole('button')).toHaveCount(5)
  for (const b of await row.getByRole('button').all()) {
    const box = (await b.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(48)
    expect(box.width).toBeGreaterThanOrEqual(48)
  }
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
})

test('I am OK signed out says to sign in and does not claim a check-in', async ({ page }) => {
  await page.getByRole('button', { name: "I'm OK" }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sign in first' })).toBeVisible()
  await expect(page.getByRole('button', { name: "I'm OK" })).toBeVisible()
})

test('Next up names the family member whose medicine is not taken and offers no Mark taken for them', async ({ page }) => {
  await seed(page, 'bantay', 'profiles', [{ id: 'ma', photoPath: null, phone: null, birthdate: null, bloodType: null, allergies: [], conditions: [], medicines: ['Hydroxurea 0:00', 'Aspirin 0:00'], updatedAt: null }])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ma: Hydroxurea and Aspirin' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark taken' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /See Ma's medicines/ })).toHaveAttribute('href', '#health')
})

test("Today's plan ticks a task off in place and the progress follows", async ({ page }) => {
  await seed(page, 'bantay-family', 'tasks', [
    { clientId: 't1', title: 'Pay the water bill', due: todayKey(), assigneePersonId: null, done: false },
    { clientId: 't2', title: 'Buy rice', due: todayKey(), assigneePersonId: null, done: true }
  ], 'add')
  await page.reload()
  await expect(page.getByText('1 of 2')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Pay the water bill' }).click()
  await expect(page.getByText('2 of 2')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Tasks done today' })).toHaveAttribute('aria-valuenow', '2')
})

test('the warning band shows only while an official warning is active', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Active warning' })).toHaveCount(0)
  await seed(page, 'bantay', 'kv', [{ key: 'safety.alerts', value: [{
    id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now',
    doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 10.1, lon: 124.0, bulletin: 'b'
  }] }])
  await page.reload()
  const band = page.getByRole('region', { name: 'Active warning' })
  await expect(band).toContainText('Drop, cover and hold on.')
  await expect(band.getByRole('link', { name: 'What to do' })).toHaveAttribute('href', '#safety/warnings')
})
