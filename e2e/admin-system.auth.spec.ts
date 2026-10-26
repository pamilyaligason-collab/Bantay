import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S8 MONITOR: System health, the dashboard "alerts seen" line and the broadcast copy. Runs in the "auth" project (build WITH Supabase env).
// Everything on the wire is mocked; synthetic data only. Shots for the mockup compare (admin-system, admin-home, admin-broadcast) go to docs/session-10/shots/s8/.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }
const SHOTS = 'docs/session-10/shots/s8'

const now = Date.now()
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString()
const manila = (msAgo = 0) => new Date(now - msAgo + 8 * 3_600_000).toISOString().slice(0, 10)
const PEOPLE = [
  { id: 'p1', display_name: 'Test Admin', auth_user_id: UID, photo_path: null },
  { id: 'p2', display_name: 'Test Mama', auth_user_id: 'u2', photo_path: null },
  { id: 'p3', display_name: 'Test Papa', auth_user_id: 'u3', photo_path: null },
  { id: 'p4', display_name: 'Test Ben', auth_user_id: 'u4', photo_path: null }
]
const MEMBERS = PEOPLE.map((p, i) => ({ userId: p.auth_user_id, personId: p.id, displayName: p.display_name, handle: i ? `t${i}` : null, role: i ? 'member' : 'admin', disabled: false, lastSignInAt: '2026-10-20T01:00:00Z', provider: 'google', profile: null, lockedUntil: null, fails: 0 }))
const PHONES = [
  { user_id: 'u2', platform: 'android', app_version: '2.3.0', alarms_ok: true, notif_ok: true, exact_ok: true, battery_ok: true, call_ok: true, oem: null, last_open_at: iso(90), alarms_checked_at: iso(45) },
  { user_id: 'u3', platform: 'android', app_version: '2.3.0', alarms_ok: false, notif_ok: true, exact_ok: true, battery_ok: false, call_ok: true, oem: 'Xiaomi', last_open_at: iso(90), alarms_checked_at: iso(45) },
  { user_id: 'u4', platform: 'web', app_version: null, alarms_ok: null, notif_ok: null, exact_ok: null, battery_ok: null, call_ok: null, oem: null, last_open_at: iso(60 * 24 * 9), alarms_checked_at: null }
]
const days14 = Array.from({ length: 14 }, (_, i) => manila((13 - i) * 86_400_000))
const KPIS = {
  today: manila(),
  active_members: { cur: 3, prev: 4 }, screens: { cur: 210, prev: 180 }, doses_logged: { cur: 61, prev: 58 }, readings_logged: { cur: 14, prev: 9 }, client_errors: { cur: 5, prev: 2 },
  alerts: {
    sent: 74, due_1h: 74, seen: 74, seen_1h: 71, unseen_by_kind: { phone_health: 2, hazard: 1 },
    by_day: days14.map((day, i) => ({ day, total: 6, seen_1h: i === 10 ? 4 : 6 }))
  }
}

async function mock(page: Page, opts: { jobMinAgo?: number; alerts?: boolean } = {}) {
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
    if (url.pathname === '/rest/v1/rpc/admin_usage_summary') return reply([{ user_id: UID, last_seen: iso(30), events: 12, top_screens: [], active_7: true, active_30: true, alerts_on: false, sensors_on: false }])
    if (url.pathname === '/rest/v1/rpc/admin_weekly_kpis') return reply(opts.alerts === false ? { ...KPIS, alerts: null } : KPIS)
    if (url.pathname === '/rest/v1/rpc/admin_pending_migrations') return reply(['0033'])
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...cors, 'content-range': '*/0' }, body: '' })
    if (req.method() !== 'GET') return reply([])
    if (t === 'app_roles') return rows([{ role: 'admin', handle: 'admin' }])
    if (t === 'people') return rows(PEOPLE)
    if (t === 'phone_health') return rows(PHONES)
    if (t === 'job_runs') { // newest run per job; records-extract is the stale one
      const job = (url.searchParams.get('job') ?? '').replace('eq.', '')
      const minAgo = job === 'records-extract' ? (opts.jobMinAgo ?? 7) : 6
      return rows([{ job, ran_at: iso(minAgo), ok: true }])
    }
    if (t === 'client_errors') return rows([
      { where_: 'window.onerror', message_hash: 'a1', app_version: '2.3.0', count: 3, day: manila() },
      { where_: 'unhandledrejection', message_hash: 'b2', app_version: '2.3.0', count: 1, day: manila(86_400_000) },
      { where_: 'window.onerror', message_hash: 'a1', app_version: '2.2.0', count: 2, day: manila(2 * 86_400_000) }
    ])
    if (t === 'records_queue') return rows([{ person_id: 'p2', kind: 'lab_results', drafts: 12 }])
    return rows([])
  })
}

