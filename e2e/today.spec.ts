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

const FAMILY = [{ personId: 'me', displayName: 'Rey' }, { personId: 'ma', displayName: 'Ma' }, { personId: 'pa', displayName: 'Pa' }]

// The check-in confirmation and my own Mark taken need a signed-in identity; the no-auth e2e build has none, so they are covered by unit tests (today.test.tsx, selfId.test.ts).
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.addInitScript((f) => localStorage.setItem('bantay.family', JSON.stringify(f)), FAMILY)
  await page.goto('/')
  await expect(page.getByTestId('myday')).toBeVisible()
})

test('Today follows the board: hero, My day, Calm, Your numbers, then More; no quick-log grid, no salt line, no Your week, no news, video or family list', async ({ page }) => {
  const heading = (name: string) => page.getByRole('heading', { name })
  await expect(heading('Next up')).toHaveCount(0) // calm: no empty card
  await expect(heading("Today's plan")).toHaveCount(0) // S5: nothing planned, no card and no filler
  for (const gone of ['Video of the day', 'Your day', 'Top news', 'News', 'Family', 'Your week']) await expect(heading(gone)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Your week/ })).toHaveCount(0)
  await expect(page.locator('.td-quick, [data-testid="salt-line"]')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Quick log' })).toHaveCount(0)
  await expect(page.getByTestId('myday-more')).toBeVisible()
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
})

test('How are you? signed out says to sign in and does not claim the family will see it', async ({ page }) => {
  await page.getByRole('button', { name: 'How are you? Pick a face' }).click()
  await page.getByRole('button', { name: 'Unwell' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Sign in first' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0)
})

test('Nothing next: no Next up card and no All clear card, and the quick-log Dose and Mood buttons open their sheets', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Next up|All clear/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'How are you? Pick a face' }).click()
  await expect(page.getByRole('dialog', { name: 'How are you feeling?' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByTestId('myday-more').click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Dose taken' }).click()
  await expect(page.getByRole('dialog', { name: 'Which medicine did you take?' })).toBeVisible()
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

test('My day I\'m OK signed out says to sign in first and never claims it saved', async ({ page }) => {
  const day = page.getByTestId('myday')
  await expect(day.getByText('Lets the family know you are fine')).toHaveCount(0)
  await day.getByRole('button', { name: "I'm OK" }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sign in first' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0)
})
