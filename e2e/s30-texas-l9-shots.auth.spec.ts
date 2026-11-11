import { test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S30 L9 evidence shots, auth build (PostgREST mocked, invented people): the family map with one member in Texas and the Alerts settings. No assertions about the new features,
// so the same file runs on the base commit (BEFORE) and the lane (AFTER). Only runs when S30_SHOTS=<dir>.
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S30_SHOTS
test.skip(!SHOTS, 'shots only with S30_SHOTS')
test.use({ serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/Chicago' })

const API = 'https://bantay-test.supabase.test'
const UID = '77777777-7777-4777-8777-777777777777'
const CLOCK = '2026-11-11T02:00:00Z'
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }]
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [
  { id: 'me', display_name: 'Rey', auth_user_id: UID, tz: 'America/Chicago' },
  { id: 'ma', display_name: 'Mama Rosa', auth_user_id: 'u-ma', tz: 'Asia/Manila' },
  { id: 'jo', display_name: 'Joy', auth_user_id: 'u-jo', tz: 'Asia/Manila' }
]
const FAMILY = PEOPLE.map((p) => ({ personId: p.id, displayName: p.display_name }))
const PLACES = [
  { person_id: 'ma', lat: 9.6457, lon: 123.878, accuracy_m: 20, fixed_at: '2026-11-11T01:55:00Z', battery_pct: 80, charging: false },
  { person_id: 'jo', lat: 6.2015, lon: 125.1878, accuracy_m: 20, fixed_at: '2026-11-11T01:50:00Z', battery_pct: 60, charging: false },
  { person_id: 'me', lat: 29.7604, lon: -95.3698, accuracy_m: 20, fixed_at: '2026-11-11T01:58:00Z', battery_pct: 90, charging: true }
]

async function open(page: Page, hash: string, size: { width: number; height: number }, scheme: 'light' | 'dark') {
  await skipOnboarding(page)
  await page.setViewportSize(size)
  await page.emulateMedia({ colorScheme: scheme })
  await page.clock.setFixedTime(CLOCK)
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    localStorage.setItem('bantay.lastPerson', 'me')
  }, [jwt(), user, FAMILY] as const)
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-11-10T20:00', temperature_2m: 30, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [10] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t === 'rpc/family_places') return reply(PLACES)
    if (req.method() !== 'GET') return route.fulfill({ status: t.startsWith('rpc/') ? 200 : 201, headers: { ...cors, 'content-type': 'application/json' }, body: t.startsWith('rpc/') ? 'null' : '' })
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }])
    return reply([])
  })
  await page.goto(hash)
}
const shot = async (page: Page, name: string, size: { width: number; height: number }, scheme: string) => {
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.screenshot({ path: `${SHOTS}/${name}-${size.width}x${size.height}-${scheme}.png`, animations: 'disabled' })
}

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${size.width}x${size.height} ${scheme}`, () => {
      test('family map', async ({ page }) => {
        await open(page, '/#family/map', size, scheme)
        await page.getByTestId('place-map').waitFor()
        await page.waitForTimeout(2000)
        await shot(page, 'family-map', size, scheme)
      })
      test('alerts settings', async ({ page }) => {
        await open(page, '/#me/alerts', size, scheme)
        const row = page.getByTestId('world-alerts-later')
        await row.scrollIntoViewIfNeeded()
        await shot(page, 'settings-alerts', size, scheme)
      })
    })
  }
}
