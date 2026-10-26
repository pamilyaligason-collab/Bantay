import { expect, test, type Page, type Route } from '@playwright/test'
import { deflateSync } from 'node:zlib'

// Scan a paper on the docs test page at #scan (docs-harness.html). Supabase is mocked with page.route. The "photo" is a generated
// PNG (a light sheet on a dark table), never a real document.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

const API = 'https://docs.supabase.test/'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

function crc(buf: Buffer) {
  let c = ~0
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) }
  return ~c >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const t = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); out.writeUInt32BE(crc(t), 8 + data.length)
  return out
}
function png(w: number, h: number) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3
    const sheet = x > w * 0.1 && x < w * 0.9 && y > h * 0.1 && y < h * 0.9
    raw[o] = raw[o + 1] = raw[o + 2] = sheet ? (y % 20 < 3 ? 60 : 235) : 30
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: png(300, 400) })

type Srv = { calls: string[]; docs: Record<string, unknown>[]; files: Record<string, unknown>[]; uploads: string[]; invokes: unknown[] }
async function mock(page: Page, reply: { status: number; reading?: unknown } = { status: 200, reading: null }, dependent = false): Promise<Srv> {
  const s: Srv = { calls: [], docs: [], files: [], uploads: [], invokes: [] }
  await page.addInitScript(() => {
    localStorage.setItem('bantay.onboarded', '1')
    const exp = Math.floor(Date.now() / 1000) + 36000
    localStorage.setItem('docs-harness-auth', JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: 'u1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
  })
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  await page.route(API + '**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const p = url.pathname
    if (p.startsWith('/rest/v1/people')) return json(route, url.searchParams.get('auth_user_id') ? [{ id: 'p-self', display_name: 'Test Person' }] : dependent ? [{ id: 'p-dep', display_name: 'Test Dependent' }] : [])
    if (p.startsWith('/rest/v1/carers')) return json(route, dependent ? [{ person_id: 'p-dep' }] : [])
    if (p.startsWith('/rest/v1/documents') && req.method() === 'POST') { s.calls.push('documents'); s.docs.push(req.postDataJSON()); return route.fulfill({ status: 201, headers: cors }) }
    if (p.startsWith('/rest/v1/source_files') && req.method() === 'POST') { s.calls.push('source_files'); s.files.push(req.postDataJSON()); return route.fulfill({ status: 201, headers: cors }) }
    if (p.startsWith('/rest/v1/')) return json(route, [])
    if (p.startsWith('/storage/v1/object/records/') && req.method() === 'POST') {
      const path = decodeURIComponent(p.replace('/storage/v1/object/records/', ''))
      s.calls.push('upload'); s.uploads.push(path)
      return json(route, { Key: 'records/' + path })
    }
    if (p.startsWith('/functions/v1/records-extract')) {
      const body = req.postDataJSON()
      s.calls.push('invoke'); s.invokes.push(body)
      if (body?.mode === 'reading') return reply.status === 200 ? json(route, { ok: true, reading: reply.reading }) : json(route, { ok: false, error: reply.status === 429 ? 'rate_limited' : 'read_failed' }, reply.status)
      return json(route, { ok: true })
    }
    return json(route, {}, 404)
  })
  return s
}

