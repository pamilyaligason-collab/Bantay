import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Family feed lane C (runs in the "auth" project). Signed in as the invented Rey Villar; PostgREST is mocked, nothing real. Flag bantay.flag.feed is set per test.
// Shots (390 and 450, light and dark) go to FEED_SHOTS or test-results/feed-shots, never into the tracked tree (ML-32, ML-43).
const API = 'https://bantay-test.supabase.test'
const UID = '77777777-7777-4777-8777-777777777777'
const SHOTS = process.env.FEED_SHOTS ?? 'test-results/feed-shots'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'rey@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [
  { id: 'rey', display_name: 'Rey Villar', auth_user_id: UID, photo_path: null },
  { id: 'ma', display_name: 'Ma', auth_user_id: null, photo_path: null },
  { id: 'papa', display_name: 'Papa', auth_user_id: 'u-papa', photo_path: null }
]
const FAMILY = PEOPLE.map((p) => ({ personId: p.id, displayName: p.display_name }))
type Call = { fn: string; body: Record<string, unknown> }

async function open(page: Page, hash: string, o: { owner: boolean; flag?: boolean; on?: string[]; calls?: Call[] }) {
  const on = new Set(o.on ?? []) // 'person|category'
  const calls = o.calls ?? []
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.clock.setFixedTime(new Date('2026-11-05T02:00:00Z'))
  await page.addInitScript(([token, u, fam, flag]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    if (flag) localStorage.setItem('bantay.flag.feed', '1')
    localStorage.setItem('bantay.flag.places', '0') // the place switch has its own specs; these check the four feed switches
  }, [jwt(), user, FAMILY, o.flag !== false] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
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
      if (fn === 'feed_share_set') { const k = `${body.p_person}|${body.p_category}`; if (body.p_on) on.add(k); else on.delete(k); return reply(null, 200) }
      return reply([])
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, headers: cors })
    if (t === 'app_roles') return reply([{ role: o.owner ? 'admin' : 'member', handle: null, is_owner: o.owner }])
    if (t === 'people') { const eq = url.searchParams.get('auth_user_id'); return reply(eq?.startsWith('eq.') ? PEOPLE.filter((p) => p.auth_user_id === eq.slice(3)) : PEOPLE) }
    if (t === 'feed_shares') return reply([...on].map((k) => ({ person_id: k.split('|')[0], category: k.split('|')[1], enabled: true })))
    return reply([])
  })
  await page.goto(hash)
}
const sw = (page: Page, p: string, c: string) => page.getByTestId(`feed-share-${p}-${c}`)
const noSideways = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)

test('feed flag off: no switches on Privacy', async ({ page }) => {
  await open(page, '/#privacy', { owner: false, flag: false })
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expect(page.getByTestId('feed-shares')).toHaveCount(0)
})

test('feed empty state shows when the family has shared nothing', async ({ page }) => {
  await open(page, '/#family/feed', { owner: false })
  await expect(page.getByText('Nothing shared yet')).toBeVisible()
})

