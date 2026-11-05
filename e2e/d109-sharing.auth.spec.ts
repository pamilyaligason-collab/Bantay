import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// D-109 lane H (runs in the "auth" project: build WITH test Supabase env). Signed in as the invented owner Rey Villar.
// PostgREST is mocked and stateful for the link list; every name is invented. Boards: D109Owner, D109Person, D109Mine (390 px), D109Desk (1280 px).
// Shots are written under test-results/doc-shots unless DOC_SHOTS=1 (ML-32), and the clock is frozen so a rerun rewrites nothing.
const API = 'https://bantay-test.supabase.test'
const UID = '77777777-7777-4777-8777-777777777777'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'rey@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

const PEOPLE = [
  { id: 'rey', display_name: 'Rey Villar', auth_user_id: UID, photo_path: null },
  { id: 'ma', display_name: 'Ma', auth_user_id: null, photo_path: null },
  { id: 'papa', display_name: 'Papa', auth_user_id: 'u-papa', photo_path: null },
  { id: 'tita', display_name: 'Tita', auth_user_id: 'u-tita', photo_path: null },
  { id: 'kuya', display_name: 'Kuya', auth_user_id: 'u-kuya', photo_path: null },
  { id: 'lola', display_name: 'Lola', auth_user_id: null, photo_path: null }
]
const FAMILY = PEOPLE.map((p) => ({ personId: p.id, displayName: p.display_name }))
const NAME: Record<string, string> = { 'u-papa': 'Papa', 'u-tita': 'Tita', 'u-kuya': 'Kuya' }

type Link = { person_id: string; carer_user_id: string; can_write: boolean; added_by_admin: boolean }
type Call = { fn: string; body: Record<string, unknown> }
// Live-shaped: the owner (UID) is the writer carer of the people with no login (Ma, Lola). Those rows are in carers and in admin_share_grid, but are not "who sees them".
const seed = (): Link[] => [
  { person_id: 'ma', carer_user_id: UID, can_write: true, added_by_admin: false },
  { person_id: 'lola', carer_user_id: UID, can_write: true, added_by_admin: false },
  { person_id: 'ma', carer_user_id: 'u-papa', can_write: true, added_by_admin: false },
  { person_id: 'ma', carer_user_id: 'u-kuya', can_write: false, added_by_admin: true },
  { person_id: 'papa', carer_user_id: 'u-kuya', can_write: false, added_by_admin: true },
  { person_id: 'rey', carer_user_id: 'u-kuya', can_write: false, added_by_admin: true }
]

async function mock(page: Page, links: Link[], calls: Call[], opts: { owner?: boolean; alerts?: unknown[] } = {}) {
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
  }, [jwt(), user, FAMILY] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/functions/v1/admin-members') return reply({ ok: true, members: [] })
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t.startsWith('rpc/')) {
      const fn = t.slice(4)
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
      calls.push({ fn, body })
      const viewers = (p: string) => links.filter((l) => l.person_id === p && l.carer_user_id !== UID).map((l) => ({ carer_user_id: l.carer_user_id, display_name: NAME[l.carer_user_id], can_write: l.can_write, pending: false, added_by_admin: l.added_by_admin, added_at: '2026-10-25T02:00:00Z' }))
      if (fn === 'person_viewers') return reply(viewers(String(body.p_person)))
      if (fn === 'share_candidates') {
        const have = new Set(links.filter((l) => l.person_id === body.p_person).map((l) => l.carer_user_id))
        return reply(PEOPLE.filter((p) => p.auth_user_id && p.auth_user_id !== UID && p.id !== body.p_person && !have.has(p.auth_user_id)).map((p) => ({ carer_user_id: p.auth_user_id, person_id: p.id, display_name: p.display_name })))
      }
      if (fn === 'admin_share_grid') return reply(links.filter((l) => l.person_id !== 'rey').map((l) => ({ person_id: l.person_id, person_name: PEOPLE.find((p) => p.id === l.person_id)!.display_name, carer_user_id: l.carer_user_id, carer_name: NAME[l.carer_user_id], can_write: l.can_write, pending: false })))
      if (fn === 'share_set') {
        const at = links.findIndex((l) => l.person_id === body.p_person && l.carer_user_id === body.p_carer)
        if (body.p_on) {
          if (at >= 0) return reply('unchanged')
          links.push({ person_id: String(body.p_person), carer_user_id: String(body.p_carer), can_write: false, added_by_admin: true })
          return reply('added')
        }
        if (at >= 0) links.splice(at, 1)
        return reply('removed')
      }
      return reply([])
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, headers: cors })
    if (t === 'app_roles') return reply([{ role: opts.owner === false ? 'member' : 'admin', handle: null, is_owner: opts.owner !== false }])
    if (t === 'people') {
      const eq = url.searchParams.get('auth_user_id')
      return reply(eq?.startsWith('eq.') ? PEOPLE.filter((p) => p.auth_user_id === eq.slice(3)) : PEOPLE)
    }
    if (t === 'carer_alerts') return reply(opts.alerts ?? [])
    if (t === 'carers') return reply(links.map((l) => ({ carer_id: l.carer_user_id, person_id: l.person_id, can_write: l.can_write })))
    return reply([])
  })
}