test('photo, crop, two pages, form, Save: pages queue, upload in order, the server is asked to read', async ({ page }) => {
  const s = await mock(page)
  await page.goto('/docs-harness.html#scan')
  await expect(page.getByRole('heading', { level: 1, name: 'Scan & Capture' })).toBeVisible()

  // page 1
  await page.getByTestId('scan-camera').setInputFiles(photo('one.png'))
  await page.getByRole('button', { name: 'Paper' }).click() // what is in the photo?
  await expect(page.getByTestId('corner-0')).toBeVisible()
  const crop = await page.locator('.sc-crop').boundingBox()
  const c0 = await page.getByTestId('corner-0').boundingBox()
  // handles start 6% in and are at least 44px to touch
  expect(c0!.width).toBeGreaterThanOrEqual(44)
  expect(Math.round(((c0!.x + c0!.width / 2 - crop!.x) / crop!.width) * 100)).toBe(6)
  await page.mouse.move(c0!.x + 22, c0!.y + 22)
  await page.mouse.down()
  await page.mouse.move(c0!.x + 22 + 20, c0!.y + 22 + 20, { steps: 4 })
  await page.mouse.up()
  const moved = await page.getByTestId('corner-0').boundingBox()
  expect(moved!.x).toBeGreaterThan(c0!.x + 10)
  await page.getByRole('button', { name: 'Rotate' }).click()
  await expect(page.getByTestId('corner-0')).toBeVisible()
  await page.screenshot({ path: process.env.SCAN_SHOTS ? `${process.env.SCAN_SHOTS}/crop.png` : undefined })
  await page.getByRole('button', { name: 'Add page' }).click() // adds page 1 and opens the camera again

  // page 2
  await expect(page.getByTestId('scan-page')).toHaveCount(1)
  await page.getByTestId('scan-camera').setInputFiles(photo('two.png'))
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('scan-page')).toHaveCount(2)
  await page.getByRole('button', { name: 'Move page 2 up' }).click()
  await page.getByRole('button', { name: 'Delete page 1' }).click()
  await expect(page.getByTestId('scan-page')).toHaveCount(1)
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByTestId('scan-camera').setInputFiles(photo('three.png'))
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('scan-page')).toHaveCount(2)
  await page.getByRole('button', { name: 'Continue' }).click()

  // form
  await page.getByRole('button', { name: 'Prescription' }).click()
  await page.getByLabel('Date on the paper (optional)').fill('2026-03-04')
  await page.screenshot({ path: process.env.SCAN_SHOTS ? `${process.env.SCAN_SHOTS}/form.png` : undefined })
  await page.getByRole('button', { name: 'Save' }).click()

  await expect.poll(() => s.invokes.length).toBe(1)
  expect(s.uploads).toHaveLength(2)
  expect(s.uploads[0]).toMatch(/^p-self\/[0-9a-f-]{36}\/p01\.jpg$/)
  expect(s.uploads[1]).toMatch(/\/p02\.jpg$/)
  expect(s.docs).toHaveLength(1)
  expect(s.docs[0]).toMatchObject({ kind: 'prescription', status: 'draft', person_id: 'p-self', doc_date: '2026-03-04' })
  expect(s.files.map((f) => f.page_no)).toEqual([1, 2])
  expect(s.invokes[0]).toEqual({ document_id: s.docs[0]!.id })
  // order: every upload and row before the invoke
  expect(s.calls[s.calls.length - 1]).toBe('invoke')
  expect(s.calls.filter((c) => c === 'upload')).toHaveLength(2)
  // the queue on the phone is empty once everything went up
  const left = await page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open('bantay-docs')
    r.onsuccess = () => { const q = r.result.transaction('queue').objectStore('queue').count(); q.onsuccess = () => res(q.result) }
  }))
  expect(left).toBe(0)
})

