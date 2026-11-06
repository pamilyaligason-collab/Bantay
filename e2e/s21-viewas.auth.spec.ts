import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { NOW, seed } from './fixtures/s16/family'
import { assertJackHit, assertNoSideways, assertTargets, DISCOVER_ALLOW, FAMILY_ALLOW, setScheme, settled, type JackAllow } from './v13'

// S21 lane V (D-125): an admin views the whole app as a member and comes back. Runs in the "auth" project; the wire is mocked, every name and value is invented.
// The signed-in phone is the family owner (Rey). Ma has no login and a writer link; Papa has no login and no link; Tita has her own login.
const API = 'https://bantay-test.supabase.test'
const UID = '66666666-6666-4666-8666-666666666666'
const SHOTS = process.env.S21_SHOTS ?? 'test-results/s21-shots/V'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'rey@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [
  { id: 'me', display_name: 'Rey Villar', auth_user_id: UID }, { id: 'ma', display_name: 'Ma', auth_user_id: null },
  { id: 'pa', display_name: 'Papa', auth_user_id: null }, { id: 'ti', display_name: 'Tita', auth_user_id: 'u-tita' }
].map((p) => ({ ...p, created_by: UID, archived_at: null, photo_path: null }))
// D-128: the owner cannot be made a carer (0046 share_set), so the line never says he can.
const LOCKED_PAPA = "Look only. You can see Papa's records. Logging for Papa needs a carer with edit access."

type Seen = { audits: unknown[]; posts: { path: string; body: unknown; auth: string }[] }
async function mockOwner(page: Page, role: 'admin' | 'member' = 'admin'): Promise<Seen> {
  const seen: Seen = { audits: [], posts: [] }
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Rey Villar' }, { personId: 'ma', displayName: 'Ma' }, { personId: 'pa', displayName: 'Papa' }, { personId: 'ti', displayName: 'Tita' }]))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (req.method() === 'POST' && t === 'rpc/admin_log_view_as') { seen.audits.push(req.postDataJSON()); return reply(null) }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') { if (!t.includes('usage_events')) seen.posts.push({ path: url.pathname, body: req.postDataJSON(), auth: req.headers()['authorization'] ?? '' }); return reply([]) }
    if (t.startsWith('rpc/')) return reply(null)
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply(url.searchParams.get('select') === 'is_owner' ? [{ is_owner: role === 'admin' }] : [{ role, handle: null }])
    if (t === 'carers') return reply([{ carer_id: UID, person_id: 'ma', can_write: true }])
    return reply([])
  })
  return seen
}

async function start(page: Page, hash: string, o: { w?: number; h?: number; scheme?: 'light' | 'dark'; role?: 'admin' | 'member' } = {}): Promise<Seen> {
  await page.setViewportSize({ width: o.w ?? 390, height: o.h ?? 844 })
  await skipOnboarding(page)
  await page.emulateMedia({ colorScheme: o.scheme ?? 'light', reducedMotion: 'reduce' })
  const seen = await mockOwner(page, o.role)
  await page.clock.setFixedTime(NOW)
  await page.goto(`/${hash}`)
  await expect(page.locator('h1')).toBeVisible()
  await setScheme(page, o.scheme ?? 'light')
  return seen
}
const bar = (page: Page) => page.getByTestId('viewas-bar').first()
const openSheet = async (page: Page) => { await page.locator('.ps-pill').click(); await expect(page.getByRole('dialog')).toBeVisible() }
const snap = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

/** Today, Health, Discover, Family and Safety each carry the bar for this person. */
async function walkTabs(page: Page, line: string | RegExp): Promise<void> {
  for (const hash of ['#today', '#health', '#discover', '#family', '#safety']) {
    await page.evaluate((h) => { location.hash = h }, hash) // not goto: a reload clears the memory-only state
    await expect(bar(page)).toContainText(/Viewing as /)
    await expect(bar(page)).toContainText(line)
  }
}

