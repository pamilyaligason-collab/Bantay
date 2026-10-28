import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { shotPath } from './shotPath'

// Admin dashboard lane LB: Records, Confirm queue, Duplicates. "auth" project; all PostgREST traffic is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }
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
    { id: 'l1', document_id: 'd1', person_id: 'p1', name_raw: 'LDL Test', value_num: 105, unit_raw: 'mg/dL', flag: 'H', ref_low: 0, ref_high: 100, confidence: 0.95, status: 'draft', collected_at: '2026-09-01T00:00:00Z' },
    { id: 'l2', document_id: 'd1', person_id: 'p1', name_raw: 'Glucose Test', value_num: 180, unit_raw: 'mg/dL', confidence: 0.6, status: 'draft', collected_at: '2026-09-01T00:00:00Z' },
    { id: 'l3', document_id: 'd1', person_id: 'p1', name_raw: 'HDL Test', value_num: 50, unit_raw: 'mg/dL', confidence: 0.9, status: 'draft', collected_at: '2026-09-01T00:00:00Z' }
  ],
  vaccinations: [], imaging_reports: [],
  prescriptions: [{ id: 'rxa', document_id: 'a', person_id: 'p1', rx_date: '2026-08-01', prescriber: 'Dr Test', status: 'draft' }, { id: 'rxb', document_id: 'b', person_id: 'p1', rx_date: '2026-08-01', prescriber: 'Dr Test', status: 'draft' }],
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
    if (req.method() === 'HEAD') {
      const n = (st[t] ?? []).filter((r) => match(r, q)).length
      return route.fulfill({ status: 200, headers: { ...cors, 'content-range': `*/${n}` }, body: '' })
    }
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
  expect(await page.evaluate(() => [...document.querySelectorAll('.wa-main *')].filter((e) => !e.closest('.dk-scrollx, .dk-tabs') && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.tagName + '.' + e.className)), `${label}: content past the right edge`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: page scrolls sideways`).toBe(true)
  const small: string[] = []
  for (const el of await page.locator('.wa-main button:visible, .wa-main a[href]:visible, .wa-main input:visible, .wa-main select:visible').all()) {
    const bb = await el.boundingBox()
    if (bb && bb.height < (page.viewportSize()!.width < 768 ? 43.5 : 39.5)) small.push(`${(await el.getAttribute('aria-label')) ?? (await el.innerText()) ?? ''} ${Math.round(bb.height)}px`)
  }
  expect(small, `${label}: targets under 44px`).toEqual([])
  const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
  expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `${label}: axe`).toEqual([])
}

for (const s of SIZES) {
  test(`records, queue and duplicates at ${s.w}x${s.h}: no sideways scroll, targets, axe`, async ({ page }) => {
    test.setTimeout(120_000) // four axe passes take 25-30 s on a loaded machine; the default 30 s was the limit
    await page.setViewportSize({ width: s.w, height: s.h })
    await mock(page, state(), [])
    await skipOnboarding(page)
    for (const a of AREAS) {
      await page.goto(`/admin#/${a.path}`)
      await expect(page.getByRole('heading', { level: 1, name: a.h1 })).toBeVisible()
      if (a.path === 'records') await expect(page.getByRole('button', { name: 'LDL Test' })).toBeVisible()
      if (a.path === 'queue') await expect(page.getByRole('heading', { name: 'Test Person' })).toBeVisible()
      if (a.path === 'duplicates') await expect(page.getByRole('button', { name: 'Keep copy 1 in group 1' })).toBeVisible()
      await checkPage(page, `${a.path} ${s.w}`)
    }
    // the open panel and the confirm dialog are checked too
    await page.goto('/admin#/records')
    await page.getByRole('button', { name: 'LDL Test' }).click()
    await expect(page.getByRole('dialog', { name: /Laboratory/ })).toBeVisible()
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
  await page.getByRole('button', { name: 'LDL Test' }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByLabel('Value', { exact: true })).toHaveValue('105')
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

// ---- Records: a tab per type (lane W4) ----
const TAB_LINKS = ['Laboratory', 'Prescriptions', 'Medicines', 'Imaging', 'Vaccinations', 'IDs and insurance', 'Papers', 'Allergies and conditions', 'Visits']
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/w4-${name}.png`, fullPage: true })

for (const s of SIZES) {
  test(`records tabs at ${s.w}x${s.h}: every tab, no sideways scroll, targets, axe`, async ({ page }) => {
    test.setTimeout(120_000) // 9 tabs x axe in one test
    await page.setViewportSize({ width: s.w, height: s.h })
    await mock(page, state(), [])
    await skipOnboarding(page)
    await page.goto('/admin#/records/p1/lab')
    const nav = page.getByRole('navigation', { name: 'Kinds of record' })
    await expect(nav.getByRole('link', { name: /^Laboratory/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: 'LDL Test' })).toBeVisible()
    await expect(page.getByText('High', { exact: true })).toBeVisible() // flag as text, not colour only
    await checkPage(page, `lab ${s.w}`)
    if (s.w !== 820) await shot(page, `lab-${s.w}`)
    for (const name of TAB_LINKS.slice(1)) {
      await nav.getByRole('link', { name: new RegExp(`^${name}`) }).click()
      await expect(nav.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('tabpanel')).toHaveCount(0) // links in the page, not the embedded tablist
      if (name === 'Prescriptions') { await expect(page.getByRole('region', { name: /^Prescription 2026-08-01/ }).first()).toBeVisible(); if (s.w !== 820) await shot(page, `rx-${s.w}`) }
      if (name === 'IDs and insurance') await expect(page.getByText('No IDs or insurance on file.')).toBeVisible()
      await checkPage(page, `${name} ${s.w}`)
    }
    await expect(page).toHaveURL(/#\/records\/p1\/visits$/)
  })
}

test('records tabs in dark mode: axe', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mock(page, state(), [])
  await skipOnboarding(page)
  for (const tab of ['lab', 'rx', 'papers']) {
    await page.goto(`/admin#/records/p1/${tab}`)
    await expect(page.getByRole('navigation', { name: 'Kinds of record' })).toBeVisible()
    await page.waitForTimeout(300)
    const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `dark ${tab}: axe`).toEqual([])
  }
})

