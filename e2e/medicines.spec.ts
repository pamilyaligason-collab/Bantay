import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Health > Medicines, signed in as p1 (runs in the "auth" project; build WITH Supabase env). All traffic is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const SHOTS = '/tmp/claude-0/-home-user-Bantay/823b848b-3cb6-5277-ba18-19ff3b649740/scratchpad/m2-shots'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const FAMILY = [{ personId: 'p1', displayName: 'Test Person', handle: null, provider: 'pin' }]
const PERSON = { id: 'p1', display_name: 'Test Person', phone: null, birthdate: null, blood_type: null, allergies: [], conditions: [], medicines: [], photo_path: null, updated_at: '2026-10-10T10:00:00Z' }
const row = (id: string, name: string, times: string[], over: Record<string, unknown> = {}) => ({
  id: `srv-${id}`, client_id: `cm-${id}`, person_id: 'p1', name, strength: '500 mg', dose: '1 tablet', schedule: { v: 1, times }, as_needed: false, med_status: 'active', status: 'confirmed',
  origin: 'rx', deleted_at: null, updated_at: '2026-10-10T10:00:00Z', ...over
})
const SEED = [
  row('met', 'Metformin', ['08:00', '20:00'], { schedule: { v: 1, times: ['08:00', '20:00'], review: true, review_since: '2026-10-20' }, started_on: '2025-11-14' }),
  row('aml', 'Amlodipine', ['08:00'], { strength: '5 mg' }),
  row('ato', 'Atorvastatin', [], { strength: '20 mg', schedule: { v: 1, times: [], needs_time: true, review: true } }),
  row('vit', 'Vitamin B', ['08:00'], { strength: null, med_status: 'paused' })
]
type Post = { path: string; body: Record<string, unknown> }

async function setup(page: Page, scheme: 'light' | 'dark', posts: Post[]) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: scheme })
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
      posts.push({ path: t, body })
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
const sent = (posts: Post[], path: string) => posts.filter((p) => p.path === path).map((p) => p.body)
const shot = (page: Page, name: string, scheme: string) => page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }))

for (const scheme of ['light', 'dark'] as const) {
  test(`mark taken, edit to twice a day, delete and undo (${scheme})`, async ({ page }) => {
    test.setTimeout(90_000)
    const posts: Post[] = []
    await setup(page, scheme, posts)
    await page.goto('/#health/meds')
    await expect(page.locator('h1')).toHaveText('Medicines')
    const today = page.getByTestId('meds-today')
    await expect(today).toContainText('Amlodipine 5 mg')
    await expect(page.getByTestId('meds-active').getByText('Set a time')).toBeVisible()
    await expect(page.getByTestId('meds-paused')).toContainText('Vitamin B')
    await expect(page.getByText('From a prescription dated Nov 2025. Still taking it?')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await shot(page, 'medicines', scheme)
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])

    // mark taken
    await today.getByRole('button', { name: 'Take Amlodipine 8:00 AM' }).click()
    await expect(today.getByText(/^Taken \d/).first()).toBeVisible()
    await expect.poll(() => sent(posts, 'meds_taken').length).toBe(1)
    expect(sent(posts, 'meds_taken')[0]).toMatchObject({ medication_id: 'srv-aml', slot: '08:00', person_id: 'p1' })

    // edit to twice a day (the edit sheet opens from the medicine's detail screen, not from the list row)
    await page.getByTestId('meds-active').getByRole('link', { name: /^Amlodipine 5 mg/ }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Edit medicine' })
    await expect(sheet).toBeVisible()
    await page.waitForTimeout(600) // the sheet slides in
    await shot(page, 'edit-sheet', scheme)
    expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await sheet.getByRole('button', { name: 'Evening 8:00 PM' }).click()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to Medicines' }).click()
    await expect(today.locator('[data-med="Amlodipine"]')).toHaveCount(2)
    await expect.poll(() => sent(posts, 'medications').filter((m) => m.name === 'Amlodipine').length).toBeGreaterThan(0)
    expect(sent(posts, 'medications').filter((m) => m.name === 'Amlodipine').pop()).toMatchObject({ client_id: 'cm-aml', schedule: { v: 1, times: ['08:00', '20:00'] } })

    // delete and undo
    await page.getByTestId('meds-active').getByRole('link', { name: /^Amlodipine 5 mg/ }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('dialog', { name: 'Edit medicine' }).getByRole('button', { name: 'Delete' }).click()
    const toast = page.getByRole('status').filter({ hasText: 'Amlodipine deleted.' })
    await expect(toast).toBeVisible()
    await expect(page.getByTestId('med-gone')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
    await page.waitForTimeout(400)
    await shot(page, 'undo-toast', scheme)
    await expect.poll(() => sent(posts, 'medications').some((m) => m.client_id === 'cm-aml' && typeof m.deleted_at === 'string')).toBe(true)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByTestId('med-facts')).toBeVisible()
    await page.getByRole('link', { name: 'Back to Medicines' }).click()
    await expect(page.getByTestId('meds-active')).toContainText('Amlodipine')
    await expect.poll(() => sent(posts, 'medications').filter((m) => m.client_id === 'cm-aml').pop()?.deleted_at).toBeNull()
  })
}

test('review: Yes clears the line, Stopped moves the medicine to Past', async ({ page }) => {
  const posts: Post[] = []
  await setup(page, 'light', posts)
  await page.goto('/#health/meds')
  await page.getByRole('button', { name: 'Yes, still taking Metformin' }).click()
  await expect(page.getByRole('button', { name: 'Yes, still taking Metformin' })).toHaveCount(0)
  await page.getByRole('button', { name: 'I stopped Atorvastatin' }).click()
  await page.getByRole('dialog', { name: 'Stop reminders for Atorvastatin?' }).getByRole('button', { name: 'Stop reminders' }).click()
  await expect(page.getByTestId('meds-past')).toContainText('Atorvastatin')
  await expect.poll(() => sent(posts, 'medications').some((m) => m.name === 'Atorvastatin' && m.med_status === 'stopped')).toBe(true)
})
