import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> }

// Session 14 lane T2 (Today v7 cleanup): In 10 min on the late dose card, Meals moved to Health > Food (one salt line stays), See the week link, 200% text zoom.
// Auth project (test Supabase env, PostgREST mocked, invented data). Clock frozen at Tue 2026-10-20 10:00 Manila; the Losartan dose is due 09:45, so it is late.
// Screenshots only when S14_SHOTS=docs/session-14/shots/T2 (ML-32).
const SHOTS = process.env.S14_SHOTS
const NOW = new Date('2026-10-20T10:00:00+08:00')
type Row = Record<string, unknown>

test.use({ timezoneId: 'Asia/Manila', viewport: { width: 390, height: 844 } })

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await page.evaluate(async ([name, st, list]) => { // wait until the app's own Dexie made the store (ML-25)
    for (let i = 0; i < 100; i++) {
      const ok = await new Promise<boolean>((res, rej) => {
        const open = indexedDB.open(name as string)
        open.onupgradeneeded = () => { open.transaction?.abort() }
        open.onerror = () => res(false)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(st as string)) { db.close(); res(false); return }
          const tx = db.transaction(st as string, 'readwrite')
          for (const r of list as Row[]) tx.objectStore(st as string).put(r)
          tx.oncomplete = () => { db.close(); res(true) }
          tx.onerror = () => { db.close(); rej(tx.error) }
        }
      })
      if (ok) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`store ${st as string} never appeared in ${name as string}`)
  }, [dbName, store, rows] as const)
}

async function start(page: Page, at: Date = NOW) {
  await page.clock.setFixedTime(at)
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Lloyd' }])))
  await mock(page)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now: NOW, temp: 31, humidity: 60, feels: 33, code: 0, hourlyProb: () => 10 }) }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
  await seed(page, 'bantay-log', 'medications', [{ clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', dose: '50 mg', schedule: { v: 1, times: ['09:45'] }, startedOn: '2026-10-01', medStatus: 'active' }])
  await page.reload() // raw IndexedDB writes do not notify live queries
  await expect(page.getByTestId('salt-line')).toBeVisible() // appears once sign-in finished (ML-25)
  await page.addStyleTag({ content: '.sync-status, .sh-badge { display: none !important; }' })
}
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', mask: [page.locator('nav.tabbar')] }) }

test('In 10 min hides the late dose card, it stays hidden after a reload, and comes back at the time', async ({ page }) => {
  await start(page)
  const card = page.locator('.td-next')
  await expect(card.getByText('Late · not taken yet')).toBeVisible()
  await shot(page, 'today-late')
  const later = card.getByRole('button', { name: 'In 10 min' })
  expect((await later.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await later.click()
  await expect(page.locator('.td-next')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'This card comes back in 10 minutes' })).toBeVisible()
  await shot(page, 'today-snoozed')
  await page.reload()
  await expect(page.getByTestId('salt-line')).toBeVisible()
  await expect(page.locator('.td-next')).toHaveCount(0) // survives the reload
  await page.clock.setFixedTime(new Date(NOW.getTime() + 11 * 60_000))
  await page.reload()
  await expect(page.locator('.td-next').getByText('Late · not taken yet')).toBeVisible() // 10:11: back
})

test('the card comes back by itself when the 10 minutes pass (no reload)', async ({ page }) => {
  await start(page)
  await page.clock.install({ time: NOW }) // from here the app timers run only when advanced
  await page.locator('.td-next').getByRole('button', { name: 'In 10 min' }).click()
  await expect(page.locator('.td-next')).toHaveCount(0)
  await page.clock.runFor(9 * 60_000)
  await expect(page.locator('.td-next')).toHaveCount(0) // 9 minutes in: still snoozed
  await page.clock.runFor(2 * 60_000)
  await expect(page.locator('.td-next').getByText('Late · not taken yet')).toBeVisible()
})

test('Meals is not on Today (one salt line is); the line opens Health > Food where Log a meal lives', async ({ page }) => {
  await start(page)
  await expect(page.getByRole('heading', { name: 'Meals today' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log a meal' })).toHaveCount(0)
  const salt = page.getByTestId('salt-line')
  await expect(salt).toContainText('Salt: nothing logged yet today')
  expect((await salt.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await salt.click()
  await expect(page).toHaveURL(/#health\/nutrition$/)
  await expect(page.getByRole('heading', { name: 'Salt and meals today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log a meal' })).toBeVisible()
  await shot(page, 'health-food')
})

test('My week is a See the week link that opens the same tiles; SOS hold and Self-care stay', async ({ page }) => {
  await start(page)
  await expect(page.getByRole('heading', { name: 'My week' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hold to call and text your family' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
  const link = page.getByRole('button', { name: 'See the week' })
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await link.click()
  await expect(page.getByRole('heading', { name: 'My week' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hide the week' })).toHaveAttribute('aria-expanded', 'true')
})

test('200% text zoom (195px wide): the late card, In 10 min, the salt line and See the week do not scroll sideways', async ({ page }) => {
  await start(page)
  await page.setViewportSize({ width: 195, height: 844 })
  await expect(page.locator('.td-next').getByRole('button', { name: 'In 10 min' })).toBeVisible()
  await expect(page.getByTestId('salt-line')).toBeVisible()
  await page.getByRole('button', { name: 'See the week' }).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
  await shot(page, 'today-zoom')
})
