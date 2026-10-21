import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Runs in the "auth" project (build WITH Supabase env). All traffic is mocked; synthetic data only. Lane LC: Files, IDs, History.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const FULL = '9999-0000-7777-4321' // synthetic number the reveal RPC returns
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }

const file = (id: string, status: string, o: Record<string, unknown> = {}) => ({
  id, person_id: 'p1', name: `${id}.jpg`, page_no: 1, ingest_status: status, ingest_error: null, ingest_tries: 1, created_at: '2026-10-01T01:00:00Z',
  storage_path: `p1/${id}.jpg`, drive_file_id: null, documents: { kind: 'lab', page_count: 2 }, ...o
})
const FILES = [file('scan-a', 'failed', { ingest_error: 'too_many_tries', ingest_tries: 3 }), file('scan-b', 'done'), file('scan-c', 'reading')]
const IDS = [
  { id: 'i1', source: 'id', label: 'sss', plan: null, last4: '4321', issued_on: '2024-01-01', expires_on: '2000-01-01', status: 'draft', source_file_id: null, confidence: 0.9 },
  { id: 'i2', source: 'insurance', label: 'Test Carrier', plan: 'Gold', last4: null, issued_on: null, expires_on: null, status: 'confirmed', source_file_id: null, confidence: null }
]
const AUDIT = [
  { id: 2, at: '2026-10-02T01:00:00Z', actor: null, tbl: 'person_identifiers', row_id: 'r2', person_id: 'p1', action: 'reveal', fields: ['id_number'] },
  { id: 1, at: '2026-10-01T01:00:00Z', actor: UID, tbl: 'lab_results', row_id: 'r1', person_id: 'p1', action: 'update', fields: ['value_num', 'unit_raw'] }
]
type Hit = { table: string; method: string; body: unknown }

async function mock(page: Page, hits: Hit[]) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', 'content-range': '0-0/0' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const t = url.pathname.replace('/rest/v1/', '')
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname.startsWith('/functions/v1/')) return reply({ ok: true, members: [] })
    if (url.pathname === '/rest/v1/rpc/admin_identifiers') return reply(IDS)
    if (url.pathname === '/rest/v1/rpc/admin_reveal_identifier') { hits.push({ table: 'reveal', method: 'POST', body: req.postDataJSON() }); return reply(FULL) }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply(null)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() === 'PATCH') { hits.push({ table: t, method: 'PATCH', body: req.postDataJSON() }); return reply([{ id: 'x' }]) }
    if (req.method() === 'HEAD') return reply([])
    if (t === 'app_roles') return reply({ role: 'admin', handle: 'admin' })
    if (single) return reply(t === 'people' ? { id: 'p1' } : {})
    if (t === 'people') return reply([{ id: 'p1', display_name: 'Test Person', auth_user_id: UID, photo_path: null }])
    if (t === 'records_queue') return reply([])
    if (t === 'source_files') {
      const st = url.searchParams.get('ingest_status')?.replace('eq.', '')
      return reply(st ? FILES.filter((f) => f.ingest_status === st) : FILES)
    }
    if (t === 'audit_log') return reply(AUDIT)
    if (t === 'records_dedupe_log') return reply([{ id: 1, at: '2026-10-01T01:00:00Z', tbl: 'lab_results', row_id: 'abcdef12-0000', old_status: 'draft' }])
    return reply([])
  })
}

const SIZES = [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 820, height: 1180 }]

/** No sideways page scroll, axe wcag2a+aa clean, every control in the page body at least 44 px tall. */
async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
  expect(v.map((x) => x.id + ' ' + x.nodes.map((n) => n.target).join(' | '))).toEqual([])
  const small = await page.$$eval('.dk-main button, .dk-main a[href], .dk-main select, .dk-main input', (els) =>
    els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5 }).map((e) => e.outerHTML.slice(0, 90)))
  expect(small).toEqual([])
}
const open = async (page: Page, hash: string, hits: Hit[] = [], size = SIZES[0]) => {
  await page.setViewportSize(size)
  await mock(page, hits)
  await skipOnboarding(page)
  await page.goto(hash)
}

for (const size of SIZES) {
  test(`files page ${size.width}x${size.height}`, async ({ page }) => {
    await open(page, '/admin#/files', [], size)
    await expect(page.getByRole('heading', { name: 'Files and scans' })).toBeVisible()
    await expect(page.getByRole('row', { name: /scan-a\.jpg/ })).toContainText('Tried too many times')
    await checkLayout(page)
  })
  test(`ids page ${size.width}x${size.height}`, async ({ page }) => {
    await open(page, '/admin#/ids/p1', [], size)
    await expect(page.getByText('•••• 4321')).toBeVisible()
    await checkLayout(page)
    await page.getByRole('button', { name: 'Edit SSS ending 4321' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit SSS' })).toBeVisible()
    await checkLayout(page)
  })
  test(`history page ${size.width}x${size.height}`, async ({ page }) => {
    await open(page, '/admin#/history', [], size)
    await expect(page.getByText('value_num, unit_raw')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'System' })).toBeVisible()
    await checkLayout(page)
    await page.getByRole('button', { name: /Duplicate clean-up/ }).click()
    await expect(page.getByText('abcdef12')).toBeVisible()
    await checkLayout(page)
  })
}

test('files: Retry asks first, then resets the scan', async ({ page }) => {
  const hits: Hit[] = []
  await open(page, '/admin#/files', hits)
  await expect(page.getByRole('button', { name: /^Retry / })).toHaveCount(1) // only the failed row
  await page.getByRole('button', { name: 'Retry scan-a.jpg' }).click()
  expect(hits).toHaveLength(0)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Queued to read again.')).toBeVisible()
  expect(hits).toContainEqual({ table: 'source_files', method: 'PATCH', body: { ingest_status: 'new', ingest_tries: 0, ingest_error: null } })
})

test('ids: masked by default, Show reveals for 30 s then hides', async ({ page }) => {
  const hits: Hit[] = []
  await page.clock.install()
  await open(page, '/admin#/ids/p1', hits)
  await expect(page.getByText('•••• 4321')).toBeVisible()
  await expect(page.getByText('••••••••', { exact: true })).toBeVisible()
  expect(await page.content()).not.toContain(FULL)
  await page.getByRole('button', { name: 'Show number for SSS ending 4321' }).click()
  await expect(page.getByText(FULL)).toBeVisible()
  expect(hits).toContainEqual({ table: 'reveal', method: 'POST', body: { p_source: 'id', p_id: 'i1' } })
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(FULL)
  await page.clock.fastForward(29_000)
  await expect(page.getByText(FULL)).toBeVisible()
  await page.clock.fastForward(2_000)
  await expect(page.getByText(FULL)).toHaveCount(0)
  await expect(page.getByText('•••• 4321')).toBeVisible()
})
