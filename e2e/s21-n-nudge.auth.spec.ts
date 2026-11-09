import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { seed } from './fixtures/s16/health'
import { NOW, QUAKE, row as alertRow, startToday, STORM } from './fixtures/s16/today'
import { skipOnboarding } from './helpers'
import { ALERTS_KEY } from '../src/features/safety/alerts'
import { assertNoSideways, assertTextContrast, setScheme, settled } from './v13'

// Session 21 lane N (D-125): Due pills and the one moving item on Today and Health. Auth project; the wire is mocked, every name and value is invented.
// startToday freezes Date at 10:00 Manila and forces reduced motion; these tests turn motion back on (or keep it) and reload, which is a new app open.
// A claim that nothing moves waits out the settle time (700 ms) and a margin: the positive tests prove that wait is enough for the mover to appear.
const SHOTS = process.env.S21_SHOTS ?? 'test-results/s21-shots/N'
const SETTLE = 1_000
test.use({ timezoneId: 'Asia/Manila' })

const movers = (page: Page) => page.locator('[data-nudge="move"]')
const pillsIn = (page: Page, id: string) => page.getByTestId(id).locator('.nd-due')
const reopen = async (page: Page, motion: 'no-preference' | 'reduce', scheme: 'light' | 'dark' = 'light') => {
  await page.emulateMedia({ reducedMotion: motion, colorScheme: scheme })
  await page.reload() // a new app open: the once-per-open memory starts empty
  await expect(page.getByTestId('myday')).toBeVisible()
  await setScheme(page, scheme)
}

