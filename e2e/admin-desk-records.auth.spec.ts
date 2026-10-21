import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Admin dashboard lane LB: Records, Confirm queue, Duplicates. "auth" project; all PostgREST traffic is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const SHA = 'a'.repeat(64)

type Row = Record<string, unknown>
const state = (): Record<string, Row[]> => ({
  people: [{ id: 'p1', display_name: 'Test Person', auth_user_id: UID, photo_path: null }],
  app_roles: [{ role: 'admin', handle: 'admin', user_id: UID }],
  documents: [
    { id: 'd1', person_id: 'p1', kind: 'lab', status: 'draft', doc_date: '2026-09-01', facility: 'Test Clinic', title: 'Lab paper', created_at: '2026-10-01T00:00:00Z' },
    { id: 'a', person_id: 'p1', kind: 'prescription', status: 'draft', doc_date: '2026-08-01', facility: 'Test Clinic', title: null, created_at: '2026-10-01T00:00:00Z' },
    { id: 'b', person_id: 'p1', kind: 'prescription', status: 'draft', doc_date: '2026-08-01', facility: 'Test Clinic', title: null, created_at: '2026-10-02T00:00:00Z' }
  ],
  lab_results: [
    { id: 'l1', document_id: 'd1', person_id: 'p1', name_raw: 'LDL Test', value_num: 95, unit_raw: 'mg/dL', confidence: 0.95, status: 'draft', collected_at: '2026-09-01T00:00:00Z' },
    { id: 'l2', document_id: 'd1', person_id: 'p1', name_raw: 'Glucose Test', value_num: 180, unit_raw: 'mg/dL', confidence: 0.6, status: 'draft', collected_at: '2026-09-01T00:00:00Z' },
    { id: 'l3', document_id: 'd1', person_id: 'p1', name_raw: 'HDL Test', value_num: 50, unit_raw: 'mg/dL', confidence: 0.9, status: 'draft', collected_at: '2026-09-01T00:00:00Z' }
  ],
  vaccinations: [], imaging_reports: [],
  prescriptions: [{ id: 'rxa', document_id: 'a', status: 'draft' }, { id: 'rxb', document_id: 'b', status: 'draft' }],
  prescription_items: [
    { id: 'ia', prescription_id: 'rxa', line_no: 1, person_id: 'p1', drug_raw: 'Test Drug', dose: '1 tab', frequency: 'daily', unclear: false, confidence: 0.9, status: 'draft', created_at: '2026-10-01T00:00:00Z' },
    { id: 'ib', prescription_id: 'rxb', line_no: 1, person_id: 'p1', drug_raw: 'Test Drug', dose: '2 tabs', frequency: 'daily', unclear: false, confidence: 0.9, status: 'draft', created_at: '2026-10-02T00:00:00Z' }
  ],
  source_files: [
    { id: 'f1', document_id: 'd1', name: 'page1.jpg', mime: 'image/jpeg', drive_file_id: null, storage_path: 'p1/a.jpg', page_no: 1, sha256: 'b'.repeat(64) },
    { id: 'f2', document_id: 'a', name: 'rx.jpg', mime: 'image/jpeg', drive_file_id: 'abc123', storage_path: null, page_no: 1, sha256: SHA },
    { id: 'f3', document_id: 'b', name: 'rx2.jpg', mime: 'image/jpeg', drive_file_id: 'abc124', storage_path: null, page_no: 1, sha256: SHA }
  ]
})

// PostgREST filter subset: eq, neq, in, is.null, not.is.null, not.in, gte, lte (+ limit/offset). Unknown params (select, order, embeds) are ignored.
const match = (r: Row, q: URLSearchParams) => {
  for (const [k, v] of q) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k) || k.includes('.')) continue
    const x = String(r[k] ?? '')
    const list = (s: string) => s.replace(/^\(|\)$/g, '').split(',')
    if (v.startsWith('eq.') && x !== v.slice(3)) return false
    if (v.startsWith('neq.') && x === v.slice(4)) return false
    if (v.startsWith('in.') && !list(v.slice(3)).includes(x)) return false
    if (v === 'is.null' && r[k] != null) return false
    if (v === 'not.is.null' && r[k] == null) return false
    if (v.startsWith('not.in.') && list(v.slice(7)).includes(x)) return false
    if (v.startsWith('gte.') && x < v.slice(4)) return false
    if (v.startsWith('lte.') && x > v.slice(4)) return false
  }
  return true
}

type Patch = { table: string; body: Row; ids: string[] }
async function mock(page: Page, st: Record<string, Row[]>, patches: Patch[]) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname.startsWith('/storage/v1/')) return reply({ signedURL: '/object/sign/records/p1/a.jpg?token=t' })
    if (url.pathname.startsWith('/functions/v1/')) return reply({ ok: true, members: [] })
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply([])
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    const q = url.searchParams
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    if (req.method() === 'PATCH') {
      const hit = (st[t] ?? []).filter((r) => match(r, q))
      const body = req.postDataJSON() as Row
      for (const r of hit) Object.assign(r, body)
      patches.push({ table: t, body, ids: hit.map((r) => String(r.id)) })
      return reply(hit.map((r) => ({ id: r.id })))
    }
    if (t === 'records_queue') return reply([])
    let rows = (st[t] ?? []).filter((r) => match(r, q))
    if (t === 'app_roles' || (t === 'people' && q.has('auth_user_id'))) rows = rows.slice(0, 1)
    const lim = Number(q.get('limit') ?? 0)
    const off = Number(q.get('offset') ?? 0)
    if (lim) rows = rows.slice(off, off + lim)
    if (single) return reply(rows[0] ?? {})
    return reply(rows)
  })
}

