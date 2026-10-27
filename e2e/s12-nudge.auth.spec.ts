import { expect, test, type Page } from '@playwright/test'
import { API, mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Session 12 lane G (nudge): Health > Check-in and kudos. Auth project (test Supabase env, PostgREST mocked, invented data).
// The clock is frozen at Tue 2026-10-20 10:00 so a rerun draws the same pixels (ML-32); the week is Wed 14 to Tue 20 October.
// Shots only when S12G_SHOTS=<dir> is set: nudge-home (hub top), nudge-recap, nudge-pillbox, nudge-pixels, nudge-reminder (web shows the app-only line).
const SHOTS = process.env.S12G_SHOTS
const NOW = new Date(2026, 9, 20, 10, 0, 0)
const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m, 0).toISOString()
type Row = Record<string, unknown>

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  // Wait until the app's own Dexie has created the store: a bare open before that makes an empty v1 database (ML-25).
  await page.evaluate(async ([name, st, list]) => {
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
const count = (page: Page, dbName: string, store: string) =>
  page.evaluate(([name, st]) => new Promise<number>((res, rej) => {
    const open = indexedDB.open(name as string)
    open.onerror = () => rej(open.error)
    open.onsuccess = () => { const q = open.result.transaction(st as string).objectStore(st as string).count(); q.onsuccess = () => { open.result.close(); res(q.result) }; q.onerror = () => rej(q.error) }
  }), [dbName, store] as const)
const shot = (page: Page, name: string, scheme: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) : Promise.resolve(undefined))

const SYS = [130, 132, 134, 136, 131, 135, 133] // 931 / 7 = 133
const DIA = [80, 82, 84, 86, 81, 85, 83] // 581 / 7 = 83
const readings = (): Row[] => SYS.flatMap((s, k) => [
  { personId: 'me', takenAt: at(14 + k, 7, 30), test: 'bp_systolic', value: s, unit: 'mmHg' },
  { personId: 'me', takenAt: at(14 + k, 7, 30), test: 'bp_diastolic', value: DIA[k]!, unit: 'mmHg' }
])

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
  test(`hub: entry tile, recap numbers, counts-only share, pillbox, pixels ${scheme}`, async ({ page }) => {
    const posts: Row[] = []
    await start(page, scheme)
    await page.route(`${API}/rest/v1/family_messages*`, async (route) => {
      const req = route.request()
      if (req.method() === 'POST') posts.push(JSON.parse(req.postData() ?? '{}') as Row)
      await route.fulfill({ status: req.method() === 'POST' ? 201 : 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '[]' })
    })
    await seed(page, 'bantay-health', 'people', [{ id: 'me', name: 'Lloyd' }, { id: 'ma', name: 'Ma' }])
    await seed(page, 'bantay-health', 'readings', readings())
    await seed(page, 'bantay-log', 'medications', [{ clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-10-01', medStatus: 'active', status: 'confirmed' }])
    await seed(page, 'bantay-log', 'meds', [14, 15, 16, 18, 20].map((d) => ({ personId: 'me', name: 'Losartan', takenAt: at(d, 8, 10), medicationId: 's1', slot: '08:00' }))) // missed Sat 17 and Sun 19 -> 5 of 7
    await page.goto('/#health')
    await page.reload() // raw IndexedDB writes do not notify live queries
    await page.getByTestId('nudge-entry').click()
    await expect(page.getByRole('heading', { name: 'Check-in and kudos' })).toBeVisible()
    await shot(page, 'nudge-home', scheme)

    // recap: hand-computed 133/83, 7 of 7 morning checks, medicines on 5 of 7 days
    await expect(page.getByTestId('recap-avg')).toHaveText('133/83')
    await expect(page.getByTestId('recap-checks')).toHaveText('7 of 7')
    await expect(page.getByTestId('recap-meds')).toHaveText('5 of 7')
    await page.getByTestId('nudge-recap').scrollIntoViewIfNeeded()
    await shot(page, 'nudge-recap', scheme)
    await page.getByTestId('recap-share').click()
    await expect(page.getByTestId('recap-said')).toContainText('Shared')
    await expect.poll(() => posts.length).toBeGreaterThan(0)
    expect(posts[0]).toMatchObject({ kind: 'recap', body: 'This week: 7 of 7 morning checks, medicines on 5 of 7 days.' })
    expect(String(posts[0]!.body)).not.toMatch(/133|83/) // counts only, never a reading

    // pillbox: today's 08:00 dose is logged (8:10), so every taken day reads taken; the two misses are quiet dots, not alarms
    const pill = page.getByTestId('nudge-pillbox')
    await expect(pill.locator('[data-state="done"]')).toHaveCount(5)
    await expect(pill.locator('[data-state="missed"]')).toHaveCount(2)
    await pill.scrollIntoViewIfNeeded()
    await shot(page, 'nudge-pillbox', scheme)

    // pixels: the 7 days are average 130/80 .. 136/86 -> above target squares and a few high triangles; the legend counts them
    const px = page.getByTestId('nudge-pixels')
    await expect(px.getByRole('img', { name: /2026: 7 days with a blood pressure/ })).toBeVisible()
    await px.scrollIntoViewIfNeeded()
    await shot(page, 'nudge-pixels', scheme)

    // reminder: the web shows the honest app-only line
    await expect(page.getByTestId('nudge-reminder')).toContainText('work in the Bantay app')
    await page.getByTestId('nudge-reminder').scrollIntoViewIfNeeded()
    await shot(page, 'nudge-reminder', scheme)

    // no sideways scroll at 390 px
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test(`pillbox tap logs once and kudos heart is sent about that person ${scheme}`, async ({ page }) => {
    const posts: Row[] = []
    await start(page, scheme)
    await page.route(`${API}/rest/v1/family_messages*`, async (route) => {
      const req = route.request()
      if (req.method() === 'POST') posts.push(JSON.parse(req.postData() ?? '{}') as Row)
      await route.fulfill({ status: req.method() === 'POST' ? 201 : 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '[]' })
    })
    await seed(page, 'bantay-health', 'people', [{ id: 'me', name: 'Lloyd' }, { id: 'ma', name: 'Ma' }])
    await seed(page, 'bantay-log', 'medications', [{ clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-10-01', medStatus: 'active', status: 'confirmed' }])
    await page.goto('/#health/nudge')
    await page.reload()
    const cell = page.getByTestId('nudge-pillbox').locator('button[data-cell$=":am"]')
    await expect(cell).toBeVisible() // today 08:00 is still to take at 10:00 with nothing logged
    expect(await count(page, 'bantay-log', 'meds')).toBe(0)
    await cell.click()
    await expect(page.getByTestId('nudge-pillbox').locator('[data-state="done"]')).toHaveCount(1) // the live query redraws it as taken
    expect(await count(page, 'bantay-log', 'meds')).toBe(1)
    await expect(cell).toHaveCount(0) // no second tap is possible, so no double row

    await page.getByLabel('Send a heart to Ma').click()
    await expect(page.getByTestId('kudos-said')).toContainText('Sent')
    await expect.poll(() => posts.length).toBeGreaterThan(0)
    expect(posts[0]).toMatchObject({ kind: 'kudos', body: 'heart', about_person: 'ma' })
  })
}
