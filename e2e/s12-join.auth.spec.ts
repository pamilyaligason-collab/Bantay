import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S12 lane B JOIN shots, 390x844 light and dark: the invite link states (start-who with one name, used, ended, too many tries, not working),
// start-pin, and the admin "Invite link" copy sheet. Filename ends in .auth.spec: only that project builds with Supabase env. All traffic is mocked.
// The auth build sets VITE_JOIN_STUB=1, so the claim step itself is a stub here; the real joinPort is covered by pinLogin.test.ts and the SQL/deno tests.
// The clock is frozen so a rerun rewrites no committed PNG (ML-32).
const API = 'https://bantay-test.supabase.test'
const SHOTS = 'docs/session-12/shots/B'
const UID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-10-27T01:00:00Z')
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const keys = async (page: Page, digits: string) => { for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click() }

// the one token per state; family-names answers by the token in the address
const LINKS = {
  open: 'openlink0123456789',
  used: 'usedlink0123456789',
  ended: 'endedlink012345678',
  tries: 'trieslink012345678',
  bad: 'badlink00123456789'
} as const

async function mockJoin(page: Page) {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (url.pathname === '/functions/v1/family-names') {
      const t = url.searchParams.get('invite')
      if (t === LINKS.open) return reply(200, [{ first_name: 'Nene', initial: 'C', handle: 'nene' }])
      const why = (Object.entries(LINKS).find(([, v]) => v === t)?.[0]) ?? 'bad'
      return reply(404, { ok: false, why })
    }
    return reply(404, {})
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`join: one name, then the PIN, ${scheme}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockJoin(page)
    await page.goto(`/#join/${LINKS.open}`)
    await expect(page.getByRole('heading', { name: 'Is this you?' })).toBeVisible()
    const list = page.getByLabel('Who are you?')
    await expect(list.getByRole('button')).toHaveCount(1) // the link names one member, never the family
    await expect(list.getByRole('button')).toContainText('Nene C.')
    await expect(page.locator('body')).not.toContainText(/admin/i)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${SHOTS}/join-who-${scheme}.png` })
    await list.getByRole('button').click()
    await expect(page.getByRole('heading', { name: 'Hi Nene, choose a 6-digit PIN' })).toBeVisible()
    await keys(page, '1357')
    await page.screenshot({ path: `${SHOTS}/join-pin-${scheme}.png` })
  })

  for (const [state, text] of [['used', /already used, or a newer link replaced it/], ['ended', /ended\. Links work for 7 days/], ['tries', /Too many tries on this link/], ['bad', /invite link is not working/]] as const) {
    test(`join: link ${state}, ${scheme}`, async ({ page }) => {
      await page.clock.setFixedTime(NOW)
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: 390, height: 844 })
      await mockJoin(page)
      await page.goto(`/#join/${LINKS[state]}`)
      await expect(page.getByText(text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Back to sign in' })).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.screenshot({ path: `${SHOTS}/join-${state}-${scheme}.png` })
    })
  }

  test(`admin: Invite link copy sheet, ${scheme}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    const calls: string[] = []
    await page.addInitScript(([token, u]) => {
      localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: u }))
    }, [jwt(), user] as const)
    await page.route(`${API}/**`, async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      const t = url.pathname.replace('/rest/v1/', '')
      const select = url.searchParams.get('select') ?? ''
      const rows = (a: unknown[]) => reply(a, 200, { 'content-range': `0-${Math.max(a.length - 1, 0)}/${a.length}` })
      if (url.pathname === '/auth/v1/user') return reply(user)
      if (url.pathname === '/functions/v1/admin-members') {
        return reply({ ok: true, members: [
          { userId: UID, personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', disabled: false, lastSignInAt: '2026-10-26T01:00:00Z', provider: 'google', profile: null },
          { userId: 'u2', personId: 'p2', displayName: 'Nene Cruz', handle: 'nene', role: 'member', disabled: false, lastSignInAt: null, provider: 'email', profile: null },
          { userId: 'u3', personId: 'p3', displayName: 'Tata Reyes', handle: 'tata', role: 'member', disabled: false, lastSignInAt: '2026-10-25T01:00:00Z', provider: 'email', profile: null }
        ] })
      }
      if (url.pathname === '/rest/v1/rpc/admin_create_invite') { calls.push(JSON.stringify(req.postDataJSON())); return reply('TESTTOKEN0123456789abcdefghijklmnopqrstuv') }
      if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
      if (!url.pathname.startsWith('/rest/v1/') || req.method() !== 'GET') return reply([])
      if (t === 'app_roles') return rows([{ role: 'admin', handle: 'admin' }])
      if (t === 'people') return rows(select.includes('auth_user_id') ? [
        { id: 'p1', display_name: 'Test Admin', auth_user_id: UID, photo_path: null },
        { id: 'p2', display_name: 'Nene Cruz', auth_user_id: 'u2', photo_path: null },
        { id: 'p3', display_name: 'Tata Reyes', auth_user_id: 'u3', photo_path: null }] : [{ id: 'p1' }])
      return rows([])
    })
    await skipOnboarding(page)
    await page.goto('/admin#/members')
    const table = page.getByRole('table')
    await expect(table.getByRole('link', { name: /Nene Cruz/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Invite link for/ })).toHaveCount(1) // only Nene: Tata has signed in, the admin is Google
    await page.getByRole('button', { name: 'Invite link for Nene Cruz' }).click()
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    const box = page.getByRole('textbox', { name: 'Invite link' })
    await expect(box).toHaveValue('https://bantay.pages.dev/#join/TESTTOKEN0123456789abcdefghijklmnopqrstuv')
    expect(calls).toEqual(['{"p_user":"u2"}'])
    await expect(page.getByText(/works once and ends in 7 days/)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${SHOTS}/admin-invite-sheet-${scheme}.png` })
  })
}
