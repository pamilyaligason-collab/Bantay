import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S14 lane L: Lab results screen, lab detail and the Overview row (mockup v8 health-labs, health-labs-empty, health-labdetail; D-9, D-38).
// Runs in the "auth" project (build WITH test Supabase env). A made-up member; PostgREST is mocked; all data is invented. The clock is frozen (Tue 27 Oct 2026 9:12 AM local).
// Shots (390x844, light and dark) are written only when S14_SHOTS=<dir> is set.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const SHOTS = process.env.S14_SHOTS
const NOW = new Date(2026, 9, 27, 9, 12)
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Mama' }]
type Row = Record<string, unknown>

async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-27T09:00', temperature_2m: 31, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'documents') return reply([{ id: 'd1', person_id: 'me', kind: 'lab', doc_date: '2026-10-02', facility: 'GenSan Medical Lab', title: null, status: 'confirmed', confirmed_by: UID, confirmed_at: '2026-10-03T00:00:00Z' }])
    if (t === 'source_files') return reply([{ id: 'f1', name: 'labs.pdf', mime: 'application/pdf', drive_file_id: 'abc123', storage_path: null, side: null, document_id: 'd1' }])
    return reply([])
  })
}

/** Writes rows into a store the app has already created (never creates a database itself) and waits until the app has made it. */
async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await expect.poll(() => page.evaluate(async ([name, st, list]) => new Promise<boolean>((res) => {
    const open = indexedDB.open(name as string)
    open.onupgradeneeded = () => open.transaction!.abort()
    open.onerror = (e) => { e.preventDefault(); res(false) }
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(st as string)) { db.close(); return res(false) }
      const tx = db.transaction(st as string, 'readwrite')
      for (const r of list as Row[]) tx.objectStore(st as string).put(r)
      tx.oncomplete = () => { db.close(); res(true) }
      tx.onerror = () => { db.close(); res(false) }
    }
  }), [dbName, store, rows] as const), { timeout: 15_000 }).toBe(true)
}

const day = (m: number, d: number) => new Date(2026, m, d, 12).toISOString()
const rd = (test: string, value: number, unit: string, takenAt: string, extra: Row = {}): Row => ({ personId: 'me', test, value, unit, takenAt, ...extra })
const READINGS: Row[] = [
  rd('hba1c', 6.8, '%', day(9, 2), { labLow: 4, labHigh: 5.6, sourceFileId: 'f1' }), rd('hba1c', 7.1, '%', day(6, 3), { labLow: 4, labHigh: 5.6 }), rd('hba1c', 7.4, '%', day(3, 4), { labLow: 4, labHigh: 5.6 }),
  rd('ldl', 162, 'mg/dL', day(9, 2), { sourceFileId: 'f1' }),
  rd('creatinine', 0.9, 'mg/dL', day(9, 2), { labLow: 0.6, labHigh: 1.1, sourceFileId: 'f1' }),
  rd('hemoglobin', 13.1, 'g/dL', day(9, 2), { labLow: 12, labHigh: 15.5, sourceFileId: 'f1' }),
  rd('mystery_test', 5, 'u', day(9, 2), { sourceFileId: 'f1' })
]

async function open(page: Page, hash: string, scheme: 'light' | 'dark', readings: Row[] = READINGS) {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await mock(page)
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.clock.setFixedTime(NOW)
  await page.goto('/#health')
  await expect(page.getByRole('heading', { name: 'Health', exact: true }).or(page.getByTestId('browse'))).toBeVisible()
  await seed(page, 'bantay-health', 'people', [{ id: 'me', name: 'Mama' }])
  if (readings.length) await seed(page, 'bantay-health', 'readings', readings)
  await page.goto(`/${hash}`)
  await page.reload() // raw IndexedDB writes do not notify live queries
}
const shot = async (page: Page, name: string, scheme: string) => { if (SHOTS) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, fullPage: true }) } }
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && Array.from(document.querySelectorAll('main, main *')).every((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1))

