import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Runs in the "auth" project (build WITH Supabase env). All PostgREST traffic is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

const doc = { id: 'd1', person_id: 'p1', kind: 'lab', doc_date: '2026-09-01', facility: 'Test Clinic', title: null, status: 'draft', confidence: 0.9, confirmed_by: null, confirmed_at: null }
const lab = (id: string, name: string, value: number, o: Record<string, unknown> = {}) => ({ id, document_id: 'd1', person_id: 'p1', name_raw: name, value_num: value, value_text: null, unit_raw: 'mg/dL', test_code: 'ldl', flag: 'N', ref_low: 0, ref_high: 130, ref_text: null, collected_at: null, confidence: 0.95, value_canonical: value, ...o })
const LABS = [lab('l1', 'LDL Test', 95), lab('l2', 'Glucose Test', 180, { test_code: 'fasting_glucose', ref_high: 100, flag: 'H', confidence: 0.6 })]
type Patch = { table: string; body: unknown; id: string | null }

async function mock(page: Page, patches: Patch[]) {
  let confirmed = 0 // labs confirmed so far
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const t = url.pathname.replace('/rest/v1/', '')
    const q = url.searchParams
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply('44444444-4444-4444-8444-444444444444')
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    if (req.method() === 'PATCH') {
      patches.push({ table: t, body: req.postDataJSON(), id: q.get('id') })
      const ids = (q.get('id') ?? '').replace(/^(in\.\(|eq\.)/, '').replace(/\)$/, '').split(',').filter(Boolean)
      if (t === 'lab_results' && (req.postDataJSON() as { status?: string }).status === 'confirmed') confirmed += ids.length
      return reply(ids.map((id) => ({ id })))
    }
    if (single) return reply({})
    const status = q.get('status')?.replace('eq.', '')
    const done = confirmed >= LABS.length
    const stat = (i: number) => (i < confirmed ? 'confirmed' : 'draft')
    if (t === 'people') return reply([{ id: 'p1', display_name: 'Test Person' }])
    if (t === 'records_queue') return reply(done ? [] : [{ person_id: 'p1', kind: 'lab_results', drafts: LABS.length - confirmed }, { person_id: 'p1', kind: 'documents', drafts: 1 }])
    if (t === 'documents') {
      if (status === 'draft') return reply(done ? [] : [doc])
      if (status === 'confirmed') return reply(done ? [{ ...doc, status: 'confirmed', confirmed_by: UID, confirmed_at: '2026-10-18T01:00:00Z' }] : [])
      return reply([])
    }
    if (t === 'lab_results') {
      if (q.get('document_id')) return reply(LABS.map((l, i) => ({ id: l.id, status: stat(i) })))
      if (status === 'draft') return reply(LABS.map((l, i) => ({ ...l, status: stat(i) })).filter((l) => l.status === 'draft'))
      return reply(LABS.map((l, i) => ({ ...l, status: stat(i) })).filter((l) => l.status === 'confirmed'))
    }
    if (t === 'source_files') return reply([{ id: 'f1', name: 'scan.pdf', mime: 'application/pdf', drive_file_id: 'abc123', document_id: 'd1' }])
    if (t === 'test_catalog') return reply([{ code: 'ldl', name: 'LDL cholesterol', unit: 'mg/dL', conversions: {} }, { code: 'fasting_glucose', name: 'Fasting glucose', unit: 'mg/dL', conversions: { 'mmol/L': 18.016 } }])
    return reply([])
  })
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ' ' + v.nodes.map((n) => n.target + ' ' + (n.any[0]?.message ?? '')).join(' | '))

for (const scheme of ['light', 'dark'] as const) {
  test(`queue, confirm sheet and record detail (${scheme}, 390x844)`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    const patches: Patch[] = []
    await mock(page, patches)
    await skipOnboarding(page)
    await page.goto('/#records')

    const entry = page.getByRole('button', { name: /To check \(2\)/ })
    await expect(entry).toBeVisible()
    await entry.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'To check' })).toBeFocused()
    await expect(sheet.getByRole('button', { name: /Lab results, 2026-09-01/ })).toContainText('Test · Test Clinic')
    await page.screenshot({ path: `test-results/records-queue-${scheme}.png` })
    expect(await serious(page)).toEqual([])

    await sheet.getByRole('button', { name: /Lab results, 2026-09-01/ }).click()
    await expect(sheet.getByRole('heading', { name: 'Lab results, 2026-09-01' })).toBeFocused()
    await expect(sheet.getByRole('link', { name: /Open original/ })).toHaveAttribute('href', 'https://drive.google.com/file/d/abc123/view')
    await expect(sheet.locator('[data-row="l2"]')).toHaveAttribute('data-flagged', 'true')
    for (const b of await sheet.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await page.screenshot({ path: `test-results/records-sheet-${scheme}.png` })
    expect(await serious(page)).toEqual([])

    // l2 is low confidence so it starts unchecked: confirm all checked sends l1 only, as { status } and nothing else
    await sheet.getByRole('button', { name: /Confirm all checked \(1\)/ }).click()
    await expect(sheet.getByRole('status')).toHaveText('1 confirmed')
    const first = patches.find((p) => p.table === 'lab_results')!
    expect(first.body).toEqual({ status: 'confirmed' })
    expect(first.id).toContain('l1')
    expect(first.id).not.toContain('l2')
    await sheet.getByRole('button', { name: 'Confirm Glucose Test' }).click()
    await expect(sheet.getByRole('heading', { name: 'To check' })).toBeVisible()
    await expect(sheet.getByText('Nothing to check')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(page.getByRole('button', { name: /To check/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Lab results, Test Clinic' }).click()
    await expect(page.getByRole('heading', { name: 'Lab results' })).toBeFocused()
    await expect(page.getByTestId('rd-results')).toContainText('Above range') // 180 vs the lab range up to 100
    await expect(page.getByTestId('rd-results')).toContainText('Within range')
    await expect(page.getByText("by you, 2026-10-18")).toBeVisible()
    await page.screenshot({ path: `test-results/records-detail-${scheme}.png` })
    expect(await serious(page)).toEqual([])
  })
}
