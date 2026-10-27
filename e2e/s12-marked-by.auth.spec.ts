import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Session 12 lane C shots (390x844, light and dark): meds-marked-by (Health > Medicines, a dose another person marked), digest-toggle (Me, the 8 PM summary).
// Auth project (test Supabase env, PostgREST mocked, invented data). The clock is frozen at 2026-10-20 10:00 so a rerun rewrites the same pixels (ML-32).
// The toggle is mounted in Me by lane A; set S12C_ME=1 once that hook is merged to run its shot. Shots are written only when S12C_SHOTS=<dir> is set.
const SHOTS = process.env.S12C_SHOTS
const NOW = new Date(2026, 9, 20, 10, 0, 0)
const at = (h: number, m: number) => new Date(2026, 9, 20, h, m, 0).toISOString()
type Row = Record<string, unknown>

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await page.evaluate(async ([name, st, list]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string).add(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}
const shot = (page: Page, name: string, scheme: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) : Promise.resolve(undefined))

async function start(page: Page, scheme: 'light' | 'dark') {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(NOW)
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Lloyd' }, { personId: 'ma', displayName: 'Ma' }])))
  await mock(page)
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible() // the app has created its databases
}

for (const scheme of ['light', 'dark'] as const) {
  test(`medicines: taken by someone else says so ${scheme}`, async ({ page }) => {
    await start(page, scheme)
    await seed(page, 'bantay-log', 'medications', [
      { clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', strength: '50 mg', schedule: { v: 1, times: ['08:00', '20:00'] }, medStatus: 'active', status: 'confirmed' },
      { clientId: 'c2', serverId: 's2', personId: 'me', name: 'Amlodipine', strength: '5 mg', schedule: { v: 1, times: ['08:00'] }, medStatus: 'active', status: 'confirmed' }
    ])
    await seed(page, 'bantay-log', 'meds', [
      { personId: 'me', name: 'Losartan', takenAt: at(8, 12), medicationId: 's1', slot: '08:00', markedBy: 'someone-else', markedByName: 'Joy' },
      { personId: 'me', name: 'Amlodipine', takenAt: at(8, 20), medicationId: 's2', slot: '08:00' }
    ])
    await page.goto('/#health/meds')
    await page.reload() // raw IndexedDB writes do not notify live queries
    const today = page.getByTestId('meds-today')
    await expect(today.getByText('Taken 8:12 AM · marked by Joy')).toBeVisible()
    await expect(today.getByText('Taken 8:20 AM', { exact: true })).toBeVisible() // the person's own dose says nothing about a marker
    await today.scrollIntoViewIfNeeded()
    await shot(page, 'meds-marked-by', scheme)
  })

  test(`me: the 8 PM summary switch ${scheme}`, async ({ page }) => {
    test.skip(!process.env.S12C_ME, 'lane A mounts DigestToggle in Me; set S12C_ME=1 after that hook is merged')
    await start(page, scheme)
    await page.goto('/#me')
    const sw = page.getByRole('switch', { name: '8 PM summary' })
    await expect(sw).toBeVisible()
    await expect(page.getByText('Turning this off never stops missed-medicine or Unwell alerts.')).toBeVisible()
    await sw.scrollIntoViewIfNeeded()
    await shot(page, 'digest-toggle', scheme)
  })
}
