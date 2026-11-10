import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S30 L2: the "Data integrity check" card on System health. Runs in the "auth" project. Everything on the wire is mocked; synthetic data only.
// Shots go to $S30_SHOTS (default test-results/s30).
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }
const SHOTS = process.env.S30_SHOTS ?? 'test-results/s30'
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
const PEOPLE = [{ id: 'p1', display_name: 'Test Admin', auth_user_id: UID, photo_path: null }, { id: 'p2', display_name: 'Test Mama', auth_user_id: 'u2', photo_path: null }]
const KPIS = { today: '2026-11-10', active_members: { cur: 3, prev: 4 }, screens: { cur: 210, prev: 180 }, doses_logged: { cur: 61, prev: 58 }, readings_logged: { cur: 14, prev: 9 }, client_errors: { cur: 5, prev: 2 }, alerts: null }
const FINDINGS = [
  { id: 1, kind: 'duplicate', table_name: 'readings', person_id: 'p2', detail: { test: 'heart_rate', gap_s: 0 }, checked_at: iso(60) },
  { id: 2, kind: 'impossible', table_name: 'readings', person_id: 'p2', detail: { test: 'bp_systolic', value: 400, unit: 'mmHg', reason: 'out_of_range' }, checked_at: iso(60) },
  { id: 3, kind: 'no_unit', table_name: 'lab_results', person_id: 'p2', detail: { test: 'hemoglobin', value: 215 }, checked_at: iso(60) },
  { id: 4, kind: 'tile_mismatch', table_name: 'activity', person_id: 'p2', detail: { metric: 'sleep', day: '2026-11-10', rows_total_min: 760, shown_min: 400 }, checked_at: iso(60) },
  { id: 5, kind: 'unit_mismatch', table_name: 'readings', person_id: 'p2', detail: { test: 'glucose', value: 5.6, unit: 'mg/dL', reason: 'fits_other_unit', likely_unit: 'mmol/l' }, checked_at: iso(60) }
]

async function mock(page: Page, opts: { missing?: boolean; empty?: boolean } = {}) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => route.fulfill({ status, headers: { ...cors, ...extra, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const t = url.pathname.replace('/rest/v1/', '')
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/rest/v1/rpc/admin_weekly_kpis') return reply(KPIS)
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() !== 'GET') return reply([])
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const rows = (a: unknown[], extra: Record<string, string> = {}) => reply(single ? (a[0] ?? null) : a, 200, extra)
    if (t === 'app_roles') return rows([{ role: 'admin', handle: 'admin' }])
    if (t === 'people') return rows(PEOPLE)
    if (t === 'job_runs') {
      const job = (url.searchParams.get('job') ?? '').replace('eq.', '')
      return rows([{ job, ran_at: iso(6), ok: true, summary: job === 'integrity-check' ? { dupes: 1, impossible: 1, mismatched: 3, checked: 12345 } : {} }])
    }
    if (t === 'integrity_findings') {
      if (opts.missing) return reply({ code: '42P01', message: 'relation does not exist' }, 404)
      const kind = (url.searchParams.get('kind') ?? '').replace('eq.', '')
      const off = Number(url.searchParams.get('offset') ?? 0), lim = Number(url.searchParams.get('limit') ?? 1000)
      const all = (opts.empty ? [] : FINDINGS).filter((x) => !kind || x.kind === kind)
      const list = all.slice(off, off + lim)
      return rows(list, { 'content-range': list.length ? `${off}-${off + list.length - 1}/${all.length}` : `*/${all.length}` })
    }
    return rows([])
  })
}

const mainFits = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#wa-main *')].filter((e) => !e.parentElement?.closest('.dk-scrollx, .wa-sr')).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.tagName + '.' + e.className))

for (const [w, h] of [[390, 844], [1280, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`integrity card with findings (${w}x${h}, ${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await page.emulateMedia({ colorScheme: scheme })
      await mock(page)
      await skipOnboarding(page)
      await page.goto('/admin#/system')
      const card = page.getByRole('region', { name: 'Data integrity check' })
      await expect(card.getByText(/12,345 records checked/)).toBeVisible()
      await expect(card.getByText('5 to look at')).toBeVisible()
      const list = card // the status line plus one finding per kind, worst kind first
      await expect(list.getByRole('listitem')).toHaveCount(6)
      await expect(card.getByText('Cannot be right 1 · Unit looks wrong 1 · No unit 1 · Totals disagree 1 · Possible duplicate 1')).toBeVisible()
      await expect(list.getByText(/Test Mama · Rows add up to 12 h 40 min, the app shows 6 h 40 min/)).toBeVisible()
      await expect(list.getByText(/Test Mama · Fits mmol\/l better than mg\/dL/)).toBeVisible()
      await card.scrollIntoViewIfNeeded()
      expect(await mainFits(page)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await card.screenshot({ path: `${SHOTS}/integrity-card-${w}-${scheme}.png` })
      expect((await new AxeBuilder({ page }).include('#sy-int').withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => v.id)).toEqual([])
    })
  }
}

test('before 0064 is applied the card says not available yet, no error', async ({ page }) => {
  await mock(page, { missing: true })
  await skipOnboarding(page)
  await page.goto('/admin#/system')
  const card = page.getByRole('region', { name: 'Data integrity check' })
  await expect(card.getByText(/Not available yet/).first()).toBeVisible()
  await expect(card.getByText('Could not load.')).toHaveCount(0)
})

test('a clean night shows no findings', async ({ page }) => {
  await mock(page, { empty: true })
  await skipOnboarding(page)
  await page.goto('/admin#/system')
  await expect(page.getByRole('region', { name: 'Data integrity check' }).getByText('No open findings.')).toBeVisible()
})
