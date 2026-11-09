import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 14 lane F2 (Family): Home | Messages | Plan segments and hashes, quick replies, focus after I'm OK, 200% text zoom. Made-up data only.
// The clock is frozen (Tue 27 Oct 2026, 10:20 local) and the data is invented, so a rerun writes the same pixels (ML-32).
declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = process.env.S14_SHOTS // shots only when S14_SHOTS=docs/session-14/shots/F2 is set, so a gate rerun leaves the tree clean (ML-32)
const NOW = new Date(2026, 9, 27, 10, 20, 0)
test.use({ viewport: { width: 390, height: 844 } })

const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Mama' }, { id: 'ma', display_name: 'Ate Joy' }, { id: 'pa', display_name: 'Papa Ben' }, { id: 'lo', display_name: 'Lola Remy' }]
type Row = Record<string, unknown>

async function mock(page: Page): Promise<Row[]> {
  const rpc: string[] = []
  const sent: Row[] = []
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-27T09:00', temperature_2m: 31, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (url.pathname.endsWith('/family_messages') && req.method() === 'POST') { const b = req.postDataJSON() as Row | Row[]; sent.push(...(Array.isArray(b) ? b : [b])); return route.fulfill({ status: 201, headers: cors }) }
    const t = url.pathname.replace('/rest/v1/', '')
    if (t.startsWith('rpc/')) { rpc.push(t.slice(4)); return reply(null) }
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }, { person_id: 'pa' }, { person_id: 'lo' }])
    return reply([])
  })
  return sent
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
}
async function shot(page: Page, name: string, scheme: string) {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  await settle(page)
  await page.waitForTimeout(900) // shortcut: lets the springIn and pill transitions land; a pixel-stable shot needs a still page
  await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, animations: 'disabled' })
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    let sent: Row[] = []
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Mama' }, { personId: 'ma', displayName: 'Ate Joy' }])))
      sent = await mock(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' })
      await page.clock.setFixedTime(NOW)
    })

    test('Messages and Plan are rows on the root; their hashes open them with a Back link', async ({ page }) => {
      await page.goto('/#family')
      await expect(page.getByRole('group', { name: 'Family view' })).toHaveCount(0)
      await shot(page, 'family-home', scheme)
      await page.getByTestId('msgs').click()
      await expect(page).toHaveURL(/#family\/messages$/)
      await expect(page.getByRole('group', { name: 'Quick replies' })).toBeVisible()
      await shot(page, 'messages', scheme)
      await page.getByRole('link', { name: 'Back to Family' }).click()
      await expect(page.getByTestId('planrow')).toHaveCount(0) // D-168: Plan is part of the one Calendar card
      await page.goto('/#family/plan')
      await expect(page).toHaveURL(/#family\/calendar$/)
      await page.goto('/#plan')
      await expect(page).toHaveURL(/#family\/calendar$/)
      await expect(page.getByRole('link', { name: 'Back to Family' })).toBeVisible()
      await page.goto('/#family/people')
      await expect(page.locator('h1').first()).toHaveText('Family') // v13: the roster is on the root; the ID card moved to #medid
    })

    test('a quick reply sends the words', async ({ page }) => {
      await page.goto('/#family/messages')
      await page.getByRole('group', { name: 'Quick replies' }).getByRole('button', { name: 'All good' }).click()
      await expect.poll(() => sent.map((r) => r.body), { timeout: 15_000 }).toContain('All good')
    })

    // House convention for 200% text: a 195 px wide viewport (e2e/health-labs.spec.ts), because the app's CSS uses px font sizes.
    test('200% text zoom (195 px wide): no sideways scroll on Home, Messages and the old Plan link (now the Calendar)', async ({ page }) => {
      await page.setViewportSize({ width: 195, height: 844 })
      for (const h of ['#family', '#family/messages', '#family/plan']) {
        await page.goto('/' + h)
        await expect(page.locator('h1').first()).toBeVisible()
        await settle(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      }
    })

    test('200% text zoom (195 px wide): the done check-in card does not overflow', async ({ page }) => {
      await page.setViewportSize({ width: 195, height: 844 })
      await page.goto('/#family')
      await expect(page.getByTestId('people-row').first()).toBeVisible() // Family has drawn, so the count below can fail
      await expect(page.getByRole('button', { name: "I'm OK" })).toHaveCount(0) // F4: the action moved to My day on Today
      await page.goto('/')
      const row = page.getByTestId('myday-checkin')
      await row.getByRole('button', { name: "I'm OK", exact: true }).click()
      await page.getByTestId('myday-fold').click() // D-135: a ticked row leaves My day for the Done today fold
      await expect(row.getByText('Checked in')).toBeVisible()
      await settle(page)
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true) // the done state of the check-in row
      expect(await page.getByTestId('myday').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    })
  })
}