for (const scheme of ['light', 'dark'] as const) {
  test(`list: source card, a date and whose range on every result, previous switch (${scheme})`, async ({ page }) => {
    await open(page, '#health/labs', scheme)
    const list = page.getByTestId('labs-list')
    await expect(list.locator('a.lr-card')).toHaveCount(5)
    const src = page.getByTestId('lab-source')
    await expect(src).toContainText('Source: GenSan Medical Lab, 2 Oct 2026')
    await expect(src.getByRole('link', { name: /Open original \(labs\.pdf\)/ })).toHaveAttribute('href', 'https://drive.google.com/file/d/abc123/view')
    await expect(list.locator('[data-testid="lab-date"]')).toHaveText(['2 Oct', '2 Oct', '2 Oct', '2 Oct', '2 Oct'])
    const hba = list.locator('[data-test="hba1c"]')
    await expect(hba).toContainText('High')
    await expect(hba.getByTestId('lab-range')).toHaveText('Lab range 4 to 5.6')
    await expect(list.locator('[data-test="ldl"]').getByTestId('lab-range')).toContainText('General guide (')
    await expect(list.locator('[data-test="mystery_test"]')).toContainText('No range on the paper')
    // D-38: Show previous result is on, with a hollow mark and the Before line; off hides both
    const sw = page.getByRole('switch', { name: 'Show previous result' })
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect(hba.getByTestId('lab-before')).toHaveText('Before: 7.1 % on 3 Jul · down 0.3 · closer to the range')
    await expect(hba.getByTestId('lr-prev')).toHaveCount(1)
    await shot(page, 'health-labs', scheme)
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('lab-before')).toHaveCount(0)
    await expect(page.getByTestId('lr-prev')).toHaveCount(0)
    // filter chips
    await page.getByRole('button', { name: /^To ask about/ }).click()
    await expect(list.locator('a.lr-card')).toHaveCount(2)
    expect(await noSideways(page)).toBe(true)
  })

  test(`detail: top card with value, bar, range and date; last 3 with trend; one Add per question; no readings, source or tips blocks (${scheme})`, async ({ page }) => {
    await open(page, '#health/labs', scheme)
    await page.locator('[data-test="hba1c"]').click()
    const top = page.getByTestId('lab-top')
    await expect(top).toContainText('6.8')
    await expect(top).toContainText('Lab range 4 to 5.6')
    await expect(top).toContainText('2 Oct 2026')
    await expect(top.locator('.lr-track')).toBeVisible()
    await expect(top.getByRole('link', { name: /Open original/ })).toBeVisible()
    await expect(page.getByTestId('lab-last3')).toContainText('going down')
    await expect(page.getByTestId('lab-last3').locator('.row')).toHaveCount(3)
    for (const h of ['Readings', 'Where the range comes from', 'General tips']) await expect(page.getByText(h, { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('lab-visit')).toHaveText('No visit booked yet')
    const adds = page.getByRole('button', { name: /^Add to visit list:/ })
    await expect(adds).toHaveCount(2)
    await adds.first().click()
    await expect(page.getByTestId('lab-questions').getByRole('status')).toContainText('Added')
    await expect(adds).toHaveCount(1)
    await page.getByRole('link', { name: 'Open your visit list' }).click()
    await expect(page.getByText('What HbA1c should I aim for?').first()).toBeVisible()
    await page.goBack()
    await shot(page, 'health-labdetail', scheme)
  })

  test(`empty: one sentence and one button (${scheme})`, async ({ page }) => {
    await open(page, '#health/labs', scheme, [])
    await expect(page.getByRole('heading', { name: 'No lab papers yet' })).toBeVisible()
    await expect(page.getByText("Snap a lab paper. A person checks it first.")).toBeVisible()
    await shot(page, 'health-labs-empty', scheme)
    await page.getByRole('button', { name: 'Scan a paper' }).click()
    await expect(page).toHaveURL(/#health\/papers$/)
  })
}

test('Overview shows one Lab results row that opens the screen; the Labs tile does too', async ({ page }) => {
  await open(page, '#health', 'light')
  const row = page.getByTestId('labs-row')
  await expect(row).toHaveText('Lab resultsLast paper 2 Oct 2026')
  await expect(page.getByTestId('labs-list')).toHaveCount(0)
  await row.scrollIntoViewIfNeeded()
  await shot(page, 'health-overview-labsrow', 'light')
  await row.click()
  await expect(page).toHaveURL(/#health\/labs$/)
  await page.goBack()
  await page.locator('[data-browse="labs"]').click()
  await expect(page).toHaveURL(/#health\/labs$/)
})

test('list and detail do not scroll sideways at 200% text zoom (195px wide)', async ({ page }) => {
  await open(page, '#health/labs', 'light')
  await expect(page.getByTestId('labs-list')).toBeVisible()
  await page.setViewportSize({ width: 195, height: 844 })
  expect(await noSideways(page)).toBe(true)
  await shot(page, 'health-labs-zoom200', 'light')
  await page.locator('[data-test="hba1c"]').click()
  await expect(page.getByTestId('lab-top')).toBeVisible()
  expect(await noSideways(page)).toBe(true)
  await shot(page, 'health-labdetail-zoom200', 'light')
})
