import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Runs in the "auth" project (build WITH Supabase env). Everything on the wire is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

const PEOPLE = [
  { id: 'p1', display_name: 'Test Admin', auth_user_id: UID, photo_path: null },
  { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', photo_path: null },
  { id: 'p3', display_name: 'Test Child', auth_user_id: null, photo_path: null }
]
const DETAILS = [{ id: 'p3', phone: null, birthdate: '2020-01-02', sex: 'female', blood_type: 'O+', address: 'Test Street 1', aliases: [], allergies: ['Test Allergy'], conditions: [] }]
const MEMBERS = [
  { userId: UID, personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', disabled: false, lastSignInAt: '2026-10-20T01:00:00Z', provider: 'google', profile: null, lockedUntil: null, fails: 0 },
  { userId: 'u2', personId: 'p2', displayName: 'Test Person', handle: 'testperson', role: 'member', disabled: false, lastSignInAt: null, provider: 'email', profile: null, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 }
]
const CARERS = [{ carer_id: UID, person_id: 'p3', can_write: true }, { carer_id: 'u2', person_id: 'p3', can_write: false }]

async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const t = url.pathname.replace('/rest/v1/', '')
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const rows = (a: unknown[]) => reply(single ? (a[0] ?? null) : a)
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/functions/v1/admin-members') return reply({ ok: true, members: MEMBERS })
    if (url.pathname === '/rest/v1/rpc/admin_usage_summary') return reply([{ user_id: 'u2', last_seen: '2026-10-20T02:00:00Z', events: 12 }])
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return reply([])
    if (t === 'app_roles') return rows([{ role: 'admin', handle: 'admin' }])
    if (t === 'people') return rows((url.searchParams.get('select') ?? '').includes('birthdate') ? DETAILS : (url.searchParams.get('select') ?? '').includes('auth_user_id') ? PEOPLE : [{ id: 'p1' }])
    if (t === 'carers') return rows(CARERS)
    return rows([])
  })
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const short = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, a[href], select, input:not([type=file]):not([hidden])')]
  .filter((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.dk-nav') === true)
  .filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).trim().slice(0, 30)))
const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target + ' ' + (n.any[0]?.message ?? '')).join(' | '))

const SIZES = [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 820, height: 1180 }]
for (const size of SIZES) {
  test(`members table and people panel (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size)
    await mock(page)
    await skipOnboarding(page)
    await page.goto('/admin#/members')

    const table = page.getByRole('table')
    await expect(table.getByRole('link', { name: 'Test Person' })).toBeVisible()
    await expect(table.getByText(/^Locked until/)).toBeVisible()
    await expect(table.getByRole('button', { name: 'Unlock Test Person' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Events 30 d' })).toBeVisible()
    expect(await sideways(page)).toBe(true)
    expect(await short(page)).toEqual([])
    expect(await violations(page)).toEqual([])

    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByRole('dialog', { name: 'Add member' })).toBeVisible()
    expect(await sideways(page)).toBe(true)
    expect(await short(page)).toEqual([])
    expect(await violations(page)).toEqual([])
    await page.keyboard.press('Escape')

    await page.goto('/admin#/people/p3')
    await expect(page.getByRole('button', { name: 'Open Test Child' })).toBeVisible()
    const panel = page.getByRole('dialog', { name: 'Test Child' })
    await expect(panel).toBeVisible()
    await expect(panel.getByLabel('Birthday')).toHaveValue('2020-01-02')
    await expect(panel.getByText('Can edit')).toBeVisible()
    await expect(panel.getByText('Read only')).toBeVisible()
    expect(await sideways(page)).toBe(true)
    expect(await short(page)).toEqual([])
    expect(await violations(page)).toEqual([])
  })
}