test.describe('View as from the switcher', () => {
  test('Papa (no login, no carer link): every tab follows, Log buttons are locked with the reason, Back to me returns, a reload is empty', async ({ page }) => {
    const seen = await start(page, '#health')
    // Papa has a Losartan dose due at 09:45 (NOW is 10:20), so Today shows the locked Take (D-128 round 3, item 4)
    await seed(page, 'bantay-log', 'medications', [{ clientId: 'c-pa', serverId: 's-pa', personId: 'pa', name: 'Losartan', dose: '50 mg', schedule: { v: 1, times: ['09:45'] }, startedOn: '2026-10-01', medStatus: 'active' }])
    await openSheet(page)
    const btn = page.getByTestId('viewas-open-pa')
    await expect(btn).toHaveAttribute('aria-label', 'View the whole app as Papa')
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId('viewas-open-me')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toContainText('View as opens every tab the way they see it, needs internet, and is recorded in the family history.')
    await snap(page, 'sheet-390')
    await btn.click()
    await expect(page).toHaveURL(/#today$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(seen.audits).toEqual([{ p_person: 'pa' }])

    await expect(page.getByTestId('today-head')).toContainText('Good morning, Papa') // the greeting names the viewed person (NOW is 10:20)
    await expect(page.getByTestId('myday').locator('.td-day-s')).toHaveText("Papa's day")
    await expect(page.getByTestId('head-me')).toHaveAttribute('aria-label', 'You and settings') // the avatar stays the admin's own and says so
    await expect(page.getByTestId('myday').locator('.td-lock-why').last()).toContainText('Logging for Papa needs a carer with edit access')
    await expect(bar(page)).toContainText('Viewing as Papa')
    await expect(bar(page)).toContainText(LOCKED_PAPA)
    await expect(page.getByRole('button', { name: 'Add a glass of water, view only' })).toBeDisabled()
    await expect(page.getByRole('button', { name: "I'm OK, view only" })).toBeDisabled() // the mood Log is locked the same way (MyDay.tsx `lockMood`; Papa has no due dose here, so no Take button to check)
    // the blood pressure Log is locked like the rest: a disabled button that does not look tappable, with the reason line under the list
    const bpLog = page.getByTestId('myday-bp').getByRole('button', { name: 'Log blood pressure, view only' })
    await expect(bpLog).toBeDisabled()
    await expect(page.getByTestId('myday-bp').getByRole('link', { name: 'Log' })).toHaveCount(0)
    expect(Number(await bpLog.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1)
    const take = page.getByRole('button', { name: 'Take, view only' })
    await expect(take).toBeDisabled() // the dose is Papa's and the owner has no carer link: Take is a locked button, not a live one
    await expect(take).toContainText('View only')
    await expect(page.locator('.td-nu-lock .td-lock-why')).toHaveText("You can see Papa's records. Logging for Papa needs a carer with edit access.")
    await expect(page.getByRole('button', { name: 'Take, mark as taken' })).toHaveCount(0)
    await expect(page.getByTestId('myday').locator('.td-lock-why').last()).toContainText('Look only. ') // the My day line says Look only, as the bar does
    await expect(page.locator('.sh-hint')).toHaveCount(0) // Jack's first-time hint stays off while viewing: it sat on the blood pressure Log
    await snap(page, 'today-locked-390')
    await walkTabs(page, LOCKED_PAPA)

    await page.evaluate(() => { location.hash = '#today' })
    await bar(page).getByRole('button', { name: 'Back to me' }).click()
    await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
    await expect(page.getByTestId('today-head')).toContainText('Good morning, Rey')
    await expect(page).toHaveURL(/#today$/) // not on a page of Papa's: it stays where it was
    await page.evaluate(() => { location.hash = '#health' })
    await expect(page.locator('.ps-pill')).toContainText('Me')

    // memory only: enter again, then a reload leaves nothing
    await openSheet(page)
    await page.getByTestId('viewas-open-pa').click()
    await expect(bar(page)).toContainText('Viewing as Papa')
    await page.reload()
    await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
    expect(seen.audits).toHaveLength(2) // one audit row per entry, no second write
  })

  test('Ma (writer link): the bar says so, a logged reading goes out for Ma under the admin session, and Back to me returns to own data', async ({ page }) => {
    const seen = await start(page, '#health')
    await openSheet(page)
    await page.getByTestId('viewas-open-ma').click()
    await expect(bar(page)).toContainText('Viewing as Ma')
    await expect(bar(page)).toContainText('You can log for Ma. Entries show you logged them.')
    await expect(page.getByRole('button', { name: 'Add a glass of water' })).toBeEnabled()
    await expect(page.getByTestId('today-head')).toContainText('Good morning, Ma')
    await expect(page.getByTestId('myday').locator('.td-day-s')).toHaveText("Ma's day")
    await expect(page.getByTestId('myday-bp').getByRole('link', { name: 'Log' })).toBeVisible() // a writer keeps the plain link
    await snap(page, 'today-writer-390')
    await walkTabs(page, 'You can log for Ma.')

    await page.evaluate(() => { location.hash = '#health/metric/bp_systolic' })
    await page.getByRole('button', { name: 'Add reading' }).click()
    await page.getByLabel('Top').fill('128')
    await page.getByLabel('Bottom').fill('82')
    await page.getByRole('button', { name: 'Save reading' }).click()
    // The row is Ma's; the actor is the admin: the call carries the admin's token and the server stamps logged_by from it (0044 trigger), so the phone sends no logged_by of its own.
    await expect.poll(() => seen.posts.find((p) => p.path === '/rest/v1/readings')).toBeTruthy()
    const w = seen.posts.find((p) => p.path === '/rest/v1/readings')!
    const rows = (Array.isArray(w.body) ? w.body : [w.body]) as Record<string, unknown>[]
    expect(rows.every((r) => r.person_id === 'ma')).toBe(true)
    expect(rows.some((r) => 'logged_by' in r)).toBe(false)
    expect(JSON.parse(atob(w.auth.replace('Bearer ', '').split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).sub).toBe(UID)

    await bar(page).getByRole('button', { name: 'Back to me' }).click()
    await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
    await expect(page).toHaveURL(/#health\/metric\/bp_systolic$/) // a tab or screen that is not Ma's page stays
  })

  test('Tita (own login): the reason names her login', async ({ page }) => {
    await start(page, '#health')
    await openSheet(page)
    await page.getByTestId('viewas-open-ti').click()
    await expect(bar(page)).toContainText('Look only. Tita has their own login, so only Tita can log.')
  })

  test('a failed switch stays on the sheet and says so', async ({ page }) => {
    await start(page, '#health')
    await page.route(`${API}/rest/v1/rpc/admin_log_view_as`, (route) => route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: '{"message":"offline"}' }))
    await openSheet(page)
    await page.getByTestId('viewas-open-ma').click()
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Could not switch. Check your internet and try again.')
    await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
    await expect(page).toHaveURL(/#health$/)
  })

  test('a member (not admin) sees no View as button, no sentence, no bar', async ({ page }) => {
    await start(page, '#health', { role: 'member' })
    await openSheet(page)
    await expect(page.getByRole('dialog').locator('[data-testid^="viewas-open-"]')).toHaveCount(0)
    await expect(page.getByRole('dialog')).not.toContainText('View as opens every tab')
    await page.keyboard.press('Escape')
    await page.evaluate(() => { location.hash = '#health/member/ma' })
    await expect(page.getByTestId('member-bar')).toBeVisible()
    await expect(page.getByTestId('member-open-app')).toHaveCount(0)
    await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
  })
})

test.describe('Open the app from the member page', () => {
  test('admin: the button opens Today as Ma; Back to me on the bar returns', async ({ page }) => {
    await start(page, '#health/member/ma')
    const open = page.getByTestId('member-open-app')
    await expect(open).toHaveText('Open the app as Ma')
    await expect(page.getByTestId('member-bar').getByRole('link', { name: 'Back to me' })).toBeVisible()
    await snap(page, 'member-390')
    await open.click()
    await expect(page).toHaveURL(/#today$/)
    await expect(bar(page)).toContainText('Viewing as Ma')
  })
  test('while viewing, the member page keeps one Back to me (the bar) and its own link reads Back to Health', async ({ page }) => {
    await start(page, '#health')
    await openSheet(page)
    await page.getByTestId('viewas-open-ma').click()
    await expect(bar(page)).toContainText('Viewing as Ma')
    await page.evaluate(() => { location.hash = '#health/member/ma' })
    await expect(page.getByTestId('member-bar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to me' })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Back to me' })).toHaveCount(0)
    await expect(page.getByTestId('member-bar').getByRole('link', { name: 'Back to Health' })).toBeVisible()
    await expect(page.getByTestId('member-open-app')).toHaveCount(0) // already viewing
  })
  test("Back to me on that person's sharing list moves to Today", async ({ page }) => {
    await start(page, '#health')
    await openSheet(page)
    await page.getByTestId('viewas-open-ma').click()
    await expect(bar(page)).toContainText('Viewing as Ma')
    await page.evaluate(() => { location.hash = '#sharing/ma' })
    await bar(page).getByRole('button', { name: 'Back to me' }).click()
    await expect(page).toHaveURL(/#today$/)
    await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
  })
  test('one Back press from Today after View as returns to Health: the sheet leaves no dead entry', async ({ page }) => {
    await start(page, '#health')
    await openSheet(page)
    await page.getByTestId('viewas-open-ma').click()
    await expect(page).toHaveURL(/#today$/)
    await expect(bar(page)).toContainText('Viewing as Ma')
    await page.goBack()
    await expect(page).toHaveURL(/#health$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
  test('Back to me while on that person\'s member page moves to Today', async ({ page }) => {
    await start(page, '#health')
    await openSheet(page)
    await page.getByTestId('viewas-open-ma').click()
    await expect(bar(page)).toContainText('Viewing as Ma')
    await page.evaluate(() => { location.hash = '#health/member/ma' })
    await bar(page).getByRole('button', { name: 'Back to me' }).click()
    await expect(page).toHaveURL(/#today$/)
    await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
  })
})

const ratioOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => {
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
  const lum = ([r, g, b]: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!) }
  const cs = getComputedStyle(el), a = lum(rgb(cs.color)), b = lum(rgb(cs.backgroundColor))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
})
const lines = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))

for (const scheme of ['light', 'dark'] as const) {
  for (const [w, h] of [[390, 844], [450, 949], [195, 700]] as const) {
    test(`member page bar stacks (${w}x${h} ${scheme})`, async ({ page }) => {
      await start(page, '#health/member/ma', { w, h, scheme })
      const text = page.getByTestId('member-bar').locator('.grow'), btns = page.getByTestId('member-bar').locator('.mh-acts')
      await expect(page.getByTestId('member-open-app')).toBeVisible()
      const t = (await text.boundingBox())!, b = (await btns.boundingBox())!
      expect(b.y).toBeGreaterThanOrEqual(t.y + t.height - 1) // text above, buttons below
      if (w >= 390) expect(await lines(page, '[data-testid="member-bar"] .grow')).toBeLessThanOrEqual(2)
      await assertTargets(page, { skip: '.tabbar button' })
      await assertNoSideways(page)
      await snap(page, `member-${w}-${scheme}`)
      await page.getByTestId('member-open-app').click()
      await expect(bar(page)).toContainText('Viewing as Ma')
      await expect(page.getByTestId('today-head')).toContainText('Good morning, Ma')
      await snap(page, `today-${w}-${scheme}`)
    })
    test(`shots and layout (${w}x${h} ${scheme})`, async ({ page }) => {
      await start(page, '#health', { w, h, scheme })
      await openSheet(page)
      await expect(page.getByTestId('viewas-open-ma')).toBeVisible()
      await assertNoSideways(page) // the page behind the sheet; the sheet is portalled outside `.bt .scroll`, so it is measured on its own next
      expect(await page.getByRole('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth && e.getBoundingClientRect().right <= innerWidth + 0.5), 'the sheet itself does not scroll sideways, 195 px included').toBe(true)
      await assertTargets(page, { skip: '.tabbar button' })
      expect(await ratioOf(page, '[data-testid="viewas-open-ma"]')).toBeGreaterThanOrEqual(4.5) // tint pill text on its fill, this theme
      if (scheme === 'light' || w === 390) await snap(page, `sheet-${w}-${scheme}`)
      await page.getByTestId('viewas-open-ma').click()
      await expect(bar(page)).toContainText('Viewing as Ma')
      await assertNoSideways(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await lines(page, '[data-testid="viewas-bar"] .va-row b')).toBeLessThanOrEqual(2) // 195 px: the title stacks above the button, never letter by letter
      await snap(page, `bar-${w}-${scheme}`)
    })
  }
}

const SAFETY_ALLOW: JackAllow[] = [{ name: 'First aid tile', sel: 'a.sf-fa' }, { name: 'Go-bag card', sel: '.sf-bag' }] // D-128 ruling 10: whole-card tiles; the viewing bar pushes the grid down, measured 76% tappable at 390x844
const PINNED_ALLOW: JackAllow[] = [{ name: 'Pinned last tile', sel: '[data-testid="pinned"] .pn-cell:nth-child(even) a' }, { name: 'Browse row', sel: '[data-testid="browse"] .rw-main' }] // the same whole-card allowance v13-health.spec names (JACK_ALLOW)
// Round 2 final review: Jack at rest while viewing. Only the named whole-card allowances of Discover and Family apply (shared from v13.ts); any other control that touches him fails: a small one is a bug.
for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test(`Jack at rest while viewing Papa (${w}x${h}): no control under him on any tab`, async ({ page }) => {
    await start(page, '#health', { w, h })
    await openSheet(page)
    await page.getByTestId('viewas-open-pa').click()
    await expect(bar(page)).toContainText('Viewing as Papa')
    for (const hash of ['#today', '#health', '#discover', '#family', '#safety']) {
      await page.evaluate((x) => { location.hash = x }, hash) // not goto: a reload clears the memory-only state
      await expect(bar(page)).toContainText(/Viewing as /)
      await expect(page.locator('h1').first()).toBeVisible()
      await settled(page)
      await expect(page.locator('.sh-jackfab')).toBeVisible() // without Jack the hit test would pass on nothing
      await assertJackHit(page, hash === '#discover' ? DISCOVER_ALLOW : hash === '#family' ? FAMILY_ALLOW : hash === '#health' ? PINNED_ALLOW : hash === '#safety' ? SAFETY_ALLOW : [], `viewas ${hash} ${w}x${h}`)
    }
  })
}
