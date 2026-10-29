import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Session 14 lane M: Medicines list rows (stock, Refill in N days, week counter), the medicine detail, and the edit sheet opening from inside it.
// Runs in the "auth" project; all traffic is mocked; synthetic data only. Shots only when S14_SHOTS is set (ML-32).
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const SHOTS = process.env.S14_SHOTS
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const FAMILY = [{ personId: 'p1', displayName: 'Test Person', handle: null, provider: 'pin' }]
const PERSON = { id: 'p1', display_name: 'Test Person', phone: null, birthdate: null, blood_type: null, allergies: [], conditions: [], medicines: [], photo_path: null, updated_at: '2026-10-10T10:00:00Z' }
const nowIso = new Date().toISOString()
const row = (id: string, name: string, times: string[], over: Record<string, unknown> = {}) => ({
  id: `srv-${id}`, client_id: `cm-${id}`, person_id: 'p1', name, strength: '5 mg', dose: '1 tablet', schedule: { v: 1, times }, as_needed: false, med_status: 'active', status: 'confirmed',
  origin: 'rx', deleted_at: null, updated_at: '2026-10-10T10:00:00Z', stock_unit: 'tablets', stock_set_at: nowIso, started_on: '2026-10-01', ...over
})
const SEED = [
  row('aml', 'Amlodipine', ['08:00'], { stock_qty: 6, per_day: 1 }),
  row('los', 'Losartan', ['09:00'], { strength: '50 mg', stock_qty: 24, per_day: 1 }),
  row('par', 'Paracetamol', [], { strength: '500 mg', as_needed: true })
]

async function setup(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    localStorage.setItem('bantay.onboarded', '1')
  }, [jwt(), user, FAMILY] as const)
  const store = new Map<string, Record<string, unknown>>(SEED.map((m) => [m.client_id, m]))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      if (t === 'medications') store.set(body.client_id as string, { ...store.get(body.client_id as string), ...body, updated_at: new Date().toISOString() })
      return route.fulfill({ status: 201, headers: cors })
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, headers: cors })
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'people') return reply([PERSON])
    if (t === 'medications') return reply([...store.values()])
    return reply([])
  })
}
const shot = async (page: Page, name: string) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }) } }
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('list rows show stock, open the detail, and the edit sheet opens from inside it', async ({ page }) => {
  test.setTimeout(90_000)
  await setup(page)
  await page.goto('/#health/meds')
  await expect(page.locator('h1')).toHaveText('Medicines')
  const active = page.getByTestId('meds-active')

  // list row facts: stock line and Refill chip (amber under 7 days), a calm day count when it lasts, nothing for as-needed
  const aml = active.getByRole('link', { name: /^Amlodipine 5 mg/ })
  await expect(aml.getByTestId('med-stock-line')).toHaveText('6 tablets left')
  await expect(aml.getByTestId('med-days')).toHaveText('Refill in 6 days')
  await expect(aml.getByTestId('med-days')).toHaveClass(/warn/)
  const los = active.getByRole('link', { name: /^Losartan 50 mg/ })
  await expect(los.getByTestId('med-days')).toHaveText('24 days left')
  await expect(los.getByTestId('med-days')).not.toHaveClass(/warn/)
  await expect(active.getByRole('link', { name: /^Paracetamol/ }).getByTestId('med-days')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await shot(page, 'meds-list')

  // open the detail
  await aml.click()
  await expect(page).toHaveURL(/#health\/med\/srv-aml$/)
  await expect(page.locator('h1')).toHaveText('Amlodipine 5 mg')
  await expect(page.getByTestId('med-facts')).toContainText('Every day at 8:00 AM')
  await expect(page.getByTestId('med-stock')).toContainText('6 tablets · 6 days left')
  await expect(page.getByText(/Rings at/)).toHaveCount(0) // the web build schedules no alarms
  await expect(page.getByText('Dose alarms ring only in the phone app, not on the web version.')).toBeVisible()
  await expect(page.getByTestId('med-week').getByRole('listitem')).toHaveCount(7)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByTestId('med-week').scrollIntoViewIfNeeded()
  await shot(page, 'meds-detail')

  // edit from inside the detail
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit medicine' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Evening 8:00 PM' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('med-facts')).toContainText('8:00 AM, 8:00 PM')

  // back to the list
  await page.getByRole('link', { name: 'Back to Medicines' }).click()
  await expect(page).toHaveURL(/#health\/meds$/)
  await expect(page.locator('h1')).toHaveText('Medicines')
})

test('list and detail do not scroll sideways at 200% text zoom (195px wide)', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 195, height: 844 })
  await page.goto('/#health/meds')
  await expect(page.getByTestId('meds-active')).toBeVisible()
  expect(await noSideways(page)).toBe(true)
  await page.getByTestId('meds-active').getByRole('link', { name: /^Amlodipine 5 mg/ }).click()
  await expect(page.getByTestId('med-week')).toBeVisible()
  expect(await noSideways(page)).toBe(true)
})
