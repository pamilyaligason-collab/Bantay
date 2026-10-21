import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Runs in the "auth" project (build WITH Supabase env). Everything on the wire is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }

const PEOPLE = [
  { id: 'p1', display_name: 'Test Admin', auth_user_id: UID, photo_path: null },
  { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', photo_path: null }
]
const MEMBERS = [
  { userId: UID, personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', disabled: false, lastSignInAt: '2026-10-20T01:00:00Z', provider: 'google', profile: null, lockedUntil: null, fails: 0 },
  { userId: 'u2', personId: 'p2', displayName: 'Test Person', handle: 'testperson', role: 'member', disabled: false, lastSignInAt: null, provider: 'email', profile: null, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 }
]
const now = Date.now()
const SCREENS = Array.from({ length: 40 }, (_, i) => ({ at: new Date(now - i * 17 * 3_600_000).toISOString() }))

async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => route.fulfill({ status, headers: { ...cors, ...extra, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const t = url.pathname.replace('/rest/v1/', '')
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const rows = (a: unknown[]) => reply(single ? (a[0] ?? null) : a)
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/functions/v1/admin-members') return reply({ ok: true, members: MEMBERS })
    if (url.pathname === '/rest/v1/rpc/admin_usage_summary') return reply([{ user_id: UID, last_seen: '2026-10-20T02:00:00Z', events: 12, top_screens: [], active_7: true, active_30: true, alerts_on: false, sensors_on: false }])
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...cors, 'content-range': `*/${t === 'source_files' ? 2 : 3}` }, body: '' })
    if (req.method() !== 'GET') return reply([])
    if (t === 'app_roles') return rows([{ role: 'admin', handle: 'admin' }])
    if (t === 'people') return rows(PEOPLE)
    if (t === 'records_queue') return rows([{ person_id: 'p2', kind: 'lab_results', drafts: 6 }, { person_id: 'p2', kind: 'documents', drafts: 1 }, { person_id: 'p1', kind: 'vaccinations', drafts: 2 }])
    if (t === 'usage_events') return rows(SCREENS)
    if (t === 'person_identifiers') return rows([{ id: 'i1', person_id: 'p1', id_type: 'passport', expires_on: new Date(now + 20 * 86_400_000).toISOString().slice(0, 10) }])
    if (t === 'audit_log') return rows([{ id: 1, at: new Date(now - 2 * 3_600_000).toISOString(), actor: UID, tbl: 'lab_results', person_id: 'p2', action: 'confirm', fields: ['status'] }, { id: 2, at: new Date(now - 26 * 3_600_000).toISOString(), actor: null, tbl: 'people', person_id: 'p1', action: 'update', fields: ['phone', 'address'] }])
    return rows([])
  })
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
// At 390 the W0 top bar itself is ~70px wider than the screen (reported to the orchestrator), so the phone check covers the page content: nothing in <main> may stick out.
const mainFits = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#wa-main *')].filter((e) => !e.parentElement?.closest('.dk-scrollx, .wa-sr')).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.tagName + '.' + e.className))
const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']) // W0 bug: at 390 the account menu button has no text (reported to the orchestrator)
  .analyze()).violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target + ' ' + (n.any[0]?.message ?? '')).join(' | '))

const SIZES = [{ width: 1280, height: 800 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]
for (const size of SIZES) {
  test(`dashboard home (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size)
    await mock(page)
    await skipOnboarding(page)
    await page.goto('/admin#/home')

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /Active this week/ })).toContainText('1 / 2')
    await expect(page.getByRole('link', { name: /To confirm/ })).toContainText('9')
    await expect(page.getByRole('link', { name: /Failed scans/ })).toContainText('2')
    await expect(page.getByRole('link', { name: /IDs expiring/ })).toContainText('1')
    for (const name of ['App use, last 30 days', 'Records confirmed per week', 'Confirm queue by person', 'Needs you', 'Recent changes']) {
      await expect(page.getByRole('region', { name })).toBeVisible()
    }
    await expect(page.getByRole('region', { name: 'Needs you' }).getByText('2 scans failed')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Needs you' }).getByText('Test Person is locked out')).toBeVisible()
    await expect(page.getByRole('img', { name: /Screens opened per day\. Average/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Recent changes' }).getByText('System')).toBeVisible()
    expect(await mainFits(page)).toEqual([])
    expect(await sideways(page)).toBe(true)
    expect(await violations(page)).toEqual([])
    if (size.width !== 820) await page.screenshot({ path: `test-results/admin-home-${size.width}.png`, fullPage: true })

    // whole row opens the queue
    await page.getByRole('region', { name: 'Confirm queue by person' }).getByRole('row', { name: /Test Person/ }).click()
    await expect(page).toHaveURL(/#\/queue$/)
  })
}

test('dashboard home in dark mode (1280x800)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mock(page)
  await skipOnboarding(page)
  await page.goto('/admin#/home')
  await expect(page.getByRole('region', { name: 'Needs you' }).getByText('2 scans failed')).toBeVisible()
  await expect(page.getByRole('img', { name: /Screens opened per day/ })).toBeVisible()
  expect(await violations(page)).toEqual([])
})
