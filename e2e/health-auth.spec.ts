import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> }

// Runs in the "auth" project (build WITH test Supabase env). Signed in as a made-up member; PostgREST is mocked; all data is invented.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Lloyd' }, { id: 'ma', display_name: 'Ma' }, { id: 'pa', display_name: 'Pa' }]

async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
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

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await mock(page)
})

test('signed in: Papers is reachable from the Health overview with a papers progress line', async ({ page }) => {
  await page.goto('/#health')
  await expect(page.locator('h1')).toHaveText('Health')
  const papers = page.getByRole('link', { name: /^Papers · / })
  await expect(papers).toBeVisible()
  await expect(papers).toContainText(/Add your first paper|\d+ of \d+ papers? checked/)
  await expect(papers).toHaveAttribute('href', '#health/papers')
  await papers.click()
  await expect(page).toHaveURL(/#health\/papers$/)
  await expect(page.locator('h1')).toHaveText('Papers')
  await expect(page.getByRole('link', { name: 'Back to Health' })).toBeVisible()
})

test('signed in: Add reading previews the colour and line, and the reading lands in the chart list', async ({ page }) => {
  await page.goto('/#health/metric/bp_systolic')
  await page.getByRole('button', { name: 'Add reading' }).click()
  await page.getByLabel('Top').fill('138')
  await page.getByLabel('Bottom').fill('86')
  await expect(page.getByTestId('reading-preview')).toHaveAttribute('data-state', 'above')
  await expect(page.getByTestId('reading-preview')).toContainText('Rest for 5 minutes')
  if (process.env.M7A_SHOTS) await page.screenshot({ path: `${process.env.M7A_SHOTS}/add-reading-light.png` })
  await page.getByRole('button', { name: 'Save reading' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toBeVisible()
  await expect(page.getByTestId('recent')).toContainText('138')
  await expect(page.getByTestId('metric-chart')).toBeVisible()
})
