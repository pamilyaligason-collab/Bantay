import { expect, type Page } from '@playwright/test'

// S16 L4 fixture `full`: a signed-in member (Mama) with Ate Joy, Papa Ben and Lola Remy, two check-ins today, invented data only. Clock frozen Tue 27 Oct 2026 10:20 (ML-32).
export const NOW = new Date(2026, 9, 27, 10, 20, 0)
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
export const PEOPLE = [{ id: 'me', display_name: 'Mama' }, { id: 'ma', display_name: 'Ate Joy' }, { id: 'pa', display_name: 'Papa Ben' }, { id: 'lo', display_name: 'Lola Remy' }]
type Row = Record<string, unknown>

export async function mockFamily(page: Page): Promise<void> {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Mama' }, { personId: 'ma', displayName: 'Ate Joy' }, { personId: 'pa', displayName: 'Papa Ben' }, { personId: 'lo', displayName: 'Lola Remy' }]))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t.startsWith('rpc/')) return reply(null)
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }, { person_id: 'pa' }, { person_id: 'lo' }])
    return reply([])
  })
}

/** Writes rows into a store the app has already created (never creates a database itself). */
export async function seed(page: Page, dbName: string, store: string, rows: Row[]): Promise<void> {
  await expect.poll(() => page.evaluate(async ([name, st, list]) => new Promise<boolean>((res) => {
    const open = indexedDB.open(name as string)
    open.onupgradeneeded = () => open.transaction!.abort()
    open.onerror = (e) => { e.preventDefault(); res(false) }
    open.onsuccess = () => {
      const d = open.result
      if (!d.objectStoreNames.contains(st as string)) { d.close(); return res(false) }
      const tx = d.transaction(st as string, 'readwrite')
      for (const r of list as Row[]) tx.objectStore(st as string).put(r)
      tx.oncomplete = () => { d.close(); res(true) }
      tx.onerror = () => { d.close(); res(false) }
    }
  }), [dbName, store, rows] as const), { timeout: 15_000 }).toBe(true)
}

const at = (h: number, m: number) => new Date(2026, 9, 27, h, m, 0).toISOString()

/** `full`: open #family, seed the check-ins and a week of plan items, reload. */
export async function full(page: Page): Promise<void> {
  await mockFamily(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('/#family')
  await expect(page.locator('h1')).toHaveText('Family')
  await seed(page, 'bantay-log', 'activity', [{ personId: 'pa', kind: 'check-in', minutes: null, steps: null, startedAt: at(6, 55), source: 'manual' }, { personId: 'lo', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 10), source: 'manual' }])
  await seed(page, 'bantay-family', 'events', [{ clientId: 'e1', title: 'School program', startsAt: at(16, 30), endsAt: null, allDay: false, personId: null }])
  await seed(page, 'bantay-family', 'tasks', [{ clientId: 't1', title: 'Buy rice', due: '2026-10-27', assigneePersonId: 'ma', done: false }])
  await page.reload()
  await expect(page.getByRole('button', { name: /^Papa Ben, OK / })).toBeVisible()
}
