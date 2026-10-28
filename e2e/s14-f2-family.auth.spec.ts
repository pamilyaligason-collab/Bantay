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

    test('segments are Home, Messages, Plan and the hashes open them', async ({ page }) => {
      await page.goto('/#family')
      const seg = page.getByRole('group', { name: 'Family view' })
      await expect(seg.getByRole('button')).toHaveText(['Home', 'Messages', 'Plan'])
      await expect(seg.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true')
      await seg.getByRole('button', { name: 'Messages' }).click()
      await expect(page).toHaveURL(/#family\/messages$/)
      await expect(page.getByRole('group', { name: 'Quick replies' })).toBeVisible()
      await shot(page, 'messages', scheme)
      await seg.getByRole('button', { name: 'Plan' }).click()
      await expect(page).toHaveURL(/#family\/plan$/)
      await page.goto('/#plan')
      await expect(page.getByRole('group', { name: 'Family view' }).getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-pressed', 'true')
      await page.goto('/#family/people')
      await expect(page.getByRole('group', { name: 'Family view' }).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true')
      await page.goto('/#family/messages')
      await expect(page.getByRole('group', { name: 'Family view' }).getByRole('button', { name: 'Messages' })).toHaveAttribute('aria-pressed', 'true')
    })

    test('a quick reply sends the words', async ({ page }) => {
      await page.goto('/#family/messages')
      await page.getByRole('group', { name: 'Quick replies' }).getByRole('button', { name: 'All good' }).click()
      await expect.poll(() => sent.map((r) => r.body), { timeout: 15_000 }).toContain('All good')
    })

    test("after I'm OK focus is on the check-in card, with Jack Jack beside it", async ({ page }) => {
      await page.goto('/#family')
      await page.getByRole('button', { name: "I'm OK", exact: true }).click()
      const done = page.locator('.fm-checkin')
      await expect(done).toContainText(/^You're OK · /)
      await expect(done).toBeFocused()
      await expect(done.locator('img.jack')).toBeVisible()
      await shot(page, 'im-ok', scheme)
    })

    test('200% text zoom: no sideways scroll on Home, Messages and Plan', async ({ page }) => {
      await page.goto('/#family')
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      for (const h of ['#family', '#family/messages', '#family/plan']) {
        await page.goto('/' + h)
        await expect(page.getByRole('group', { name: 'Family view' })).toBeVisible()
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
        await settle(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
        const tiny = await page.locator('.seg button').evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().height < 48).length)
        expect(tiny).toBe(0)
      }
    })
  })
}
