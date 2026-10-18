import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// IDs and insurance screen on the docs test page (docs-harness.html, built in the e2e build). PostgREST and Storage are mocked
// with page.route and keep rows in memory. Synthetic data only: "Test Person" and a drawn card.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

const API = 'https://docs.supabase.test/'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAPAAAACWCAIAAABvmpKCAAABlElEQVR42u3aoQ3AIBRFUSbpYF8zYofAVKPZAIPvCqWpoOQkZwK4eeqnI07YRvIECBoEDYIGQSNoEDQIGgQNgkbQIGgQNAgaBI2gQdAgaBA0CBpBg6BB0CBoEDSCBkGDoEHQIGgEDYIGQcProEdvsA1BI2gQNAgaBI2gQdAgaBA0CBpBg6BB0CBoEDSCfqpc9Xd8uaAFjaAFjaAFjaAFjaARtKARtKARtKARtKAR9JyIzCcEbaERtKAFLWgELWgELWgELWgELWhBCxpBCxpBCxpBCxpBC1rQgkbQgkbQzkedjwraQiNovy5oQSNoQSNoQSNoQSNoBC1oBC1oBC1oBC1oBI2gBY2gBY2gnY86HxW0hbbQgkbQgkbQgkbQgkbQgha0oBG0oBG0oBG0oBG0oAUtaAQtaAQtaAQtaAQtaEELGkELGkELmjWCBkGDoEHQCBoEDYIGQYOgETQIGgQNggZBI2gQNAgaBA2CRtAgaBA0CBoEjaBB0CBoEDQIGkGDoEHQIGgEDYIGQYOgQdAIGgQNS7kBgH/uek4A/toAAAAASUVORK5CYII='
const card = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })

type Srv = { docs: Record<string, unknown>[]; files: Record<string, unknown>[]; objects: Map<string, Uint8Array>; uploads: number; down: boolean }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

async function mock(page: Page): Promise<Srv> {
  const s: Srv = { docs: [], files: [], objects: new Map(), uploads: 0, down: false }
  await page.addInitScript(() => {
    localStorage.setItem('bantay.onboarded', '1')
    const exp = Math.floor(Date.now() / 1000) + 36000
    localStorage.setItem('docs-harness-auth', JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: 'u1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
  })
  const json = (route: import('@playwright/test').Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  await page.route(API + '**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (s.down) return route.abort('connectionrefused')
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const p = url.pathname
    if (p.startsWith('/rest/v1/people')) return json(route, url.searchParams.get('auth_user_id') ? [{ id: 'p-self', display_name: 'Test Person' }] : [])
    if (p.startsWith('/rest/v1/carers')) return json(route, [])
    if (p.startsWith('/rest/v1/documents')) {
      if (req.method() === 'POST') { s.docs.push(req.postDataJSON()); return route.fulfill({ status: 201, headers: cors }) }
      return json(route, s.docs.map((d) => ({ id: d.id, person_id: d.person_id, kind: d.kind, card_type: d.card_type, title: d.title ?? null })))
    }
    if (p.startsWith('/rest/v1/source_files')) {
      if (req.method() === 'POST') { s.files.push(req.postDataJSON()); return route.fulfill({ status: 201, headers: cors }) }
      return json(route, s.files)
    }
    if (p.startsWith('/storage/v1/object/records/')) {
      const path = decodeURIComponent(p.replace('/storage/v1/object/records/', ''))
      if (req.method() === 'POST') { s.uploads++; s.objects.set(path, req.postDataBuffer() ?? new Uint8Array()); return json(route, { Key: 'records/' + path }) }
      const bytes = s.objects.get(path)
      return bytes ? route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: Buffer.from(PNG, 'base64') }) : json(route, { error: 'x' }, 404)
    }
    return json(route, {}, 404)
  })
  return s
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)

test('open #docs, upload front then back, view full screen, then use it with the server unreachable', async ({ page }) => {
  const s = await mock(page)
  await page.goto('/docs-harness.html#docs')
  await expect(page.getByRole('heading', { level: 1, name: 'IDs and insurance' })).toBeVisible()
  await expect(page.getByText('Only you and the admins see these · saved for offline')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload PhilSys National ID' })).toBeVisible()
  expect(await serious(page)).toEqual([])

  await page.getByRole('button', { name: 'Upload PhilSys National ID' }).click()
  await expect(page.getByRole('dialog', { name: 'Add an ID or insurance card' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Take a photo, front then back' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose a photo or PDF' })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await page.screenshot({ path: 'test-results/docs-sheet-light.png' })

  await page.getByTestId('docs-camera').setInputFiles(card('front.png'))
  await expect(page.getByRole('heading', { name: 'Now the back of the card' })).toBeVisible()
  await page.getByTestId('docs-camera').setInputFiles(card('back.png'))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/Front and back · added/)).toBeVisible()
  await expect.poll(() => s.uploads).toBe(2)
  await expect.poll(() => s.files.length).toBe(2)
  expect(s.docs).toHaveLength(1)
  expect(s.docs[0]).toMatchObject({ kind: 'id_card', card_type: 'philsys', status: 'confirmed', person_id: 'p-self' })
  expect(s.docs[0]).not.toHaveProperty('confirmed_by')
  expect(s.files.map((f) => f.side).sort()).toEqual(['back', 'front'])
  expect(s.files.every((f) => /^card-(front|back)\.png$/.test(String(f.name)) && f.drive_file_id === null)).toBe(true)
  await page.screenshot({ path: 'test-results/docs-list-light.png' })
  expect(await serious(page)).toEqual([])

  // full screen viewer
  const show = page.getByRole('button', { name: 'Show PhilSys National ID' })
  await show.click()
  const dlg = page.getByRole('dialog', { name: 'PhilSys National ID' })
  await expect(dlg).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
  await expect(dlg.getByRole('img', { name: 'PhilSys National ID, front' })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(dlg.getByRole('img', { name: 'PhilSys National ID, back' })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await page.screenshot({ path: 'test-results/docs-viewer-light.png' })
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)
  await expect(show).toBeFocused()

  // server unreachable: the card still opens from the phone's own cache
  s.down = true
  await page.reload()
  await page.getByRole('button', { name: 'Show PhilSys National ID' }).click()
  await expect(page.getByRole('img', { name: 'PhilSys National ID, front' })).toBeVisible()
})

test('dark mode: list, upload sheet and viewer', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const s = await mock(page)
  await page.goto('/docs-harness.html#docs/insurance')
  await expect(page.getByRole('button', { name: 'Insurance' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Upload PhilHealth' })).toBeVisible()
  await page.screenshot({ path: 'test-results/docs-list-dark.png' })
  expect(await serious(page)).toEqual([])
  await page.getByRole('button', { name: 'Upload PhilHealth' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: 'test-results/docs-sheet-dark.png' })
  expect(await serious(page)).toEqual([])
  await page.getByTestId('docs-file').setInputFiles(card('front.png'))
  await page.getByRole('button', { name: 'Done, front only' }).click()
  await expect.poll(() => s.uploads).toBe(1)
  await page.getByRole('button', { name: 'Show PhilHealth' }).click()
  await expect(page.getByRole('dialog', { name: 'PhilHealth' })).toBeVisible()
  await page.screenshot({ path: 'test-results/docs-viewer-dark.png' })
  expect(await serious(page)).toEqual([])
})

test('no horizontal scroll at 390 wide', async ({ page }) => {
  await mock(page)
  await page.goto('/docs-harness.html#docs')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
