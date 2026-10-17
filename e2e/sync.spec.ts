import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Needs the harness page: SYNC_HARNESS=1 PW_PORT=4328 npm run e2e (Supabase is mocked with page.route; synthetic data only).
test.skip(!process.env.SYNC_HARNESS, 'sync harness page not built (set SYNC_HARNESS=1)')

const API = 'https://harness.supabase.test/rest/v1/'
type W = { __bantay: { enqueue: (t: string, o: string, p: unknown) => Promise<number>; syncNow: (force?: boolean) => Promise<void>; db: { outbox: { count: () => Promise<number> } } } }

const open = async (page: Page, token: string | null) => {
  await page.addInitScript((t) => { if (t) localStorage.setItem('harness.token', t) }, token)
  await page.goto('/sync-harness.html')
}
const queue = (page: Page, table: string, payload: unknown) => page.evaluate(([t, p]) => (window as unknown as W).__bantay.enqueue(t as string, 'insert', p), [table, payload])
const sync = (page: Page, force = false) => page.evaluate((f) => (window as unknown as W).__bantay.syncNow(f), force)
const waiting = (page: Page) => page.evaluate(() => (window as unknown as W).__bantay.db.outbox.count())

test('no session: badge says sign in and nothing is sent', async ({ page }) => {
  const sent: string[] = []
  await page.route(API + '**', (r) => { sent.push(r.request().url()); return r.fulfill({ status: 201 }) })
  await open(page, null)
  await expect(page.getByRole('status')).toHaveText('Sign in to sync')
  await queue(page, 'readings', { personId: 'p1', takenAt: '2026-10-01', test: 'ldl', value: 3.2 })
  await sync(page)
  expect(sent).toHaveLength(0)
  expect(await waiting(page)).toBe(1)
})

test('signed in: a queued reading is posted once with a client_id, then the badge says Synced', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  await page.route(API + '**', (r) => {
    const req = r.request()
    if (req.method() === 'POST') { bodies.push(req.postDataJSON()); return r.fulfill({ status: 201 }) }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await open(page, 'tok')
  await expect(page.getByRole('status')).toHaveText('Synced')
  await queue(page, 'readings', { personId: 'p1', takenAt: '2026-10-01', test: 'ldl', value: 3.2, unit: 'mmol/L' })
  await expect(page.getByRole('status')).toHaveText('1 waiting')
  await sync(page)
  await expect(page.getByRole('status')).toHaveText('Synced')
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({ person_id: 'p1', taken_at: '2026-10-01', test: 'ldl', value: 3.2, unit: 'mmol/L' })
  expect(String(bodies[0].client_id)).toMatch(/^[0-9a-f-]{36}$/)
})

test('server offline then back: waiting, then synced; badge has no accessibility violations', async ({ page }) => {
  let up = false
  await page.route(API + '**', (r) => {
    if (!up) return r.abort('connectionrefused')
    return r.request().method() === 'POST' ? r.fulfill({ status: 201 }) : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await open(page, 'tok')
  await queue(page, 'meds_taken', { personId: 'p1', name: 'Test med', takenAt: '2026-10-01T08:00:00Z' })
  await sync(page, true)
  await expect(page.getByRole('status')).toHaveText('Offline, 1 waiting')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  up = true
  await sync(page, true)
  await expect(page.getByRole('status')).toHaveText('Synced')
})

test('a 401 pauses sync and shows the queue waiting', async ({ page }) => {
  let posts = 0
  await page.route(API + '**', (r) => {
    if (r.request().method() === 'POST') posts++
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"PGRST303"}' })
  })
  await open(page, 'expired')
  await queue(page, 'activity', { personId: 'p1', kind: 'walk', minutes: null, steps: null, startedAt: '2026-10-01T08:00:00Z', source: 'manual' })
  await sync(page, true)
  await sync(page, true)
  expect(posts).toBe(1)
  await expect(page.getByRole('status')).toHaveText('1 waiting')
})