test.describe('Today', () => {
  test('Due pills on blood pressure and the check-in only; blood pressure moves alone, once, and the pill stays', async ({ page }) => {
    await startToday(page, 'calm')
    await reopen(page, 'no-preference')
    await expect(pillsIn(page, 'myday-bp')).toHaveText('Due')
    await expect(pillsIn(page, 'myday-checkin')).toHaveText('Due')
    await expect(pillsIn(page, 'myday-water')).toHaveCount(0) // 10:00, before 2 PM
    await expect(movers(page)).toHaveCount(1)
    await expect(movers(page)).toHaveAttribute('data-testid', 'myday-bp')
    const css = await page.getByTestId('myday-bp').evaluate((row) => {
      const get = (el: Element, pseudo?: string) => { const s = getComputedStyle(el, pseudo); return `${s.animationName}/${s.animationIterationCount}/${s.animationDuration}` }
      return { ring: get(row.querySelector('.td-todo-ic')!, '::after'), lean: get(row.querySelector('.td-todo-ic > svg')!), glow: get(row.querySelector('.td-todo-go')!) }
    })
    expect(css).toEqual({ ring: 'nd-ping/2/0.6s', lean: 'nd-lean/1/1.2s', glow: 'nd-glow/1/1.2s' }) // twice round and 1.2 s, no loop
    await expect(page.getByRole('button', { name: 'How are you? Pick a face' })).toHaveAccessibleDescription('Due')
    await page.screenshot({ path: `${SHOTS}/today-moving-390-light.png` })
    // the move ends and its state clears (a disabled then enabled button must not restart it); away and back in the same open: still Due, nothing moves again
    await expect(movers(page)).toHaveCount(0)
    await expect.poll(() => page.getByTestId('myday-bp').evaluate((row) => row.getAnimations({ subtree: true }).length)).toBe(0)
    await page.getByTestId('myday-bp').locator('.td-todo-go').evaluate((el) => { el.setAttribute('disabled', ''); el.removeAttribute('disabled') })
    await expect(page.getByTestId('myday-bp')).not.toHaveAttribute('data-nudge', /.+/)
    await page.evaluate(() => { location.hash = '#health' })
    await expect(page.locator('h1').first()).toHaveText('Health')
    await page.evaluate(() => { location.hash = '#today' })
    await expect(page.getByTestId('myday')).toBeVisible()
    await expect(pillsIn(page, 'myday-bp')).toHaveText('Due')
    await page.waitForTimeout(SETTLE)
    await expect(movers(page)).toHaveCount(0)
  })

  test('prefers-reduced-motion: the pills stay, nothing moves, and the animation rules are off even if the attribute were set', async ({ page }) => {
    await startToday(page, 'calm')
    await reopen(page, 'reduce')
    await expect(pillsIn(page, 'myday-bp')).toHaveText('Due')
    await page.waitForTimeout(SETTLE)
    await expect(movers(page)).toHaveCount(0)
    const names = await page.getByTestId('myday-bp').evaluate((row) => {
      row.setAttribute('data-nudge', 'move')
      return [getComputedStyle(row.querySelector('.td-todo-ic')!, '::after').animationName, getComputedStyle(row.querySelector('.td-todo-ic > svg')!).animationName, getComputedStyle(row.querySelector('.td-todo-go')!).animationName]
    })
    expect(names).toEqual(['none', 'none', 'none'])
  })

  // blood pressure logged and the check-in saved are seeded as the app stores them; the clock is moved to the hour wanted, then the app is opened again
  async function quietExcept(page: Page, o: { bp: boolean; checkIn: boolean; at: string }) {
    const at = new Date(o.at)
    await page.clock.setFixedTime(at)
    const ago = (m: number) => new Date(at.getTime() - m * 60_000).toISOString()
    if (o.bp) await seed(page, 'bantay-health', { readings: [{ personId: 'me', takenAt: ago(60), test: 'bp_systolic', value: 118, unit: 'mmHg' }, { personId: 'me', takenAt: ago(60), test: 'bp_diastolic', value: 76, unit: 'mmHg' }] })
    if (o.checkIn) await seed(page, 'bantay-log', { activity: [{ personId: 'me', kind: 'check-in', minutes: null, steps: null, startedAt: ago(30), source: 'manual' }] })
    await reopen(page, 'no-preference')
  }
  const animOf = (page: Page, rowId: string, sel: string, pseudo = '') => page.getByTestId(rowId).evaluate((row, [q, ps]) => { const s = getComputedStyle(row.querySelector(q as string)!, ps || undefined); return `${s.animationName}/${s.animationIterationCount}/${s.animationDuration}` }, [sel, pseudo] as const)

  test("blood pressure fine: the check-in is the mover; ring on its icon, lean, glow on I'm OK", async ({ page }) => {
    await startToday(page, 'calm')
    await quietExcept(page, { bp: true, checkIn: false, at: '2026-10-20T10:00:00+08:00' })
    await expect(movers(page)).toHaveAttribute('data-testid', 'myday-checkin')
    await expect(pillsIn(page, 'myday-bp')).toHaveCount(0)
    expect(await animOf(page, 'myday-checkin', '.td-todo-ic', '::after')).toBe('nd-ping/2/0.6s')
    expect(await animOf(page, 'myday-checkin', '.td-todo-ic > svg')).toBe('nd-lean/1/1.2s')
    expect(await animOf(page, 'myday-checkin', '.td-todo-go')).toBe('nd-glow/1/1.2s')
  })

  test('after 2 PM with blood pressure and the check-in done, water is the mover: the plus tile gets the inset ring (.td-todo-plus::after)', async ({ page }) => {
    await startToday(page, 'calm')
    await quietExcept(page, { bp: true, checkIn: true, at: '2026-10-20T15:00:00+08:00' })
    await expect(pillsIn(page, 'myday-water')).toHaveText('Due')
    await expect(movers(page)).toHaveAttribute('data-testid', 'myday-water')
    expect(await animOf(page, 'myday-water', '.td-todo-plus', '::after')).toBe('nd-ping/2/0.6s')
    expect(await page.getByTestId('myday-water').evaluate((row) => getComputedStyle(row.querySelector('.td-todo-plus')!, '::after').top)).toBe('4px') // the plus tile's own, smaller ring
    expect(await animOf(page, 'myday-water', '.td-todo-plus > svg')).toBe('nd-lean/1/1.2s')
  })

  for (const [label, at, expectDue] of [['23:30', '2026-10-20T23:30:00+08:00', false], ['00:30 next day', '2026-10-21T00:30:00+08:00', true]] as const) {
    test(`a check-in saved at 22:30 is ${expectDue ? 'due again' : 'still done'} at ${label} Manila`, async ({ page }) => {
      await startToday(page, 'calm')
      await seed(page, 'bantay-log', { activity: [{ personId: 'me', kind: 'check-in', minutes: null, steps: null, startedAt: new Date('2026-10-20T22:30:00+08:00').toISOString(), source: 'manual' }] })
      await page.clock.setFixedTime(new Date(at))
      await reopen(page, 'no-preference')
      await expect(pillsIn(page, 'myday-checkin')).toHaveCount(expectDue ? 1 : 0)
    })
  }

  for (const variant of ['quake', 'storm'] as const) {
    test(`during a ${variant === 'quake' ? 'warning' : 'storm'} on Today: no pill, nothing moves`, async ({ page }) => {
      await startToday(page, variant)
      await reopen(page, 'no-preference')
      await expect(page.getByTestId(variant === 'quake' ? 'warning-card' : 'warning-card-storm')).toBeVisible()
      await page.waitForTimeout(SETTLE)
      await expect(page.getByTestId('myday').locator('.nd-due')).toHaveCount(0)
      await expect(movers(page)).toHaveCount(0)
    })
  }

  test("a family member's missed dose is no nudge: no pill, no motion on that row; blood pressure still moves", async ({ page }) => {
    await startToday(page, 'calm', { notice: true })
    await reopen(page, 'no-preference')
    await expect(movers(page)).toHaveAttribute('data-testid', 'myday-bp')
    await expect(page.getByTestId('myday-missed-ma').locator('.nd-due')).toHaveCount(0)
    await expect(page.getByTestId('myday-missed-ma')).not.toHaveAttribute('data-nudge', /.+/)
  })

  for (const [w, h] of [[390, 844], [450, 949]] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${w} px ${scheme}: pill contrast, no sideways scroll, rows keep their height budget`, async ({ page }) => {
        await startToday(page, 'calm', { scheme })
        await page.setViewportSize({ width: w, height: h })
        await reopen(page, 'no-preference', scheme)
        await expect(movers(page)).toHaveCount(1)
        await assertTextContrast(page)
        await assertNoSideways(page)
        // the pill sits on the title's line: title block no taller than two lines, row no taller than the 80 px floor plus one line (S28: the 15 px sub line makes it 108)
        const rows = await page.getByTestId('myday').locator('.td-todo').evaluateAll((els) => els.filter((e) => e.querySelector('.nd-due')).map((e) => ({ id: e.getAttribute('data-testid'), h: e.getBoundingClientRect().height, title: (e.querySelector('.rw-title') as HTMLElement).getBoundingClientRect().height })))
        for (const r of rows) { expect(r.title, `${r.id} title`).toBeLessThanOrEqual(44); expect(r.h, `${r.id} row`).toBeLessThanOrEqual(108) }
        await page.locator('main.scroll').evaluate((el) => { el.scrollTop = 0 })
        await page.screenshot({ path: `${SHOTS}/today-${w}-${scheme}.png` })
      })
    }
  }
})

test.describe('Today, viewing as someone', () => {
  const API = 'https://bantay-test.supabase.test'
  const UID = '66666666-6666-4666-8666-666666666666'
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
  const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'rey@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  const PEOPLE = [{ id: 'me', display_name: 'Rey Villar', auth_user_id: UID }, { id: 'ma', display_name: 'Ma', auth_user_id: null }, { id: 'pa', display_name: 'Papa', auth_user_id: null }].map((p) => ({ ...p, created_by: UID, archived_at: null, photo_path: null }))
  async function start(page: Page) {
    await page.setViewportSize({ width: 390, height: 844 })
    await skipOnboarding(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
    await page.addInitScript(([token, u]) => {
      localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
      localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Rey Villar' }, { personId: 'ma', displayName: 'Ma' }, { personId: 'pa', displayName: 'Papa' }]))
    }, [jwt(), user] as const)
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
    await page.route(`${API}/**`, async (route) => {
      const req = route.request(); const url = new URL(req.url())
      const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      if (url.pathname === '/auth/v1/user') return reply(user)
      if (!url.pathname.startsWith('/rest/v1/')) return reply({})
      const t = url.pathname.replace('/rest/v1/', '')
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return reply([])
      if (t.startsWith('rpc/')) return reply(null)
      if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
      if (t === 'app_roles') return reply(url.searchParams.get('select') === 'is_owner' ? [{ is_owner: true }] : [{ role: 'admin', handle: null }])
      if (t === 'carers') return reply([{ carer_id: UID, person_id: 'ma', can_write: true }])
      return reply([])
    })
    await page.clock.setFixedTime(NOW)
    await page.goto('/#health')
    await expect(page.locator('h1')).toBeVisible()
  }
  const viewAs = async (page: Page, id: string) => {
    await page.locator('.ps-pill').click()
    await page.getByTestId(`viewas-open-${id}`).click()
    await expect(page.getByTestId('viewas-bar').first()).toContainText('Viewing as')
    await expect(page.getByTestId('myday')).toBeVisible()
  }

  test('Papa (look only): no pill, nothing moves', async ({ page }) => {
    await start(page)
    await viewAs(page, 'pa')
    await expect(page.getByRole('button', { name: 'Log blood pressure, view only' })).toBeDisabled()
    await page.waitForTimeout(SETTLE)
    await expect(page.getByTestId('myday').locator('.nd-due')).toHaveCount(0)
    await expect(movers(page)).toHaveCount(0)
  })

  test('Ma (writer link): the Log nudge shows, as on her own phone', async ({ page }) => {
    await start(page)
    await viewAs(page, 'ma')
    await expect(pillsIn(page, 'myday-bp')).toHaveText('Due')
  })

  test('Health while viewing Papa: no pill, nothing moves', async ({ page }) => {
    await start(page)
    await viewAs(page, 'pa')
    await page.evaluate(() => { location.hash = '#health' })
    await expect(page.getByTestId('pinned')).toBeVisible()
    await page.waitForTimeout(SETTLE)
    await expect(page.getByTestId('pinned').locator('.nd-due')).toHaveCount(0)
    await expect(movers(page)).toHaveCount(0)
  })
})

test.describe('Health, Pinned', () => {
  const HNOW = new Date(2026, 9, 26, 10, 20, 0)
  async function open(page: Page, width: number, o: { scheme?: 'light' | 'dark'; motion?: 'no-preference' | 'reduce'; bp?: boolean; alert?: 'quake' | 'storm' } = {}) {
    await page.setViewportSize({ width, height: width >= 390 ? Math.round(width * 2.17) : 780 })
    await page.clock.setFixedTime(HNOW)
    await skipOnboarding(page)
    await mock(page)
    await page.emulateMedia({ colorScheme: o.scheme ?? 'light', reducedMotion: o.motion ?? 'no-preference' })
    if (o.alert) await page.route('https://bantay-test.supabase.test/rest/v1/safety_alerts*', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [alertRow(o.alert === 'quake' ? QUAKE : STORM)], headers: { 'access-control-allow-origin': '*' } }) : route.fallback())) // the served row, as on Today
    await page.goto('/#health')
    await expect(page.locator('h1')).toHaveText('Health')
    const ago = (d: number) => new Date(HNOW.getTime() - d * 86_400_000).toISOString()
    const bp = o.bp ? [{ personId: 'me', takenAt: ago(1), test: 'bp_systolic', value: 118, unit: 'mmHg' }, { personId: 'me', takenAt: ago(1), test: 'bp_diastolic', value: 76, unit: 'mmHg' }] : []
    await seed(page, 'bantay-health', { people: [{ id: 'me', name: 'Rey' }], readings: [...bp, { personId: 'me', takenAt: ago(20), test: 'weight', value: 71, unit: 'kg' }] })
    await seed(page, 'bantay', { kv: [{ key: 'health.pins', value: ['bp_systolic', 'weight', 'steps', 'meds'] }] })
    await page.reload() // a new app open
    await expect(page.getByTestId(o.bp ? 'glance-weight' : 'glance-progress')).toBeVisible() // S24: the inline row has one place for the most due pinned metric, BP first
    await setScheme(page, o.scheme ?? 'light')
    await settled(page)
  }

  test('blood pressure moves first and takes the one place, once per open', async ({ page }) => {
    await open(page, 390)
    await expect(page.getByTestId('glance-progress').locator('.nd-due')).toHaveText('Due')
    await expect(page.getByTestId('glance-weight')).toHaveCount(0) // weight is due too, but the one place goes to BP (S24: two tiles always)
    await expect(page.getByTestId('tk-steps').locator('.nd-due')).toHaveCount(0)
    await expect(movers(page)).toHaveCount(1)
    await expect(movers(page)).toHaveAttribute('data-testid', 'glance-progress')
    // at 390 the tile is 173 px wide: the kicker icon is hidden (under 190 px, so the pill keeps the line) and there is no lean to see. The ring on the tile and the glow on its action are the effect.
    const css = await page.getByTestId('glance-progress').evaluate((t) => { const a = getComputedStyle(t, '::after'); const g = getComputedStyle(t.querySelector('.pt-a')!); return { ring: `${a.animationName}/${a.animationIterationCount}/${a.animationDuration}`, glow: `${g.animationName}/${g.animationIterationCount}/${g.animationDuration}`, icon: getComputedStyle(t.querySelector('.nd-ic')!).display } })
    expect(css).toEqual({ ring: 'nd-ping/2/0.6s', glow: 'nd-glow/1/1.2s', icon: 'none' })
    await expect.poll(() => page.getByTestId('glance-progress').evaluate((t) => t.getAnimations({ subtree: true }).length)).toBe(0) // the move has played out
    await page.evaluate(() => { location.hash = '#today' })
    await expect(page.getByTestId('myday')).toBeVisible()
    await page.evaluate(() => { location.hash = '#health' })
    await expect(page.getByTestId('pinned')).toBeVisible()
    await page.waitForTimeout(SETTLE)
    await expect(movers(page)).toHaveCount(0)
    await expect(page.getByTestId('glance-progress').locator('.nd-due')).toHaveText('Due')
  })

  // D-125: Health follows Today: no Due pill and nothing moves while a warning or a PAGASA wind signal is up. The alert must have landed in the app first, or "no pill" would pass before the warning arrives (ML-25).
  for (const [alert, label] of [['quake', 'a warning'], ['storm', 'a PAGASA wind signal']] as const) {
    test(`during ${label}: no pill on Pinned, nothing moves`, async ({ page }) => {
      await open(page, 390, { alert })
      await expect.poll(() => page.evaluate(async (key) => new Promise<number>((res) => { const r = indexedDB.open('bantay'); r.onerror = () => res(0); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get(key); g.onsuccess = () => { r.result.close(); res(Array.isArray(g.result?.value) ? g.result.value.length : 0) }; g.onerror = () => res(0) } }), ALERTS_KEY)).toBeGreaterThan(0)
      await page.waitForTimeout(SETTLE)
      await expect(page.getByTestId('pinned').locator('.nd-due')).toHaveCount(0)
      await expect(movers(page)).toHaveCount(0)
    })
  }

  test('450 px: the tile is wide enough for the kicker icon, which leans', async ({ page }) => {
    await open(page, 450)
    await expect(movers(page)).toHaveAttribute('data-testid', 'glance-progress')
    const lean = await page.getByTestId('glance-progress').evaluate((t) => { const i = getComputedStyle(t.querySelector('.nd-ic')!); return `${i.display}/${i.animationName}/${i.animationDuration}` })
    expect(lean).toBe('flex/nd-lean/1.2s') // a flex item, so shown (not 'none')
  })

  test('blood pressure logged this week: the due weight moves instead', async ({ page }) => {
    await open(page, 390, { bp: true })
    await expect(page.getByTestId('glance-progress')).toHaveCount(0) // D-142: BP is not drawn twice in the Readings card, so a not-due BP pin is hidden
    await expect(movers(page)).toHaveAttribute('data-testid', 'glance-weight')
  })

  test('prefers-reduced-motion: the pills stay, nothing moves', async ({ page }) => {
    await open(page, 390, { motion: 'reduce' })
    await expect(page.getByTestId('glance-progress').locator('.nd-due')).toHaveText('Due')
    await page.waitForTimeout(SETTLE)
    await expect(movers(page)).toHaveCount(0)
  })

  for (const width of [390, 450]) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${width} px ${scheme}: the pill stays on the kicker line, inside the tile, contrast and no sideways scroll`, async ({ page }) => {
        await open(page, width, { scheme })
        await expect(movers(page)).toHaveCount(1)
        await assertTextContrast(page)
        await assertNoSideways(page)
        const m = await page.getByTestId('pinned').locator('.pt').evaluateAll((tiles) => tiles.map((t) => {
          const tb = t.getBoundingClientRect(); const k = t.querySelector('.pt-k')!.getBoundingClientRect(); const p = t.querySelector('.nd-due')?.getBoundingClientRect()
          return { id: t.getAttribute('data-testid'), tile: tb.height, kicker: k.height, inside: !p || (p.right <= tb.right - 0.5 && p.left >= tb.left && p.bottom <= tb.bottom) }
        }))
        for (const r of m) { expect(r.kicker, `${r.id} kicker is one line`).toBeLessThanOrEqual(24); expect(r.inside, `${r.id} pill inside`).toBe(true) }
        expect(Math.abs(m[0]!.tile - m[1]!.tile), 'neighbouring tiles stay the same height').toBeLessThanOrEqual(1)
        await page.getByTestId('pinned').evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await page.screenshot({ path: `${SHOTS}/health-${width}-${scheme}.png` })
      })
    }
  }

  test('195 px: one column, the pill wraps inside the tile, no sideways scroll', async ({ page }) => {
    await open(page, 195)
    await assertNoSideways(page)
    const out = await page.getByTestId('pinned').locator('.pt').evaluateAll((tiles) => tiles.flatMap((t) => { const tb = t.getBoundingClientRect(); return Array.from(t.querySelectorAll('.nd-due, .pt-k')).filter((n) => n.getBoundingClientRect().right > tb.right + 0.5).map((n) => n.className) }))
    expect(out).toEqual([])
  })
})