test('records: tab badges, person select routes, bulk confirm sends the ticked ids and Undo restores', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const st = state()
  const patches: Patch[] = []
  await mock(page, st, patches)
  await skipOnboarding(page)
  await page.goto('/admin#/records/all/lab')
  await expect(page.getByRole('link', { name: 'Laboratory 3' })).toBeVisible()
  await page.getByLabel('Person').selectOption('p1')
  await expect(page).toHaveURL(/#\/records\/p1\/lab$/)
  await page.getByRole('checkbox', { name: 'Select LDL Test' }).check()
  await page.getByRole('checkbox', { name: 'Select HDL Test' }).check()
  await page.getByRole('button', { name: 'Confirm 2' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('2 confirmed.')).toBeVisible()
  expect(patches.find((p) => p.table === 'lab_results')!.ids.sort()).toEqual(['l1', 'l3'])
  patches.length = 0
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Put back.')).toBeVisible()
  expect(st.lab_results.map((r) => r.status)).toEqual(['draft', 'draft', 'draft'])
})


// ---- Lane ADM-C: error states, split view, tabs ----
const failTable = (page: Page, table: string) => page.route(`${API}/rest/v1/${table}*`, (route) => route.fulfill({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: '{"message":"x"}' }))

for (const [path, table, empty] of [['queue', 'documents', 'Nothing to confirm.'], ['duplicates', 'documents', 'No duplicate papers.'], ['records/p1/lab', 'lab_results', 'No laboratory for these filters']] as const) {
  test(`${path}: a load error shows Retry, not "${empty}"`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mock(page, state(), [])
    await skipOnboarding(page)
    await failTable(page, table)
    await page.goto(`/admin#/${path}`)
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(page.getByText(empty, { exact: false })).toHaveCount(0)
  })
}

test('queue: source paper beside the values at 1440, below at 1024; sticky Confirm', async ({ page }) => {
  await mock(page, state(), [])
  await skipOnboarding(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin#/queue')
  const src = page.getByRole('complementary', { name: 'Source paper' })
  await expect(src.getByRole('img', { name: 'Source page page1.jpg' })).toHaveCount(1)
  const t = (await page.locator('.rc-qt').first().boundingBox())!, s = (await src.boundingBox())!
  expect(s.x).toBeGreaterThanOrEqual(t.x + t.width - 1) // beside, not under
  await expect(page.getByText('Range 0 to 100')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm 4 checked' })).toBeInViewport()
  await page.screenshot({ path: shotPath('docs/session-9/shots/adm-c/queue-1440-light.png'), fullPage: true })
  await page.setViewportSize({ width: 1024, height: 800 })
  const t2 = (await page.locator('.rc-qt').first().boundingBox())!, s2 = (await src.boundingBox())!
  expect(s2.y).toBeGreaterThan(t2.y + t2.height - 1) // stacked below
})

test('queue at 390: rows are cards and Fix is on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, state(), [])
  await skipOnboarding(page)
  await page.goto('/admin#/queue')
  const fix = page.getByRole('button', { name: 'Fix LDL Test' })
  await expect(fix).toBeInViewport()
  const bb = (await fix.boundingBox())!
  expect(bb.x + bb.width).toBeLessThanOrEqual(391)
  expect(await page.locator('.rc-qt').first().evaluate((t) => getComputedStyle(t).display)).toBe('block')
  expect(await page.locator('.rc-qt thead').first().evaluate((t) => t.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('table', { name: /Lab paper/ })).toHaveCount(1) // table semantics survive display:block
  const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
  expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})

test('queue: #/queue/<personId> shows that person only', async ({ page }) => {
  await mock(page, state(), [])
  await skipOnboarding(page)
  await page.goto('/admin#/queue/p1')
  await expect(page.getByRole('heading', { name: 'Test Person' })).toBeVisible()
  await page.goto('/admin#/queue/nobody')
  await expect(page.getByText('Nothing to confirm.')).toBeVisible()
})

test('records: nine tabs scroll with a More button at 1024', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await mock(page, state(), [])
  await skipOnboarding(page)
  await page.goto('/admin#/records/p1/lab')
  const more = page.getByRole('button', { name: 'Show more kinds of record' })
  await expect(more).toBeVisible()
  await more.click()
  await expect(page.getByRole('link', { name: /^Visits/ })).toBeInViewport()
})

test('shots: queue, records and duplicates, light and dark, 1440 and 390', async ({ page }) => {
  test.setTimeout(240_000)
  await mock(page, state(), [])
  await skipOnboarding(page)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const s of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
      await page.setViewportSize({ width: s.w, height: s.h })
      for (const [name, path, ready] of [['queue', 'queue', 'Source paper'], ['records', 'records/p1/lab', 'LDL Test'], ['duplicates', 'duplicates', 'Keep copy 1 in group 1']] as const) {
        await page.goto(`/admin#/${path}`)
        await expect(page.getByText(ready, { exact: false }).or(page.getByRole('button', { name: ready })).first()).toBeVisible()
        await page.waitForTimeout(400)
        await page.screenshot({ path: shotPath(`docs/session-9/shots/adm-c/${name}-${s.w}-${scheme}.png`), fullPage: true })
      }
    }
  }
})
