import type { Page } from '@playwright/test'

// Shared by the signed-in Health specs (auth project). Signed in as a made-up member; PostgREST is mocked; all data is invented.
export const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const nowSec = (until?: string) => Math.floor(Math.max(Date.now(), until ? Date.parse(until) : 0) / 1000) // a spec that freezes the page clock later than now passes that time so the token stays valid
const jwt = (until?: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: nowSec(until) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Lloyd' }, { id: 'ma', display_name: 'Ma' }, { id: 'pa', display_name: 'Pa' }]

export async function mock(page: Page, until?: string) {
  await page.addInitScript(([token, u, exp]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: u }))
  }, [jwt(until), user, nowSec(until) + 3600] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-20T10:00', temperature_2m: 34.2, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE) // maybeSingle() asks for a list and takes the first row
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }])
    return reply([])
  })
}
