import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { skipOnboarding } from './helpers'

// Runs in the "auth" project (build WITH test Supabase env). Signed in as a made-up member; PostgREST is mocked; all data is invented.
// Move (senior exercise): Today pill -> sheet -> gate -> Done logs; Health Move card. Light and dark, axe 0.
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

const serious = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`)
const exRows = (page: Page) => page.evaluate(() => new Promise<{ kind: string; minutes: number }[]>((res, rej) => {
  const open = indexedDB.open('bantay-log')
  open.onerror = () => rej(open.error)
  open.onsuccess = () => {
    const q = open.result.transaction('activity').objectStore('activity').getAll()
    q.onsuccess = () => { open.result.close(); res((q.result as { kind: string; minutes: number }[]).filter((r) => r.kind.startsWith('ex:'))) }
    q.onerror = () => rej(q.error)
  }
}))

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ colorScheme: scheme })
      await skipOnboarding(page)
      await mock(page)
    })

    test('Today Move pill -> doctor check once -> picks -> Done logs a move; axe clean', async ({ page }) => {
      await page.goto('/')
      const row = page.getByRole('group', { name: 'Quick log' })
      await expect(row.getByRole('button')).toHaveCount(9)
      await row.getByRole('button', { name: 'Gentle exercise for today' }).click()
      const sheet = page.getByRole('dialog', { name: 'Move' })
      await expect(sheet.getByText('Check with your doctor before starting new exercise.')).toBeVisible()
      expect(await serious(page)).toEqual([])
      await sheet.getByRole('button', { name: 'I understand' }).click()
      await expect(sheet.getByRole('list', { name: "Today's moves" }).getByRole('listitem')).toHaveCount(3)
      await expect(sheet.getByText(/of 150 minutes/)).toBeVisible()
      expect(await serious(page)).toEqual([])
      await sheet.getByRole('list', { name: "Today's moves" }).getByRole('button').first().click()
      await expect(sheet.getByRole('group', { name: 'Stop if' })).toBeVisible()
      expect((await sheet.getByRole('button', { name: 'Done' }).boundingBox())!.height).toBeGreaterThanOrEqual(56)
      expect(await serious(page)).toEqual([])
      await sheet.getByRole('button', { name: 'Done' }).click()
      await expect(page.getByRole('status').filter({ hasText: /^Saved: / })).toBeVisible()
      const rows = await exRows(page)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.minutes).toBeGreaterThan(0)
      // the doctor check is one-time: the sheet now opens straight on the picks
      await row.getByRole('button', { name: 'Gentle exercise for today' }).click()
      await expect(page.getByRole('dialog', { name: 'Move' }).getByText(/of 150 minutes/)).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Move' }).getByText('I understand')).toHaveCount(0)
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
    })

    test('Move v2: chips and sitting filter, a video move shows its preview, minutes are logged; shots; axe clean', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      const shot = (name: string) => page.screenshot({ path: `docs/session-9/shots/w1-move/${name}-${scheme}.png`, fullPage: true })
      await page.goto('/#health/move')
      await page.getByRole('button', { name: 'I understand' }).click()
      await expect(page.getByRole('heading', { name: "Today's plan" })).toBeVisible()
      await shot('move-home')
      const all = page.getByRole('list', { name: 'Browse moves' })
      const before = await all.getByRole('listitem').count()
      await page.getByRole('group', { name: 'Kind of move' }).getByRole('button', { name: 'Mobility' }).click()
      const mob = await all.getByRole('listitem').count()
      expect(mob).toBeGreaterThanOrEqual(5)
      expect(mob).toBeLessThan(before)
      await page.getByRole('group', { name: 'Sitting or standing' }).getByRole('button', { name: 'Sitting' }).click()
      await expect(all.getByText(/Standing|Lying down/)).toHaveCount(0)
      await shot('move-filtered')
      expect(await serious(page)).toEqual([])
      await all.getByRole('button', { name: /Neck side tilt/ }).click()
      const play = page.getByRole('button', { name: /^Play Deskercise - Neck and Shoulder Stretches \(Mayo Clinic\)/ })
      await expect(play).toBeVisible()
      expect((await play.boundingBox())!.height).toBeGreaterThanOrEqual(56)
      await expect(play.locator('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/5lbe9oZbpDs/hqdefault.jpg')
      await page.getByRole('button', { name: 'One minute more' }).click()
      await shot('move-detail')
      expect(await serious(page)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Done' }).click()
      const rows = await exRows(page)
      expect(rows.map((r) => r.kind)).toEqual(['ex:neck-side-tilt'])
      expect(rows[0]!.minutes).toBe(3)
    })

    test('Health has a Move card that opens the Move screen; axe clean', async ({ page }) => {
      await page.goto('/#health')
      const card = page.getByRole('link', { name: /^Move/ })
      await expect(card).toHaveAttribute('href', '#health/move')
      await card.click()
      await expect(page.getByRole('heading', { name: 'Move', level: 1 })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Back to Health' })).toBeVisible()
      await expect(page.getByTestId('move-gate')).toBeVisible()
      expect(await serious(page)).toEqual([])
      await page.getByRole('button', { name: 'I understand' }).click()
      await expect(page.getByRole('list', { name: "Today's moves" }).getByRole('listitem')).toHaveCount(3)
      expect(await serious(page)).toEqual([])
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
    })
  })
}
