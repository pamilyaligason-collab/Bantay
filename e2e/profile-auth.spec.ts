import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Runs in the "auth" project (build WITH Supabase env). All traffic is mocked; synthetic data only.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const SHOTS = '.scratch/shots/W1-C'
const FAMILY = [{ personId: 'p1', displayName: 'Test Person', handle: null, provider: 'pin' }, { personId: 'p2', displayName: 'Papa', handle: null, provider: 'pin' }]
const PEOPLE = [
  { id: 'p1', display_name: 'Test Person', phone: '0917 123 4567', birthdate: '1958-03-14', blood_type: 'O+', allergies: ['Penicillin'], conditions: ['High blood pressure'], medicines: ['Losartan'], photo_path: null, updated_at: '2026-10-10T10:00:00Z' },
  { id: 'p2', display_name: 'Papa', phone: '0918 222 3333', birthdate: null, blood_type: null, allergies: [], conditions: [], medicines: [], photo_path: null, updated_at: '2026-10-10T10:00:00Z' }
]
type Req = { method: string; path: string; id: string | null; body: unknown }
const LOSARTAN = { id: 'srv-m1', client_id: 'cm-losartan', person_id: 'p1', name: 'Losartan', schedule: { v: 1, times: ['08:00'] }, as_needed: false, med_status: 'active', status: 'confirmed', origin: 'rx', deleted_at: null, updated_at: '2026-10-10T10:00:00Z' }

async function mock(page: Page, reqs: Req[], scheme: 'light' | 'dark', people: Record<string, unknown>[] = PEOPLE, meds: Record<string, unknown>[] = []) {
  const medStore = new Map(meds.map((m) => [m.client_id as string, m])) // a tiny medications table: POST upserts on client_id, GET returns it
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
  }, [jwt(), user, FAMILY] as const)
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname.startsWith('/storage/v1/')) {
      reqs.push({ method: req.method(), path: url.pathname, id: null, body: null })
      return reply(url.pathname.includes('/sign/') ? { signedURL: '/object/sign/avatars/p1.jpg?token=t' } : { Key: 'avatars/p1.jpg' })
    }
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t === 'medications' && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      reqs.push({ method: 'POST', path: t, id: null, body })
      medStore.set(body.client_id as string, { ...medStore.get(body.client_id as string), ...body, updated_at: new Date().toISOString() })
      return route.fulfill({ status: 201, headers: cors })
    }
    if (t === 'medications') return reply([...medStore.values()])
    if (req.method() === 'PATCH') {
      reqs.push({ method: 'PATCH', path: t, id: url.searchParams.get('id'), body: req.postDataJSON() })
      return route.fulfill({ status: 204, headers: cors })
    }
    // maybeSingle() is a plain GET with a filter: answer with the matching rows
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'people' && url.searchParams.get('auth_user_id')) return reply([people[0]])
    if (t === 'people' && url.searchParams.get('id')?.startsWith('eq.')) return reply(people.filter((p) => `eq.${p.id}` === url.searchParams.get('id')))
    return reply(t === 'people' ? people : [])
  })
}
const medPosts = (reqs: Req[]) => reqs.filter((r) => r.method === 'POST' && r.path === 'medications').map((r) => r.body as Record<string, unknown>)
const patches = (reqs: Req[]) => reqs.filter((r) => r.method === 'PATCH' && r.path === 'people')
const shot = (page: Page, name: string, scheme: string) => page.screenshot({ path: `${SHOTS}/app-${name}-${scheme}.png` })

