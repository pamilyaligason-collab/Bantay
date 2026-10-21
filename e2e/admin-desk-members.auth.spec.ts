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

async function mock(page: Page, calls: Record<string, unknown>[] = []) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const t = url.pathname.replace('/rest/v1/', '')
    const select = url.searchParams.get('select') ?? ''
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const rows = (a: unknown[]) => reply(single ? (a[0] ?? null) : a, 200, { 'content-range': `0-${Math.max(a.length - 1, 0)}/${a.length}` })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/functions/v1/admin-members') {
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
      if (body.action !== 'list') calls.push(body)
      return reply({ ok: true, members: MEMBERS })
    }
    if (url.pathname === '/rest/v1/rpc/admin_usage_summary') return reply([{ user_id: 'u2', last_seen: '2026-10-20T02:00:00Z', events: 12 }])
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return reply([])
    if (t === 'app_roles') return rows([{ role: 'admin', handle: 'admin' }])
    if (t === 'people') return rows(select.includes('birthdate') ? DETAILS : select.includes('auth_user_id') ? PEOPLE : [{ id: 'p1' }])
    if (t === 'carers') return rows(CARERS)
    if (t === 'records_queue') return rows([{ person_id: 'p3', drafts: 2 }])
    return rows([])
  })
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const short = (page: Page, min: number) => page.evaluate((m) => [...document.querySelectorAll<HTMLElement>('button, a[href], select, input:not([type=file]):not([hidden])')]
  .filter((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.wa-top, .wa-side, .wa-foot') && !e.classList.contains('wa-skip'))
  .filter((e) => e.getBoundingClientRect().height < m - 0.5).map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).trim().slice(0, 30)), min)
const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target + ' ' + (n.any[0]?.message ?? '')).join(' | '))
const clean = async (page: Page, min: number) => {
  expect(await sideways(page)).toBe(true)
  expect(await short(page, min)).toEqual([])
  expect(await violations(page)).toEqual([])
}

const SIZES = [{ width: 1280, height: 800 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]
for (const size of SIZES) {
  test(`members list, member page and tabs (${size.width}x${size.height})`, async ({ page }) => {
    const min = size.width < 768 ? 44 : 40
    await page.setViewportSize(size)
    await mock(page)
    await skipOnboarding(page)
    await page.goto('/admin#/members')

    const table = page.getByRole('table')
    await expect(table.getByRole('link', { name: /Test Person/ })).toBeVisible()
    await expect(table.getByText(/^Locked until/)).toBeVisible()
    await expect(table.getByText('No phone')).toBeVisible()
    await expect(table.getByText('2 (1 can edit)')).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Last seen/ })).toBeVisible()
    await clean(page, min)
    if (size.width === 1280 || size.width === 390) await page.screenshot({ path: `test-results/members-list-${size.width}.png` })

    // chips
    await page.getByRole('button', { name: 'Dependents' }).click()
    await expect(table.getByRole('link', { name: /Test Person/ })).toHaveCount(0)
    await page.getByRole('button', { name: /Needs attention/ }).click()
    await expect(table.getByRole('link', { name: /Test Child/ })).toBeVisible() // drafts
    await expect(table.getByRole('link', { name: /Test Person/ })).toBeVisible() // locked
    await page.getByRole('button', { name: 'All' }).click()

    // add member dialog
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByRole('dialog', { name: 'Add member' })).toBeVisible()
    await clean(page, min)
    await page.keyboard.press('Escape')

    // whole row opens the member page
    await page.getByRole('row', { name: /Test Child/ }).getByText('No phone').click()
    await expect(page).toHaveURL(/#\/members\/p3$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Test Child' })).toBeVisible()
    const tabs = page.getByRole('navigation', { name: 'Member sections' })
    await expect(tabs.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByLabel('Birthday')).toHaveValue('2020-01-02')
    const sum = page.getByRole('region', { name: 'Summary' })
    await expect(sum.getByText('O+')).toBeVisible()
    await clean(page, min)
    if (size.width === 1280 || size.width === 390) await page.screenshot({ path: `test-results/members-profile-${size.width}.png` })

    await tabs.getByRole('link', { name: 'Account' }).click()
    await expect(page).toHaveURL(/#\/members\/p3\/account$/)
    await expect(page.getByText('No sign-in for this person.')).toBeVisible()
    await clean(page, min)

    await tabs.getByRole('link', { name: /Carers/ }).click()
    await expect(page.getByText('Can edit', { exact: true })).toBeVisible()
    await expect(page.getByText('Read only', { exact: true })).toBeVisible()
    await clean(page, min)

    for (const [label, url] of [['Records', 'records'], ['IDs', 'ids'], ['History', 'history']] as const) {
      await tabs.getByRole('link', { name: label }).click()
      await expect(page).toHaveURL(new RegExp(`#/members/p3/${url}$`))
      await expect(tabs.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
      expect(await sideways(page)).toBe(true)
    }
  })
}

test('account actions call admin-members with the right body', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const calls: Record<string, unknown>[] = []
  await mock(page, calls)
  await skipOnboarding(page)
  await page.goto('/admin#/members/p2/account')

  await expect(page.getByRole('heading', { level: 1, name: 'Test Person' })).toBeVisible()
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => calls).toContainEqual({ action: 'unlock', userId: 'u2' })

  await page.getByRole('button', { name: 'Reset PIN' }).click()
  await page.getByLabel('PIN (6 digits)').fill('480193')
  await page.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => calls).toContainEqual({ action: 'set_pin', userId: 'u2', pin: '480193' })
  await expect(page.getByLabel('PIN', { exact: true })).toHaveText('480193')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Disable Test Person' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => calls).toContainEqual({ action: 'disable', userId: 'u2', disabled: true })

  // never yourself
  await page.goto('/admin#/members/p1/account')
  await expect(page.getByText(/your own account/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Disable|Enable|Make member|Make admin/ })).toHaveCount(0)
})

test('unsaved profile changes ask before leaving', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mock(page)
  await skipOnboarding(page)
  await page.goto('/admin#/members/p3')
  await page.getByLabel('Address').fill('Test Street 2')
  await page.getByRole('navigation', { name: 'Member sections' }).getByRole('link', { name: 'Account' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page).toHaveURL(/#\/members\/p3$/)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Address')).toHaveValue('Test Street 2') // still here, still edited
  // the sidebar is held too
  await page.getByRole('navigation', { name: 'Admin pages' }).getByRole('link', { name: /Confirm queue/ }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page).toHaveURL(/#\/queue$/)
})

test('dark mode at 1280: list, profile and account have no axe violations', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mock(page)
  await skipOnboarding(page)
  for (const hash of ['members', 'members/p3', 'members/p2/account', 'members/p3/carers']) {
    await page.goto(`/admin#/${hash}`)
    await expect(page.locator('.mb-page')).toBeVisible()
    await expect(page.getByRole('table').or(page.getByRole('navigation', { name: 'Member sections' }))).toBeVisible()
    await page.waitForTimeout(300)
    expect(await violations(page)).toEqual([])
  }
  await page.screenshot({ path: 'test-results/members-dark-1280.png' })
})
