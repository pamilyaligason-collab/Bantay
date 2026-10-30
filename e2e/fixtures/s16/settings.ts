import type { Page } from '@playwright/test'
import { skipOnboarding } from '../../helpers'

// S16 L5 fixtures (auth build, every Supabase call mocked, synthetic people only). `admin` and `member` are the same signed-in phone with a different app role.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
export const NAME = 'Magdalena Concepcion'
const FAMILY = [{ personId: 'p-mama', displayName: NAME, handle: 'mama', provider: 'pin' }, { personId: 'p-lola', displayName: 'Lola', handle: null, provider: 'pin' }]

async function setup(page: Page, role: 'admin' | 'member') {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/rest/v1/rpc/ensure_self_person') return reply('p-mama')
    if (url.pathname === '/rest/v1/carers') return reply(url.searchParams.get('carer_id') ? [{ person_id: 'p-lola' }] : [])
    if (url.pathname === '/rest/v1/people') return reply({ id: 'p-mama', display_name: NAME, consent_at: '2026-10-26T01:00:00Z' })
    if (url.pathname === '/rest/v1/app_roles') return reply({ role, handle: 'mama' })
    return reply([])
  })
  await skipOnboarding(page)
  await page.addInitScript(([session, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify(session))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    localStorage.setItem('bantay.lastPerson', 'p-mama')
  }, [{ access_token: jwt(), refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }, FAMILY] as const)
}

export const admin = (page: Page) => setup(page, 'admin')
export const member = (page: Page) => setup(page, 'member')