const AREAS = [{ path: 'records', h1: 'Records' }, { path: 'queue', h1: 'Confirm queue' }, { path: 'duplicates', h1: 'Duplicates' }]
const SIZES = [{ w: 1280, h: 800 }, { w: 390, h: 844 }, { w: 820, h: 1180 }]

async function checkPage(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: sideways scroll`).toBe(true)
  const small: string[] = []
  for (const el of await page.locator('button:visible, a[href]:visible, input:visible').all()) {
    const bb = await el.boundingBox()
    if (bb && bb.height < 43.5) small.push(`${(await el.getAttribute('aria-label')) ?? (await el.innerText()) ?? ''} ${Math.round(bb.height)}px`)
  }
  expect(small, `${label}: targets under 44px`).toEqual([])
  const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
  expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `${label}: axe`).toEqual([])
}

for (const s of SIZES) {
  test(`records, queue and duplicates at ${s.w}x${s.h}: no sideways scroll, targets, axe`, async ({ page }) => {
    await page.setViewportSize({ width: s.w, height: s.h })
    await mock(page, state(), [])
    await skipOnboarding(page)
    for (const a of AREAS) {
      await page.goto(`/admin#/${a.path}`)
      await expect(page.getByRole('heading', { level: 1, name: a.h1 })).toBeVisible()
      if (a.path === 'records') await expect(page.getByRole('button', { name: 'Lab paper' })).toBeVisible()
      if (a.path === 'queue') await expect(page.getByRole('heading', { name: 'Test Person' })).toBeVisible()
      if (a.path === 'duplicates') await expect(page.getByRole('button', { name: 'Keep copy 1 in group 1' })).toBeVisible()
      await checkPage(page, `${a.path} ${s.w}`)
    }
    // the open panel and the confirm dialog are checked too
    await page.goto('/admin#/records')
    await page.getByRole('button', { name: 'Lab paper' }).click()
    await expect(page.getByRole('dialog', { name: /Papers/ })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Source page page1.jpg' })).toHaveCount(1)
    await checkPage(page, `records panel ${s.w}`)
  })
}

test('queue: bulk confirm sends the checked ids only; Undo restores', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const st = state()
  const patches: Patch[] = []
  await mock(page, st, patches)
  await skipOnboarding(page)
  await page.goto('/admin#/queue')
  await expect(page.getByRole('heading', { name: 'Test Person' })).toBeVisible()
  // l2 is low confidence so it starts unticked: l1, l3 and the two prescription lines are ticked
  await expect(page.getByLabel('Include Glucose Test')).not.toBeChecked()
  await page.getByRole('button', { name: 'Confirm 4 checked' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('4 confirmed.')).toBeVisible()
  const status = patches.filter((p) => p.body.status === 'confirmed')
  const lab = status.find((p) => p.table === 'lab_results')!
  expect([...lab.ids].sort()).toEqual(['l1', 'l3'])
  expect(status.find((p) => p.table === 'prescription_items')!.ids.sort()).toEqual(['ia', 'ib'])
  expect(st.lab_results.find((r) => r.id === 'l2')!.status).toBe('draft')
  patches.length = 0
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Put back.')).toBeVisible()
  expect(patches.find((p) => p.table === 'lab_results' && p.body.status === 'draft')!.ids.sort()).toEqual(['l1', 'l3'])
  expect(st.lab_results.map((r) => r.status)).toEqual(['draft', 'draft', 'draft'])
  // keyboard: j moves to the first row, x ticks it off
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('j')
  await expect(page.locator('[data-row="l1"]')).toBeFocused()
  await page.keyboard.press('x')
  await expect(page.getByLabel('Include LDL Test')).not.toBeChecked()
})

test('records: row opens the panel, Confirm then Undo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const st = state()
  const patches: Patch[] = []
  await mock(page, st, patches)
  await skipOnboarding(page)
  await page.goto('/admin#/records')
  await page.getByRole('button', { name: 'Labs' }).click()
  await page.getByRole('button', { name: 'LDL Test' }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByLabel('value num')).toHaveValue('95')
  await panel.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Confirmed.')).toBeVisible()
  expect(patches.find((p) => p.table === 'lab_results')).toMatchObject({ body: { status: 'confirmed' }, ids: ['l1'] })
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Put back.')).toBeVisible()
  expect(st.lab_results[0].status).toBe('draft')
})

test('duplicates: Keep this one rejects the other copy and its draft rows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const st = state()
  const patches: Patch[] = []
  await mock(page, st, patches)
  await skipOnboarding(page)
  await page.goto('/admin#/duplicates')
  await expect(page.getByRole('table', { name: /Prescription line differences/ })).toBeVisible()
  await page.getByRole('button', { name: 'Keep copy 1 in group 1' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Kept this copy.')).toBeVisible()
  expect(patches.map((p) => [p.table, p.body.status, p.ids.join()])).toEqual([['prescription_items', 'rejected', 'ib'], ['prescriptions', 'rejected', 'rxb'], ['documents', 'rejected', 'b']])
  expect(st.documents.find((d) => d.id === 'a')!.status).toBe('draft')
})
