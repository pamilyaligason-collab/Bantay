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
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
})

test('Today follows Lloyd\'s order: weather (Next up only when something is next), quick log (3 x 2), plan, then More; no news, video or full family list', async ({ page }) => {
  const heading = (name: string) => page.getByRole('heading', { name })
  await expect(heading('Next up')).toHaveCount(0) // calm: no empty card
  await expect(heading("Today's plan")).toHaveCount(0) // S5: nothing planned, no card and no filler
  await expect(page.getByRole('link', { name: /Your week/ })).toBeVisible()
  for (const gone of ['Video of the day', 'Your day', 'Top news', 'News', 'Family']) await expect(heading(gone)).toHaveCount(0)
  const row = page.getByRole('group', { name: 'Quick log' })
  await expect(row.getByRole('button')).toHaveCount(6)
  await page.evaluate(() => Promise.all(document.getAnimations().map((x) => x.finished.catch(() => undefined)))) // the reveal motion is done: measure settled boxes
  const boxes = []
  for (const b of await row.getByRole('button').all()) {
    const box = (await b.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(72)
    expect(box.width).toBeGreaterThanOrEqual(48)
    boxes.push(box)
  }
  const near = (xs: number[]) => Math.max(...xs) - Math.min(...xs) < 3 // tolerate sub-pixel / settling shifts
  for (const r of [0, 3]) expect(near(boxes.slice(r, r + 3).map((b) => b.y))).toBe(true) // two rows of three
  for (const c of [0, 1, 2]) expect(near([boxes[c]!.x, boxes[c + 3]!.x])).toBe(true) // columns line up
  expect(boxes[3]!.y - boxes[0]!.y).toBeGreaterThan(60)
  expect(near(boxes.map((b) => b.width))).toBe(true) // equal tiles
  const y = async (loc: ReturnType<Page['locator']>) => (await loc.first().boundingBox())!.y
  const quick = await y(row)
  const week = await y(page.getByRole('link', { name: /Your week/ }))
  expect(quick).toBeLessThan(week)
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
})

test('How are you? signed out says to sign in and does not claim the family will see it', async ({ page }) => {
  await expect(page.getByRole('button', { name: "I'm OK" })).toHaveCount(0) // folded into How are you?
  await page.getByRole('button', { name: 'Log how you feel' }).click()
  await page.getByRole('button', { name: 'Unwell' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Sign in first' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0)
})

test('Nothing next: no Next up card and no All clear card, and the quick-log Dose and Mood buttons open their sheets', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Next up|All clear/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Log how you feel' }).click()
  await expect(page.getByRole('dialog', { name: 'How are you feeling?' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'More things to log' }).click()
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
