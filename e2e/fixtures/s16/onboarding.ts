import type { Page } from '@playwright/test'

// S16 L8 fixtures (contracts.md C-11): a family whose Mama signs in with PIN 480193, then the three states of onboarding screen 3.
// All Supabase traffic is mocked, test values only. The clock is not frozen here: nothing on these screens depends on the day.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
export const PIN = '480193'
const FAMILY = [{ personId: 'p-mama', displayName: 'Mama', handle: 'mama', provider: 'pin', initials: 'M' }]

export async function mockServer(page: Page): Promise<void> {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (url.pathname === '/functions/v1/pin-login') {
      const b = req.postDataJSON() as { pin?: string }
      if (b.pin !== PIN) return reply(401, { ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' })
      return reply(200, { ok: true, session: { access_token: jwt(), refresh_token: 'refresh-test', expires_in: 3600, token_type: 'bearer' } })
    }
    if (url.pathname === '/functions/v1/family-names') return reply(200, [{ first_name: 'Mama', initial: '', handle: 'mama' }])
    if (url.pathname === '/rest/v1/rpc/family_profiles') return reply(200, FAMILY.map((f) => ({ person_id: f.personId, display_name: f.displayName, handle: f.handle, provider: f.provider })))
    if (url.pathname === '/auth/v1/user') return reply(200, user)
    if (url.pathname === '/rest/v1/rpc/ensure_self_person') return reply(200, '44444444-4444-4444-8444-444444444444')
    if (url.pathname === '/rest/v1/people') return reply(200, { id: 'p-mama', display_name: 'Mama' })
    return reply(404, {})
  })
  await page.addInitScript((fam) => localStorage.setItem('bantay.family', JSON.stringify(fam)), FAMILY)
}

const kvPut = (page: Page, key: string, value: unknown) =>
  page.evaluate(([k, v]) => new Promise<void>((res, rej) => {
    const r = indexedDB.open('bantay')
    r.onerror = () => rej(r.error)
    r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: k, value: v }); t.oncomplete = () => res() }
  }), [key, value] as const)

/** Mama taps her name and types the PIN; screen 3 is up. */
export async function signInMama(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Mama' }).click()
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click()
}

/** Screen 3 with no medicines on file: "No medicines yet. Your carer can add them." (nothing to seed). */
export const noMeds = async (page: Page): Promise<void> => { await mockServer(page) }
/** Screen 3 after Android stopped prompting: two refusals are already counted (m2-3). Call after the app has opened once so the database exists. */
export const deniedTwice = (page: Page) => kvPut(page, 'setup.notifDenials', 2)
/** Screen 3 with a dose on file. Needs the signed-in person's id; the mock gives p-mama. */
export const withMeds = (page: Page) =>
  page.evaluate(() => new Promise<void>((res, rej) => {
    const r = indexedDB.open('bantay')
    r.onerror = () => rej(r.error)
    r.onsuccess = () => {
      const t = r.result.transaction('medications', 'readwrite')
      t.objectStore('medications').put({ personId: 'p-mama', name: 'Losartan', strength: '50 mg', schedule: { v: 1, times: ['09:00'] } })
      t.oncomplete = () => res()
    }
  }))