for (const scheme of ['light', 'dark'] as const) {
  test(`Me: My details shows the server row and saves edits as a PATCH (${scheme})`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true })
    const reqs: Req[] = []
    await mock(page, reqs, scheme, PEOPLE, [LOSARTAN])
    await page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
    await page.goto('/#me')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await shot(page, 'me', scheme)
    await page.getByRole('button', { name: 'Edit name and photo' }).click()
    const sheet = page.getByRole('dialog', { name: 'My details' })
    await expect(sheet.getByLabel('Phone number')).toHaveValue('0917 123 4567') // pulled from the server row
    await expect(sheet.getByLabel('Birthday')).toHaveValue('1958-03-14')
    await expect(sheet.getByRole('button', { name: 'O+', pressed: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Losartan', pressed: true })).toBeVisible()
    await shot(page, 'me-details', scheme)
    await sheet.getByLabel('Phone number').fill('0999 888 7777')
    await sheet.getByLabel('Phone number').blur()
    await sheet.getByRole('button', { name: 'Amlodipine' }).click()
    await expect(sheet.getByRole('button', { name: 'Morning 8:00 AM' })).toHaveCount(2) // every medicine has a time chip: Losartan and the new Amlodipine
    await expect.poll(() => patches(reqs).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1) // sync pushes after a short nudge
    await expect.poll(() => medPosts(reqs).some((m) => m.name === 'Amlodipine'), { timeout: 15_000 }).toBe(true)
    expect(patches(reqs).every((p) => p.id === 'eq.p1')).toBe(true)
    expect(patches(reqs).some((p) => (p.body as { phone?: string }).phone === '0999 888 7777')).toBe(true)
    expect(patches(reqs).some((p) => 'medicines' in (p.body as object))).toBe(false) // medicines are no longer written to the person row
    const amlo = medPosts(reqs).find((m) => m.name === 'Amlodipine')!
    expect(amlo).toMatchObject({ person_id: 'p1', status: 'confirmed', med_status: 'active', schedule: { v: 1, times: ['08:00'] } })
  })

  test(`SOS picker fills a family member's phone from their profile (${scheme})`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true })
    const reqs: Req[] = []
    await mock(page, reqs, scheme)
    await page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
    await page.goto('/#me/family')
    await page.getByRole('button', { name: /Who gets your SOS text/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(1500) // first pull stores people.phone
    await page.getByRole('button', { name: 'Papa' }).first().click()
    await expect(page.getByLabel('Contact 1 phone number')).toHaveValue('0918 222 3333')
    await shot(page, 'sos-picker', scheme)
  })

  test(`wizard: about, medicines and photo write to the person row (${scheme})`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true })
    const reqs: Req[] = []
    await mock(page, reqs, scheme, [{ id: 'p1', display_name: 'Test Person', phone: null, birthdate: null, blood_type: null, allergies: [], conditions: [], medicines: [], photo_path: null, updated_at: '2026-10-10T10:00:00Z' }])
    await page.goto('/')
    await page.getByRole('button', { name: 'Open Today' }).click() // first launch is start-done since S6a; setup opens from the card on Me
    await page.goto('/#me/phone')
    await page.getByRole('button', { name: /^Next: / }).click()
    await expect(page.getByRole('dialog', { name: 'Finish setting up' }).locator('h1')).toHaveText('Your photo')
    await shot(page, 'wizard-photo', scheme)
    await page.getByLabel('Add a photo').or(page.locator('input[type=file]')).first().setInputFiles({
      name: 'me.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    })
    await expect.poll(() => reqs.some((r) => r.method === 'POST' && r.path.includes('/storage/v1/object/avatars/p1.jpg')), { timeout: 15_000 }).toBe(true)
    await page.getByRole('button', { name: 'Step 2: About me' }).click()
    await expect(page.getByRole('dialog', { name: 'Finish setting up' }).locator('h1')).toHaveText('About me')
    await page.getByRole('button', { name: 'A+' }).click()
    await shot(page, 'wizard-about', scheme)
    await page.getByRole('button', { name: 'Step 3: Your medicines' }).click()
    await page.getByRole('button', { name: 'Metformin' }).click()
    await expect(page.getByRole('button', { name: 'Morning 8:00 AM' })).toBeVisible() // a time chip per medicine
    await page.getByRole('button', { name: 'Evening 8:00 PM' }).click()
    await shot(page, 'wizard-medicines', scheme)
    // sync starts after onboarding: the edits wait in the outbox until Finish
    for (let i = 0; i < 9 && !(await page.getByRole('button', { name: 'Finish' }).isVisible()); i++) await page.getByRole('button', { name: 'Skip' }).click()
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect.poll(() => patches(reqs).some((p) => (p.body as { photo_path?: string }).photo_path === 'p1.jpg'), { timeout: 20_000 }).toBe(true)
    await expect.poll(() => patches(reqs).some((p) => (p.body as { blood_type?: string }).blood_type === 'A+'), { timeout: 15_000 }).toBe(true)
    await expect.poll(() => medPosts(reqs).filter((m) => m.name === 'Metformin').pop()?.schedule, { timeout: 15_000 }).toEqual({ v: 1, times: ['08:00', '20:00'] })
    expect(medPosts(reqs).filter((m) => m.name === 'Metformin').pop()).toMatchObject({ person_id: 'p1', schedule: { v: 1, times: ['08:00', '20:00'] } })
    expect(medPosts(reqs).find((m) => m.name === 'Metformin')).toMatchObject({ status: 'confirmed', med_status: 'active' }) // the first write carries everything; later edits only what changed
    expect(patches(reqs).some((p) => 'medicines' in (p.body as object))).toBe(false)
  })
}