async function open(page: Page, width: number, height: number, hash: string, links = seed(), calls: Call[] = [], opts: { owner?: boolean; alerts?: unknown[] } = {}) {
  await skipOnboarding(page)
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.clock.setFixedTime(new Date('2026-10-27T02:00:00Z')) // frozen clock: a rerun rewrites no PNG (ML-32)
  await mock(page, links, calls, opts)
  await page.goto(hash)
}
const noSideways = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)

test('owner list, then one person: Allow works at once and Stop leaves (D109Owner, D109Person)', async ({ page }) => {
  const calls: Call[] = []
  await open(page, 390, 844, '/#me/family', seed(), calls)
  await page.getByRole('link', { name: /Who sees whom/ }).click() // the owner-only row in Me > Family and sharing
  await expect(page).toHaveURL(/#sharing\/all$/)
  await expect(page.getByRole('heading', { name: 'Who sees whom' })).toBeVisible()
  const list = page.getByTestId('owner-list')
  await expect(list.getByRole('listitem')).toHaveCount(5)
  await expect(list.getByRole('listitem').filter({ hasText: 'Ma' }).first()).toContainText('2 can see')
  await expect(list.getByRole('listitem').filter({ hasText: 'Papa' })).toContainText('1 can see')
  await expect(list.getByRole('listitem').filter({ hasText: 'Tita' })).toContainText('Only you')
  await expect(list.getByRole('listitem').filter({ hasText: 'Kuya' })).toContainText('Only you')
  await expect(list.getByRole('listitem').filter({ hasText: 'Lola' })).toContainText('Only you') // her only link is the owner's own writer-carer row
  await expect(page.getByText('You can see everyone. The app opens on your own page.')).toBeVisible()
  await expect(page.getByText('Changes apply at once. A person with a login is told and can stop it. For someone with no login, the new viewer and the carers are told.')).toBeVisible()
  expect(await noSideways(page)).toBe(true)
  await page.screenshot({ path: shotPath('docs/d109/owner-list-390.png') })

  await list.getByRole('link', { name: /Ma 2 can see/ }).click()
  await expect(page).toHaveURL(/#sharing\/ma$/)
  await expect(page.getByRole('heading', { name: "Who can see Ma's records" })).toBeVisible()
  await expect(page.getByText('Carer · gets missed-dose alerts')).toBeVisible()
  await expect(page.getByText('Can see the records')).toBeVisible()
  await expect(page.getByText(/Allowing works at once: medicines, doses, readings, papers, check-ins, food and phone health\. Never ID cards\./)).toBeVisible()
  expect(await noSideways(page)).toBe(true)
  await page.screenshot({ path: shotPath('docs/d109/person-list-390.png') })

  await page.getByRole('button', { name: 'Allow someone' }).click()
  const sheet = page.getByRole('dialog', { name: 'Allow someone' })
  await sheet.getByRole('button', { name: 'Tita' }).click()
  await page.waitForTimeout(350) // sheet slide-in
  await sheet.getByRole('button', { name: 'Allow Tita' }).click()
  await expect(page.getByText('Tita', { exact: true })).toBeVisible() // at once: no "waiting", no accept
  await expect(page.getByText(/Waiting for/)).toHaveCount(0)
  expect(calls.find((c) => c.fn === 'share_set')?.body).toEqual({ p_person: 'ma', p_carer: 'u-tita', p_can_write: false, p_on: true })

  await page.getByRole('button', { name: 'Stop sharing with Kuya' }).click()
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await expect(page.getByText('Kuya', { exact: true })).toHaveCount(0)
  expect(calls.filter((c) => c.fn === 'share_set').at(-1)?.body).toEqual({ p_person: 'ma', p_carer: 'u-kuya', p_can_write: false, p_on: false })
})

test('my own list: the owner line and who the owner added (D109Mine)', async ({ page }) => {
  await open(page, 390, 844, '/#sharing')
  await expect(page.getByRole('heading', { name: 'Who can see my records' })).toBeVisible()
  await expect(page.getByText('Only you, the family owner, and the people you or the family owner share with can see your records.')).toBeVisible()
  await expect(page.getByText("The family owner can see everyone's records.")).toBeVisible()
  await expect(page.getByText('Can see your records · added by the family owner')).toBeVisible()
  await expect(page.getByText('Sharing works at once, with no accept step.', { exact: false })).toBeVisible()
  expect(await noSideways(page)).toBe(true)
  await page.screenshot({ path: shotPath('docs/d109/mine-390.png') })
})

test('the owner can open one person list straight from the address', async ({ page }) => {
  await open(page, 390, 844, '/#sharing/ma')
  await expect(page.getByRole('heading', { name: "Who can see Ma's records" })).toBeVisible() // the invented owner may open it
})

test('desk grid at 1280: an empty box asks then allows, a filled box stops after a confirm (D109Desk)', async ({ page }) => {
  const calls: Call[] = []
  await open(page, 1280, 800, '/admin#/sharing', seed(), calls)
  const table = page.getByRole('table')
  await expect(table).toBeVisible()
  await expect(page.getByText('Tap an empty box to allow (it asks first), a filled box to stop. Allow tells the person, or the new viewer if the person has no login. Stop tells the viewer. You always see everyone.')).toBeVisible()
  await expect(page.getByText('Only the family owner can change this page.')).toBeVisible()
  const box = page.getByRole('button', { name: 'Tita does not see Ma' })
  await expect(box).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Papa is the carer of Ma' })).toHaveText('C')
  await box.click()
  await expect(page.getByRole('alertdialog')).toContainText("Let Tita see Ma's records?")
  expect(calls.find((c) => c.fn === 'share_set')).toBeUndefined() // one tap makes no link
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  expect(calls.find((c) => c.fn === 'share_set')).toBeUndefined() // cancel makes none
  await box.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Allow' }).click()
  await expect(page.getByText("Tita can now see Ma's records.")).toBeVisible()
  expect(calls.find((c) => c.fn === 'share_set')?.body).toEqual({ p_person: 'ma', p_carer: 'u-tita', p_can_write: false, p_on: true })
  await page.getByRole('button', { name: 'Kuya sees Ma' }).click()
  const panel = page.getByRole('region', { name: 'Selected' })
  await expect(panel).toContainText('Kuya sees Ma')
  await page.screenshot({ path: shotPath('docs/d109/desk-grid-1280.png') })
  await panel.getByRole('button', { name: 'Stop sharing' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Stop sharing' }).click()
  await expect(page.getByText('Kuya can no longer see Ma.')).toBeVisible()
  expect(calls.filter((c) => c.fn === 'share_set').at(-1)?.body).toEqual({ p_person: 'ma', p_carer: 'u-kuya', p_can_write: false, p_on: false })
})

test('a non-owner writer carer of a person with no login opens the alert, sees that list, and Back goes to Family', async ({ page }) => {
  // Live-shaped: Rey here is a plain member (not the owner), the writer carer of Ma who has no login; the alert is the one the server sends the writer carers.
  const alert = { id: 'a-carer', person_id: 'ma', kind: 'share', template: 'share_added_carer', ref: 'ma:u-tita', created_at: '2026-10-27T01:55:00Z', pushed_at: null, seen_at: null, expires_at: '2026-11-03T02:00:00Z' }
  await open(page, 390, 844, '/#notif', seed(), [], { owner: false, alerts: [alert] })
  await page.getByTestId('inbox-new').getByRole('button', { name: /Sharing/ }).click()
  await expect(page.getByTestId('alert-sheet')).toBeVisible()
  await page.getByTestId('alert-sheet').getByRole('link', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(/#sharing\/ma$/)
  await expect(page.getByRole('heading', { name: "Who can see Ma's records" })).toBeVisible()
  await expect(page.getByText('Papa', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Family' }).click()
  await expect(page).toHaveURL(/#family$/)
})
