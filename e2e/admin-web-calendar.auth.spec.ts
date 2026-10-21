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
  { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', photo_path: null }
]
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) // Manila day
const at = (time: string) => new Date(`${today}T${time}:00+08:00`).toISOString()
const TABLES: Record<string, unknown[]> = {
  people: PEOPLE,
  app_roles: [{ role: 'admin', handle: 'admin' }],
  family_events: [{ id: 'e1', title: 'Test clinic visit', starts_at: at('10:00'), ends_at: null, all_day: false, person_id: 'p2' }, { id: 'e2', title: 'Test family lunch', starts_at: at('00:00'), ends_at: null, all_day: true, person_id: null }],
  family_tasks: [{ id: 't1', title: 'Test chore', due: today, assignee_person_id: 'p1', done: false }],
  appointments: [{ id: 'a1', person_id: 'p2', starts_at: at('14:00'), due_on: null, provider: 'Dr Test', facility: null, purpose: null, appt_status: 'planned', status: 'confirmed' }],
  medications: [{ id: 'm1', person_id: 'p2', name: 'Test Medicine', strength: '5 mg', schedule: { v: 1, times: ['08:00', '20:00'] }, as_needed: false, med_status: 'active', deleted_at: null, status: 'confirmed' }]
}

async function mock(page: Page, posts: { table: string; body: unknown }[] = []) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const t = url.pathname.replace('/rest/v1/', '')
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/functions/v1/admin-members') return reply({ ok: true, members: [] })
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() === 'POST') { posts.push({ table: t, body: req.postDataJSON() }); return reply(single ? { id: 'new-1' } : [{ id: 'new-1' }], 201) }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return reply([])
    const rows = t === 'people' && !(url.searchParams.get('select') ?? '').includes('auth_user_id') ? [{ id: 'p1' }] : (TABLES[t] ?? [])
    return reply(single ? (rows[0] ?? null) : rows)
  })
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
// Targets inside the page body (not the shell): 40px on desktop, 44px on tablet and phone. Checkboxes are reached through their 40px label.
const short = (page: Page, min: number) => page.evaluate((m) => [...document.querySelectorAll<HTMLElement>('.wa-main button, .wa-main a[href], .wa-main select, .wa-main input:not([type=file]):not([type=checkbox]), .dk-panel button, .dk-panel select, .dk-panel input:not([type=checkbox])')]
  .filter((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
  .filter((e) => e.getBoundingClientRect().height < m - 0.5).map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).trim().slice(0, 30)), min)
const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target + ' ' + (n.any[0]?.message ?? '')).join(' | '))

const SIZES = [{ width: 1280, height: 800 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]
for (const size of SIZES) {
  test(`calendar month, week and agenda (${size.width}x${size.height})`, async ({ page }) => {
    const min = size.width >= 1280 ? 40 : 44
    await page.setViewportSize(size)
    await mock(page)
    await skipOnboarding(page)
    await page.goto('/admin#/calendar')

    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Month', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: /^Today, / })).toBeVisible()
    if (size.width >= 768) await expect(page.getByText('Test family lunch').first()).toBeVisible()
    expect(await sideways(page)).toBe(true)
    expect(await short(page, min)).toEqual([])
    expect(await violations(page)).toEqual([])
    if (size.width !== 820) await page.screenshot({ path: `test-results/calendar-month-${size.width}.png`, fullPage: true })

    await page.getByRole('button', { name: /^Today, / }).click()
    const dayPanel = page.getByRole('dialog')
    await expect(dayPanel.getByText('Test clinic visit')).toBeVisible()
    await expect(dayPanel.getByRole('button', { name: 'Edit times' }).first()).toBeVisible()
    expect(await sideways(page)).toBe(true)
    expect(await violations(page)).toEqual([])
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Week', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Week', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: /Test clinic visit/ }).first()).toBeVisible()
    expect(await sideways(page)).toBe(true)
    expect(await short(page, min)).toEqual([])
    expect(await violations(page)).toEqual([])
    if (size.width !== 820) await page.screenshot({ path: `test-results/calendar-week-${size.width}.png`, fullPage: true })

    await page.getByRole('link', { name: 'Agenda', exact: true }).click()
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Test chore' })).toBeVisible()
    expect(await sideways(page)).toBe(true)
    expect(await short(page, min)).toEqual([])
    expect(await violations(page)).toEqual([])
  })
}

test('calendar in dark mode passes axe (1280x800)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mock(page)
  await skipOnboarding(page)
  await page.goto('/admin#/calendar')
  await expect(page.getByText('Test family lunch').first()).toBeVisible()
  expect(await violations(page)).toEqual([])
  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Test chore' })).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('add event sends the right insert and offers Undo', async ({ page }) => {
  const posts: { table: string; body: unknown }[] = []
  await page.setViewportSize({ width: 1280, height: 800 })
  await mock(page, posts)
  await skipOnboarding(page)
  await page.goto('/admin#/calendar')
  await expect(page.getByText('Test family lunch').first()).toBeVisible()
  await page.getByRole('button', { name: 'New' }).click()
  await page.getByRole('menuitem', { name: 'Event' }).click()
  const form = page.getByRole('dialog', { name: 'New event' })
  await form.getByLabel('Title').fill('Test birthday dinner')
  await form.getByLabel('Date').fill(today)
  await form.getByRole('checkbox', { name: 'All day' }).uncheck()
  await form.getByLabel('Starts').fill('18:30')
  await form.getByLabel('For').selectOption('p2')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Event added')).toBeVisible()
  expect(posts).toHaveLength(1)
  expect(posts[0].table).toBe('family_events')
  const body = posts[0].body as Record<string, unknown>
  expect(Object.keys(body).sort()).toEqual(['all_day', 'client_id', 'created_by', 'ends_at', 'person_id', 'starts_at', 'title'])
  expect(body).toMatchObject({ title: 'Test birthday dinner', created_by: UID, all_day: false, person_id: 'p2', ends_at: null, starts_at: at('18:30') })
  expect(String(body.client_id)).toMatch(/^[0-9a-f-]{36}$/)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
})

// The Schedule and reminders card is covered by ScheduleCard.test.tsx: Home (W1) mounts it, and on the W0 base Home is still a stub.
