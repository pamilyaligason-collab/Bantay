import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S12 lane A SHARE (runs in the "auth" project: build WITH test Supabase env). Signed in as Mama (own person 'me').
// PostgREST is mocked, stateful for the share list; every name is invented. Needs F1's App hook (view `sharing` renders SharingScreen).
// Shots (390x844, light and dark) are written only when S12_SHOTS is set, so a plain gate run writes nothing (ML-32): docs/session-12/shots/A.
const API = 'https://bantay-test.supabase.test'
const UID = '66666666-6666-4666-8666-666666666666'
const SHOTS = process.env.S12_SHOTS ? 'docs/session-12/shots/A' : ''
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-2@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const FAMILY = [{ personId: 'me', displayName: 'Mama' }, { personId: 'p-joy', displayName: 'Ate Joy' }, { personId: 'p-ben', displayName: 'Kuya Ben' }, { personId: 'p-rhea', displayName: 'Rhea' }, { personId: 'p-ramon', displayName: 'Tito Ramon' }]

type Viewer = { carer_user_id: string; display_name: string; can_write: boolean; pending: boolean; added_by_admin: boolean; added_at: string | null }
type Call = { fn: string; body: Record<string, unknown> }

async function mock(page: Page, calls: Call[], viewers: Viewer[], candidates: { carer_user_id: string; person_id: string; display_name: string }[]) {
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
  }, [jwt(), user, FAMILY] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-20T10:00', temperature_2m: 34.2, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t.startsWith('rpc/')) {
      const fn = t.slice(4)
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
      calls.push({ fn, body })
      if (fn === 'my_viewers') return reply(viewers)
      if (fn === 'share_candidates') return reply(candidates)
      if (fn === 'share_set') {
        const id = String(body.p_carer)
        const at = viewers.findIndex((v) => v.carer_user_id === id)
        if (body.p_on) {
          const c = candidates.find((x) => x.carer_user_id === id)
          if (c && at < 0) viewers.push({ carer_user_id: id, display_name: c.display_name, can_write: false, pending: true, added_by_admin: false, added_at: '2026-10-26T02:00:00Z' })
          return reply('pending')
        }
        if (at >= 0) viewers.splice(at, 1)
        return reply('removed')
      }
      return reply(null)
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, headers: cors })
    if (t === 'people') return reply([{ id: 'me', display_name: 'Mama', auth_user_id: UID }])
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    return reply([])
  })
}

const seed = (): Viewer[] => [
  { carer_user_id: 'u-joy', display_name: 'Ate Joy', can_write: false, pending: false, added_by_admin: false, added_at: '2026-10-25T02:00:00Z' },
  { carer_user_id: 'u-ben', display_name: 'Kuya Ben', can_write: false, pending: false, added_by_admin: true, added_at: '2026-10-21T02:00:00Z' }
]
const people = () => [
  { carer_user_id: 'u-rhea', person_id: 'p-rhea', display_name: 'Rhea' },
  { carer_user_id: 'u-ramon', person_id: 'p-ramon', display_name: 'Tito Ramon' }
]

async function open(page: Page, scheme: 'light' | 'dark', calls: Call[], viewers = seed()) {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.clock.setFixedTime(new Date('2026-10-27T02:00:00Z')) // frozen clock: a rerun of the shots rewrites no committed PNG (ML-32)
  await mock(page, calls, viewers, people())
  await page.goto('/#sharing')
  await expect(page.getByRole('heading', { name: 'Who can see my records' })).toBeVisible()
}

for (const scheme of ['light', 'dark'] as const) {
  test(`share with Rhea, see "Waiting for Rhea to accept", cancel it, stop Ate Joy ${scheme}`, async ({ page }) => {
    const calls: Call[] = []
    await open(page, scheme, calls)
    await expect(page.getByText('Only you, the family admins, and the people you share with can see your records.')).toBeVisible()
    await expect(page.getByText('Ate Joy', { exact: true })).toBeVisible()
    await expect(page.getByText(/Kuya Ben/).first()).toBeVisible()
    await expect(page.getByText(/added by an admin/)).toBeVisible()
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sharing-list-${scheme}.png` })

    await page.getByRole('button', { name: /Share with someone/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Share with someone' })
    await expect(sheet.getByRole('button', { name: 'Rhea' })).toBeVisible()
    await expect(sheet.getByRole('checkbox')).toBeDisabled()
    await expect(sheet.getByText('Only an admin can turn this on.')).toBeVisible()
    await sheet.getByRole('button', { name: 'Rhea' }).click()
    await page.waitForTimeout(350) // sheet slide-in
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/share-sheet-${scheme}.png` })
    await sheet.getByRole('button', { name: 'Send to Rhea' }).click()
    await expect(page.getByText('Waiting for Rhea to accept')).toBeVisible()
    expect(calls.find((c) => c.fn === 'share_set')?.body).toEqual({ p_person: 'me', p_carer: 'u-rhea', p_can_write: false, p_on: true })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sharing-pending-${scheme}.png` })

    await page.getByRole('button', { name: 'Cancel the offer to Rhea' }).click()
    await expect(page.getByText('Waiting for Rhea to accept')).toHaveCount(0)
    expect(calls.filter((c) => c.fn === 'share_set').at(-1)?.body).toEqual({ p_person: 'me', p_carer: 'u-rhea', p_can_write: false, p_on: false })

    await page.getByRole('button', { name: 'Stop sharing with Ate Joy' }).click()
    await page.getByRole('button', { name: 'Keep' }).click()
    expect(calls.filter((c) => c.fn === 'share_set')).toHaveLength(2) // Keep sent nothing
    await page.getByRole('button', { name: 'Stop sharing with Ate Joy' }).click()
    await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
    await expect(page.getByText('Ate Joy', { exact: true })).toHaveCount(0)
    expect(calls.filter((c) => c.fn === 'share_set').at(-1)?.body).toEqual({ p_person: 'me', p_carer: 'u-joy', p_can_write: false, p_on: false })
  })
}

test('Me has the Who can see my records row and no sharing switches; Privacy opens the same list', async ({ page }) => {
  const calls: Call[] = []
  await open(page, 'light', calls)
  await page.goto('/#me/family') // S16: the row lives in Settings > Family and sharing
  await expect(page.getByRole('heading', { level: 1, name: 'Family and sharing' })).toBeVisible()
  const row = page.getByRole('link', { name: /Who can see my records/ })
  await expect(row).toHaveAttribute('href', '#sharing')
  await expect(page.getByRole('switch', { name: /^Share / })).toHaveCount(0)
  if (SHOTS) { await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/me-sharing-row-light.png` }) }
  await page.goto('/#privacy')
  await page.getByRole('link', { name: /Who can see my records/ }).click()
  await expect(page).toHaveURL(/#sharing$/)
  await expect(page.getByText('Ate Joy', { exact: true })).toBeVisible()
})

test('a load that fails says so and never claims nobody has access', async ({ page }) => {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, [], seed(), people())
  await page.route(`${API}/rest/v1/rpc/my_viewers`, (route) => route.fulfill({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'down' }) }))
  await page.goto('/#sharing')
  await expect(page.getByRole('alert').filter({ hasText: 'No signal' })).toBeVisible()
  await expect(page.getByText('You have not shared with anyone yet.')).toHaveCount(0)
})