const mainFits = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#wa-main *')].filter((e) => !e.parentElement?.closest('.dk-scrollx, .wa-sr')).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.tagName + '.' + e.className))
const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target + ' ' + (n.any[0]?.message ?? '')).join(' | '))

for (const scheme of ['light', 'dark'] as const) {
  test(`system health page (390x844, ${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await mock(page, { jobMinAgo: 45 })
    await skipOnboarding(page)
    await page.goto('/admin#/system')
    await expect(page.getByRole('heading', { name: 'System health', level: 1 })).toBeVisible()
    await expect(page.getByText('96%')).toBeVisible()
    const phones = page.getByRole('region', { name: 'Alarms per phone' })
    await expect(phones.getByText(/Xiaomi battery saver is on, alarms will be late/)).toBeVisible()
    await expect(phones.getByText(/Browser app: no alarms/)).toBeVisible()
    const jobs = page.getByRole('region', { name: 'Scheduled jobs' })
    await expect(jobs.getByText(/Stopped, last ran/)).toBeVisible() // records-extract 45 min ago is red
    await expect(page.getByRole('region', { name: 'Alerts nobody opened, last 7 days' }).getByText('Phone warnings')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Database updates waiting' }).getByText('0033')).toBeVisible()
    await expect(page.getByText(/Lowest: .*, 67%/)).toBeVisible() // 4 of 6 on one day
    expect(await mainFits(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${SHOTS}/admin-system-390-${scheme}.png`, fullPage: true })
    if (scheme === 'light') expect(await violations(page)).toEqual([])
  })

  test(`dashboard home with the seen line (390x844, ${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await mock(page)
    await skipOnboarding(page)
    await page.goto('/admin#/home')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    const line = page.locator('.hm-seen')
    await expect(line).toContainText('96% of alerts opened within 1 hour (71 of 74), last 7 days · 3 not opened yet')
    await expect(line.getByRole('link', { name: 'System health' })).toHaveAttribute('href', '#/system')
    expect(await mainFits(page)).toEqual([])
    await page.screenshot({ path: `${SHOTS}/admin-home-390-${scheme}.png`, fullPage: true })
  })

  test(`broadcast copy on the phone admin (390x844, ${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await mock(page)
    await skipOnboarding(page)
    await page.goto('/#admin')
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Safety broadcast' }) })
    await expect(section).toContainText('In the app for everyone; browser users also get a notification')
    await expect(section).not.toContainText('every family phone')
    await section.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/admin-broadcast-390-${scheme}.png` })
  })
}

test('system health: the sidebar dot shows a red job, the page is reachable by g then s, and alert reach says not available before 0030', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mock(page, { jobMinAgo: 45, alerts: false })
  await skipOnboarding(page)
  await page.goto('/admin#/home')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /System health/ })).toContainText('1') // one red job
  await expect(page.locator('.hm-seen')).toHaveCount(0) // reach unknown: nothing shown, never 0%
  await page.keyboard.press('g'); await page.keyboard.press('s')
  await expect(page).toHaveURL(/#\/system$/)
  await expect(page.getByText('Not available yet').first()).toBeVisible()
  await expect(page.getByText('0%')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/admin-system-1280-light.png`, fullPage: true })
})