test('offline: Save keeps the pages queued and nothing is sent', async ({ page, context }) => {
  const s = await mock(page)
  await page.goto('/docs-harness.html#scan')
  await page.getByTestId('scan-file').setInputFiles(photo('one.png'))
  await page.getByRole('button', { name: 'Paper' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('button', { name: 'Me' })).toBeVisible() // the family list came while there was signal
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#health/papers')
  const queued = await page.evaluate(() => new Promise<{ page: number; pages: number; kind: string }[]>((res) => {
    const r = indexedDB.open('bantay-docs')
    r.onsuccess = () => { const q = r.result.transaction('queue').objectStore('queue').getAll(); q.onsuccess = () => res(q.result) }
  }))
  expect(queued).toHaveLength(1)
  expect(queued[0]).toMatchObject({ page: 1, pages: 1, kind: 'lab' })
  expect(s.calls).toEqual([])
})

// S11 (hazard K1): with more than one person on the list nobody is pre-picked; Save waits for an explicit pick.
test('two people: a paper is not filed under anyone until a person is picked', async ({ page }) => {
  const s = await mock(page, { status: 200, reading: null }, true)
  await page.goto('/docs-harness.html#scan')
  await page.getByTestId('scan-file').setInputFiles(photo('one.png'))
  await page.getByRole('button', { name: 'Paper' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  const chip = (n: string) => page.getByRole('group', { name: 'Whose paper' }).getByRole('button', { name: n })
  await expect(chip('Test Dependent')).toBeVisible() // the fresh family list arrived
  await expect(chip('Me')).toHaveAttribute('aria-pressed', 'false')
  await expect(chip('Test Dependent')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('status').filter({ hasText: 'Pick whose paper this is' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await chip('Test Dependent').click()
  await expect(chip('Test Dependent')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Pick whose paper this is')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => s.docs.length).toBe(1)
  expect(s.docs[0]).toMatchObject({ person_id: 'p-dep' })
})

test('two people: a device reading shows no numbers to save until a person is picked', async ({ page }) => {
  await mock(page, { status: 200, reading: { kind: 'bp', systolic: 128, diastolic: 82, pulse: 71, value: null, unit: 'mmHg', confidence: 0.95 } }, true)
  await page.goto('/docs-harness.html#scan')
  await page.getByTestId('scan-camera').setInputFiles(photo('bp.png'))
  await page.getByRole('button', { name: /Device reading/ }).click()
  await expect(page.getByText('Pick whose reading this is')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('reading-confirm')).toHaveCount(0)
  await page.getByRole('group', { name: 'Whose reading' }).getByRole('button', { name: 'Test Dependent' }).click()
  await expect(page.getByTestId('reading-confirm')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save reading' })).toBeEnabled()
})

// Never open a database that is not there yet: that would create an empty one and break the app's own open.
const readings = (page: Page) => page.evaluate(async () => {
  if (!(await indexedDB.databases()).some((d) => d.name === 'bantay-health')) return []
  return new Promise<{ test: string; value: number; unit: string }[]>((res) => {
    const r = indexedDB.open('bantay-health')
    r.onsuccess = () => {
      if (!r.result.objectStoreNames.contains('readings')) return res([])
      const q = r.result.transaction('readings').objectStore('readings').getAll()
      q.onsuccess = () => { r.result.close(); res(q.result) }
    }
  })
})
const shot = (page: Page, name: string) => page.screenshot({ path: process.env.SCAN_SHOTS ? `${process.env.SCAN_SHOTS}/${name}.png` : undefined })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`device reading, ${scheme}`, () => {
    test.use({ colorScheme: scheme })

    test('photo, Device reading, numbers shown to confirm, edit one, Save writes readings and no document', async ({ page }) => {
      const s = await mock(page, { status: 200, reading: { kind: 'bp', systolic: 128, diastolic: 82, pulse: 71, value: null, unit: 'mmHg', confidence: 0.7 } }) // under 0.9: each number must be tapped
      await page.goto('/docs-harness.html#scan')
      await page.getByTestId('scan-camera').setInputFiles(photo('bp.png'))
      await expect(page.getByRole('heading', { name: 'What is in the photo?' })).toBeVisible()
      await shot(page, `choose-${scheme}`)
      await page.getByRole('button', { name: /Device reading/ }).click()
      await expect(page.getByTestId('reading-confirm')).toBeVisible({ timeout: 20_000 }) // the photo is decoded and sent first
      await expect(page.getByLabel('Top', { exact: true })).toHaveValue('128')
      await expect(page.getByLabel('Bottom', { exact: true })).toHaveValue('82')
      await expect(page.getByLabel('Pulse', { exact: true })).toHaveValue('71')
      expect(s.invokes[0]).toMatchObject({ mode: 'reading', mime: 'image/jpeg' })
      expect(typeof (s.invokes[0] as { image_base64: string }).image_base64).toBe('string')
      expect((await page.getByLabel('Top', { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(48)
      await expect(page.getByTestId('reading-verdict')).toHaveAttribute('data-state', 'above')
      await expect(page.getByRole('button', { name: /^Confirm / })).toHaveCount(3)
      await expect(page.getByRole('button', { name: 'Save reading' })).toBeDisabled()
      await shot(page, `confirm-${scheme}`)
      await page.getByLabel('Top', { exact: true }).fill('132') // editing a number confirms it; the other two are tapped
      await page.getByTestId('tap-diastolic').click()
      await expect(page.getByRole('button', { name: 'Save reading' })).toBeDisabled() // pulse still waits
      await page.getByTestId('tap-pulse').click()
      await expect(page.getByRole('button', { name: 'Save reading' })).toBeEnabled()
      expect(await readings(page)).toHaveLength(0) // nothing is saved until the person confirms
      await page.getByRole('button', { name: 'Save reading' }).click()
      await expect(page.getByText('Reading saved.')).toBeVisible()
      expect((await readings(page)).map((r) => [r.test, r.value, r.unit])).toEqual([['bp_systolic', 132, 'mmHg'], ['bp_diastolic', 82, 'mmHg'], ['heart_rate', 71, 'bpm']])
      expect(s.docs).toHaveLength(0)
      expect(s.uploads).toHaveLength(0)
    })

    test('over the daily limit (429): the limit note shows, fields are empty, nothing is saved', async ({ page }) => {
      await mock(page, { status: 429 })
      await page.goto('/docs-harness.html#scan')
      await page.getByTestId('scan-camera').setInputFiles(photo('bp.png'))
      await page.getByRole('button', { name: /Device reading/ }).click()
      await expect(page.getByText(/Too many photo reads today/)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByLabel('Top', { exact: true })).toHaveValue('')
      await shot(page, `limit-${scheme}`)
      expect(await readings(page)).toHaveLength(0)
    })

    test('the server could not read it: fields are empty (not 0) and the person types the numbers', async ({ page }) => {
      await mock(page, { status: 502 })
      await page.goto('/docs-harness.html#scan')
      await page.getByTestId('scan-camera').setInputFiles(photo('bp.png'))
      await page.getByRole('button', { name: /Device reading/ }).click()
      await expect(page.getByTestId('reading-confirm')).toBeVisible({ timeout: 20_000 }) // the photo is decoded and sent first
      await expect(page.getByLabel('Top', { exact: true })).toHaveValue('')
      await expect(page.getByText(/Could not read the photo/)).toBeVisible({ timeout: 20_000 })
      await page.getByRole('button', { name: 'Save reading' }).click()
      await expect(page.getByRole('alert')).toContainText('Type the top and the bottom number')
      await shot(page, `empty-${scheme}`)
      expect(await readings(page)).toHaveLength(0)
    })
  })
}
