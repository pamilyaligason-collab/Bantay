import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// Runs in the "auth" project (build WITH Supabase env). Everything on the wire is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

const PEOPLE = [
  { id: 'p1', display_name: 'Test Admin', auth_user_id: UID, created_by: UID, photo_path: null },
  { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', created_by: 'u2', photo_path: null },
  { id: 'p3', display_name: 'Test Child', auth_user_id: null, created_by: UID, photo_path: null },
  { id: 'p4', display_name: 'Test Stranger', auth_user_id: 'u4', created_by: 'u4', photo_path: null }
]
const MEMBERS = [
  { userId: UID, personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', disabled: false, lastSignInAt: null, provider: 'google', profile: null, lockedUntil: null, fails: 0 },
  { userId: 'u2', personId: 'p2', displayName: 'Test Person', handle: 'testperson', role: 'member', disabled: false, lastSignInAt: null, provider: 'email', profile: null, lockedUntil: null, fails: 0 }
]
const CARERS = [{ carer_id: 'u2', person_id: 'p3', can_write: false }, { carer_id: UID, person_id: 'p3', can_write: true }]

async function mock(page: Page, writes: { method: string; path: string; body: unknown }[]) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && url.pathname !== '/functions/v1/admin-members' && !url.pathname.includes('usage_events')) writes.push({ method: req.method(), path: url.pathname, body: req.postDataJSON() })
    if (url.pathname === '/functions/v1/admin-members') return reply({ ok: true, members: MEMBERS })
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return reply([])
    const t = url.pathname.replace('/rest/v1/', '')
    const select = url.searchParams.get('select') ?? ''
    const rows = (a: unknown[]) => reply(a, 200, { 'content-range': `0-${Math.max(a.length - 1, 0)}/${a.length}` })
    if (t === 'app_roles') return rows([{ role: 'admin', handle: 'admin' }])
    if (t === 'people') return rows(select.includes('birthdate') ? [] : PEOPLE)
    if (t === 'carers') return rows(CARERS)
    if (t === 'medications') return rows([{ name: 'Test Med', dose: '1 tab', strength: '5 mg', schedule: ['08:00'], as_needed: false }])
    if (t === 'readings') return rows([{ test: 'bp_sys', value: 128, unit: 'mmHg', taken_at: '2026-10-20T01:00:00Z' }])
    if (t === 'documents') return rows([{ id: 'd1', kind: 'lab', title: 'Test Lab Paper', doc_date: '2026-10-01' }])
    return rows([])
  })
}

const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target + ' ' + (n.any[0]?.message ?? '')).join(' | '))

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`view as member (${size.width}x${size.height} ${scheme})`, async ({ page }) => {
      const writes: { method: string; path: string; body: unknown }[] = []
      await page.setViewportSize(size)
      await page.emulateMedia({ colorScheme: scheme })
      await mock(page, writes)
      await skipOnboarding(page)
      await page.goto('/admin#/members/p2')
      await page.getByRole('button', { name: 'View as Test Person' }).click()
      await expect(page).toHaveURL(/#\/members\/p2\/view-as$/)

      const region = page.getByRole('region', { name: 'Preview of what Test Person sees' })
      await expect(region.getByText('Preview only.')).toBeVisible()
      await expect(region.getByText(/approximation/)).toBeVisible()
      const people = region.getByRole('navigation', { name: /People Test Person can see/ })
      await expect(people.getByRole('button', { name: /Test Person/ })).toBeVisible()
      await expect(people.getByRole('button', { name: /Test Child/ })).toBeVisible() // read-only carer link
      await expect(people.getByRole('button', { name: /Test Stranger/ })).toHaveCount(0)
      await expect(people.getByRole('button', { name: /Test Admin/ })).toHaveCount(0)
      await expect(region.getByTestId('va-hidden')).toContainText('Test Stranger')

      // every phone action is disabled, and no form field exists
      for (const a of ['Log a reading', 'Take a dose', 'Add a medicine', 'Scan a paper']) await expect(region.getByRole('button', { name: a })).toBeDisabled()
      await expect(region.locator('input, textarea, select, form')).toHaveCount(0)

      await people.getByRole('button', { name: /Test Child/ }).click()
      await expect(region.getByText('Test Med')).toBeVisible()
      await expect(region.getByText(/128/)).toBeVisible()
      await expect(region.getByText('Test Lab Paper')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await violations(page)).toEqual([])
      await page.screenshot({ path: shotPath(`docs/session-9/shots/adm-view/view-as-${size.width}-${scheme}.png`) })

      // the only write is the audit RPC, with the person id and nothing else
      const mine = () => writes.filter((w) => !/rpc\/(ensure_self_person|family_profiles|admin_usage_summary|admin_identifiers)$/.test(w.path)) // app boot and read-only RPCs, not part of the preview
      await expect.poll(() => mine().map((w) => w.path)).toEqual(['/rest/v1/rpc/admin_log_view_as'])
      expect(mine()[0]).toEqual({ method: 'POST', path: '/rest/v1/rpc/admin_log_view_as', body: { p_person: 'p2' } })

      // back out
      await page.getByRole('button', { name: 'Back to member page' }).click()
      await expect(page).toHaveURL(/#\/members\/p2$/)
      expect(mine()).toHaveLength(1)
    })
  }
}
