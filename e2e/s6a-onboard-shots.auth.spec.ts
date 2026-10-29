import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { shotPath } from './shotPath'

// The auth build sets VITE_JOIN_STUB=1 (playwright.config.ts), so #join opens start-who with a stub claim port; the real build has no join port until S6b adds the action.
// S6a ONBOARD shots, 390x844 light and dark: start-who, start-pin, start-done, start-pinpad, start-wrong, start-forgot, start-approve-wait.
// (start-approve-req is a sheet over Today: its mount point is a Today hook owned by S7, covered by ApprovePinSheet.test.tsx until then.)
// Filename ends in .auth.spec: only that project builds with Supabase env. All Supabase traffic is mocked, test values only.
const API = 'https://bantay-test.supabase.test'
const SHOTS = shotPath('docs/session-10/shots/S6a')
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const FAMILY = [
  { personId: 'p-mama', displayName: 'Mama', handle: 'mama', provider: 'pin', initials: 'M' },
  { personId: 'p-joy', displayName: 'Ate Joy', handle: 'joy', provider: 'pin', initials: 'AJ' },
  { personId: 'p-ben', displayName: 'Kuya Ben', handle: 'ben', provider: 'pin', initials: 'KB' }
]
const NAMES = [{ first_name: 'Lloyd', initial: '', handle: 'lloyd' }, { first_name: 'Mama', initial: '', handle: 'mama' }, { first_name: 'Papa', initial: '', handle: 'papa' }, { first_name: 'Ate', initial: 'J', handle: 'joy' }, { first_name: 'Kuya', initial: 'B', handle: 'ben' }]
const keys = async (page: Page, digits: string) => { for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click() }

async function mock(page: Page) {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (url.pathname === '/functions/v1/pin-login') {
      const b = req.postDataJSON() as { action?: string; pin?: string }
      if (b.action === 'reset_start') return reply(200, { ok: true, id: 'r1', secret: 'secret-test', code: '4821' })
      if (b.action === 'reset_complete') return reply(409, { ok: false, error: 'not_approved' })
      if (b.pin !== '480193') return reply(401, { ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' })
      return reply(200, { ok: true, session: { access_token: jwt(), refresh_token: 'refresh-test', expires_in: 3600, token_type: 'bearer' } })
    }
    if (url.pathname === '/functions/v1/family-names') return reply(200, NAMES)
    if (url.pathname === '/rest/v1/rpc/family_profiles') return reply(200, FAMILY.map((f) => ({ person_id: f.personId, display_name: f.displayName, handle: f.handle, provider: f.provider })))
    if (url.pathname === '/auth/v1/user') return reply(200, user)
    if (url.pathname === '/rest/v1/rpc/ensure_self_person') return reply(200, '44444444-4444-4444-8444-444444444444')
    if (url.pathname === '/rest/v1/people') return reply(200, { id: 'p-mama', display_name: 'Mama' })
    return reply(404, {})
  })
}
const trust = (page: Page) => page.addInitScript((fam) => localStorage.setItem('bantay.family', JSON.stringify(fam)), FAMILY)

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`join: start-who and start-pin, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#join/abcd1234efgh')
    await expect(page.getByRole('heading', { name: 'Is this you?' })).toBeVisible()
    await expect(page.getByLabel('Who are you?').getByRole('button')).toHaveCount(NAMES.length)
    await expect(page.locator('body')).not.toContainText(/admin/i)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/start-who-${scheme}.png` })
    await page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Mama' }).click()
    await expect(page.getByRole('heading', { name: 'Hi Mama, choose a 6-digit PIN' })).toBeVisible()
    await keys(page, '1357')
    await page.screenshot({ path: `${SHOTS}/start-pin-${scheme}.png` })
  })

  test(`sign-in: start-pinpad, start-wrong, start-forgot, start-approve-wait, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await trust(page)
    await page.goto('/')
    await page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Mama' }).click()
    await expect(page.getByRole('heading', { name: 'Hi Mama' })).toBeVisible()
    await keys(page, '111')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/start-pinpad-${scheme}.png` })

    // five misses in a row: the one-minute wait
    await page.evaluate(() => new Promise<void>((res, rej) => {
      const r = indexedDB.open('bantay')
      r.onerror = () => rej(r.error)
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: 'pin.fail.mama', value: { n: 5, lastAt: Date.now() - 12_000 } }); t.oncomplete = () => res() }
    }))
    await page.reload()
    await page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Mama' }).click()
    await expect(page.getByRole('heading', { name: 'Take a short break' })).toBeVisible()
    await expect(page.getByText(/Try your PIN again in 0:[0-5]\d/)).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/start-wrong-${scheme}.png` })

    await page.getByRole('button', { name: 'Forgot PIN?' }).click()
    await expect(page.getByRole('heading', { name: 'Forgot your PIN?' })).toBeVisible()
    await expect(page.locator('body')).toContainText('Ask a family admin to approve') // SEC-1: only an admin approves
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/start-forgot-${scheme}.png` })

    await page.getByRole('button', { name: /Ask a family admin to approve/ }).click()
    await keys(page, '246810')
    await keys(page, '246810')
    await expect(page.getByRole('heading', { name: 'Asked the family admin' })).toBeVisible()
    await expect(page.getByText('4821')).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/start-approve-wait-${scheme}.png` })
  })

  test(`start-done after the first sign-in, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await trust(page)
    await page.goto('/')
    await page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Mama' }).click()
    await keys(page, '480193')
    await expect(page.getByRole('heading', { name: "You're in, Mama" })).toBeVisible()
    await expect(page.getByText('Step 3 of 3 · then Today')).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/start-done-${scheme}.png` })
  })
}
