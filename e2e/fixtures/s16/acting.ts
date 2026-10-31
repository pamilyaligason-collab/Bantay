import type { Page } from '@playwright/test'

// S16 L6 fixtures (contracts C-11): `adminWriter`, `adminNoLink`, `member`. Signed in as a made-up user; PostgREST and RPCs are mocked; all data is invented.
// The mock records every non-GET request in `writes` and every admin_log_view_as call in `audits`.
export const API = 'https://bantay-test.supabase.test'
export type Fixture = { role: 'admin' | 'member'; carerLink: 'writer' | 'reader' | 'none' }
export const adminWriter: Fixture = { role: 'admin', carerLink: 'writer' }
export const adminNoLink: Fixture = { role: 'admin', carerLink: 'none' }
export const member: Fixture = { role: 'member', carerLink: 'none' }

export const UID = '66666666-6666-4666-8666-666666666666'
export const ME = { id: 'p-me', display_name: 'Lloyd' }
export const MAMA = { id: 'p-mama', display_name: 'Mama' }
const PEOPLE = [ME, MAMA]
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-6@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

export type Seen = { writes: { method: string; path: string; body: unknown }[]; audits: unknown[] }

export async function mockActing(page: Page, f: Fixture): Promise<Seen> {
  const seen: Seen = { writes: [], audits: [] }
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    localStorage.setItem('bantay.onboarded', '1')
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/rest/v1/rpc/admin_log_view_as') { seen.audits.push(req.postDataJSON()); return f.role === 'admin' ? reply(null, 204) : reply({ message: 'not_admin' }, 400) }
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && !url.pathname.includes('usage_events')) seen.writes.push({ method: req.method(), path: url.pathname, body: req.postDataJSON() })
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return reply([])
    const t = url.pathname.replace('/rest/v1/', '')
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: ME.id }] : PEOPLE.map((p) => ({ ...p, auth_user_id: p.id === ME.id ? UID : null, created_by: UID, archived_at: null, photo_path: null })))
    if (t === 'app_roles') return reply([{ role: f.role, handle: null }])
    if (t === 'carers') return reply(f.carerLink === 'none' ? [] : [{ carer_id: UID, person_id: MAMA.id, can_write: f.carerLink === 'writer' }])
    return reply([])
  })
  return seen
}

/** Opens the "View as" picker from Settings (the row lives on the Settings overview or its Family group). */
export async function openPicker(page: Page): Promise<void> {
  for (const hash of ['#me', '#me/family']) {
    await page.goto(`/${hash}`)
    const row = page.getByTestId('viewas-row')
    await page.locator('h1').first().waitFor()
    if (await row.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)) { await row.click(); return }
  }
  throw new Error('View as row not found in Settings') // L5 mounts it; a missing row is a failure, never a skip
}