test('four switches, sheet wording, Share turns one on only after the server says ok, Not now changes nothing, offline blocks', async ({ page, context }) => {
  const calls: Call[] = []
  await open(page, '/#privacy', { owner: false, calls })
  const card = page.getByTestId('feed-shares')
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  for (const c of ['bp', 'lab', 'photo', 'status']) await expect(sw(page, 'rey', c)).toHaveAttribute('aria-checked', 'false')
  await expect(card.getByText('Share with the family: Blood pressure off, Lab results off, Photos off, Check-ins off.')).toBeVisible()
  await expect(page.getByTestId('feed-share-ma-bp')).toHaveCount(0) // not the owner: only my own four
  expect(await noSideways(page)).toBe(true)
  await page.screenshot({ path: `${SHOTS}/privacy-390-light.png` })

  await sw(page, 'rey', 'bp').click()
  const sheet = page.getByRole('dialog', { name: 'Share my blood pressure with the family?' })
  await expect(sheet.getByText('Every blood pressure reading you save will show in the family feed, with the number and whether it is high. Everyone in the family sees it, not only the people who can see your records. You can turn it off any time; older posts leave their phones at the next sync.')).toBeVisible()
  await page.waitForTimeout(350) // sheet slide-in
  await page.screenshot({ path: `${SHOTS}/sheet-390-light.png` })
  await sheet.getByRole('button', { name: 'Not now' }).click()
  await expect(sw(page, 'rey', 'bp')).toHaveAttribute('aria-checked', 'false')
  expect(calls.filter((c) => c.fn === 'feed_share_set')).toHaveLength(0)

  await sw(page, 'rey', 'lab').click()
  await expect(page.getByRole('dialog', { name: 'Share my lab results with the family?' })).toBeVisible()
  await page.waitForTimeout(350)
  await page.getByRole('dialog').getByRole('button', { name: 'Share', exact: true }).click()
  await expect(sw(page, 'rey', 'lab')).toHaveAttribute('aria-checked', 'true')
  expect(calls.find((c) => c.fn === 'feed_share_set')?.body).toEqual({ p_person: 'rey', p_category: 'lab', p_on: true })
  await expect(card.getByText('Share with the family: Blood pressure off, Lab results on, Photos off, Check-ins off.')).toBeVisible()

  await sw(page, 'rey', 'lab').click() // off: no sheet
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(sw(page, 'rey', 'lab')).toHaveAttribute('aria-checked', 'false')
  expect(calls.filter((c) => c.fn === 'feed_share_set').at(-1)?.body).toEqual({ p_person: 'rey', p_category: 'lab', p_on: false })

  await context.setOffline(true)
  await sw(page, 'rey', 'photo').click()
  await expect(page.getByText('Needs internet to change')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(sw(page, 'rey', 'photo')).toHaveAttribute('aria-checked', 'false')
})

test('owner: four switches for a person with no login, off only for a person with a login (D-134)', async ({ page }) => {
  const calls: Call[] = []
  await open(page, '/#privacy', { owner: true, on: ['papa|photo'], calls })
  await expect(sw(page, 'ma', 'bp')).toBeVisible()
  await expect(sw(page, 'ma', 'status')).toBeVisible()
  await expect(sw(page, 'papa', 'photo')).toHaveAttribute('aria-checked', 'true')
  await expect(sw(page, 'papa', 'bp')).toHaveCount(0)
  await sw(page, 'ma', 'bp').click()
  await expect(page.getByRole('dialog', { name: "Share Ma's blood pressure with the family?" })).toBeVisible()
  await page.waitForTimeout(350)
  await page.getByRole('dialog').getByRole('button', { name: 'Share', exact: true }).click()
  await expect(sw(page, 'ma', 'bp')).toHaveAttribute('aria-checked', 'true')
  await sw(page, 'papa', 'photo').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(sw(page, 'papa', 'photo')).toHaveCount(0) // nothing left on for him
  expect(calls.filter((c) => c.fn === 'feed_share_set').at(-1)?.body).toEqual({ p_person: 'papa', p_category: 'photo', p_on: false })
})

for (const [w, h] of [[390, 844], [450, 949]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`shots ${w} ${scheme}`, async ({ page }) => {
      await open(page, '/#privacy', { owner: true, on: ['rey|bp'] })
      await page.setViewportSize({ width: w, height: h })
      await page.emulateMedia({ colorScheme: scheme })
      await page.getByTestId('feed-shares').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await expect(sw(page, 'rey', 'bp')).toHaveAttribute('aria-checked', 'true')
      expect(await noSideways(page)).toBe(true)
      await page.screenshot({ path: `${SHOTS}/privacy-${w}-${scheme}.png` })
      await sw(page, 'rey', 'lab').click()
      await page.waitForTimeout(350)
      await page.screenshot({ path: `${SHOTS}/sheet-${w}-${scheme}.png` })
    })
  }
}
