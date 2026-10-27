import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S12 lane K (core loop): unwell offline is replayed once, a per-medicine Taken checklist, SOS hold on Today, the member page, Simple mode BP tile and Medicines entry.
// Runs in the "auth" project (build WITH test Supabase env). A made-up member; PostgREST is mocked; all data is invented. The clock is frozen (Tue 27 Oct 2026 9:12 AM local) so a rerun rewrites no shot.
// Shots (390x844, light and dark) are written only when S12_SHOTS=<dir> is set.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const SHOTS = process.env.S12_SHOTS
const NOW = new Date(2026, 9, 27, 9, 12)
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Mama' }, { id: 'ma', display_name: 'Ate Joy' }]
type Row = Record<string, unknown>

async function mock(page: Page, rpc: string[]) {
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
    if (t.startsWith('rpc/')) { rpc.push(t.slice(4)); return reply(null) }
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }])
    return reply([])
  })
}

/** Writes rows into a store the app has already created. Never creates a database itself (an empty one would block the app's own upgrade), and waits until the app has made it. */
async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await expect.poll(() => page.evaluate(async ([name, st, list]) => new Promise<boolean>((res) => {
    const open = indexedDB.open(name as string)
    open.onupgradeneeded = () => open.transaction!.abort() // not there yet: leave nothing behind
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
const count = (page: Page, dbName: string, store: string) => page.evaluate(([name, st]) => new Promise<number>((res, rej) => {
  const open = indexedDB.open(name as string)
  open.onerror = () => rej(open.error)
  open.onsuccess = () => { const r = open.result.transaction(st as string).objectStore(st as string).count(); r.onsuccess = () => { open.result.close(); res(r.result) } }
}), [dbName, store] as const)

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m).toISOString()
const shot = (page: Page, name: string, scheme: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) : Promise.resolve(undefined))
// Settled UI before a shot: fonts loaded and every finite reveal animation finished (the sky loops forever) (the weather card fades in).
const settle = (page: Page) => expect.poll(() => page.evaluate(() => document.fonts.status === 'loaded' && document.getAnimations().every((x) => x.effect?.getComputedTiming().iterations === Infinity || x.playState !== 'running'))).toBe(true)
const SLOT = hhmm(new Date(NOW.getTime() - 12 * 60_000)) // 9:00, twelve minutes ago

type Meds = 'two' | 'one' | 'none'
async function open(page: Page, scheme: 'light' | 'dark', meds: Meds, rpc: string[] = [], extra: (p: Page) => Promise<void> = async () => undefined, simple = false) {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Mama' }, { personId: 'ma', displayName: 'Ate Joy' }])))
  await mock(page, rpc)
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' }) // the sky and reveals loop or fade, so a shot would differ per run
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'Quick log' }).or(page.getByRole('button', { name: 'Exit simple mode' }))).toBeVisible() // the app has created its databases
  const sched = { v: 1, times: [SLOT] }
  const rows: Row[] = []
  if (meds !== 'none') rows.push({ id: 1, clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', dose: '50 mg', schedule: sched, medStatus: 'active' })
  if (meds === 'two') rows.push({ id: 2, clientId: 'c2', serverId: 's2', personId: 'me', name: 'Metformin (Glucophage)', dose: '500 mg', schedule: sched, medStatus: 'active' })
  rows.push({ id: 3, clientId: 'c3', serverId: 's3', personId: 'ma', name: 'Aspirin', dose: '81 mg', schedule: { v: 1, times: ['06:00'] }, medStatus: 'active' }, { id: 4, clientId: 'c4', serverId: 's4', personId: 'ma', name: 'Amlodipine', dose: '5 mg', schedule: { v: 1, times: ['20:00'] }, medStatus: 'active' })
  await seed(page, 'bantay-log', 'medications', rows)
  await extra(page)
  await page.reload() // raw IndexedDB writes do not notify live queries
  await expect(simple ? page.getByRole('button', { name: 'Exit simple mode' }) : page.getByRole('group', { name: 'Quick log' })).toBeVisible()
}
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)

test('Unwell offline is told once when the phone is back online (exactly 1 raise_mood_alert)', async ({ page, context }) => {
  const rpc: string[] = []
  await open(page, 'light', 'none', rpc)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Log how you feel' }).click()
  await page.getByRole('button', { name: 'Unwell' }).click()
  await expect(page.getByText('We will tell them when you are online')).toBeVisible()
  expect(rpc.filter((r) => r === 'raise_mood_alert')).toHaveLength(0)
  await context.setOffline(false)
  await expect.poll(() => rpc.filter((r) => r === 'raise_mood_alert').length).toBe(1)
  await expect(page.getByText('Your family has been told you are unwell.')).toBeVisible()
  await page.reload() // Today mount: nothing left to send
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
  await page.waitForLoadState('networkidle') // the Today mount retry has run
  expect(rpc.filter((r) => r === 'raise_mood_alert')).toHaveLength(1)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`today-full: two medicines, per-medicine checklist, SOS hold ${scheme}`, async ({ page }) => {
    await open(page, scheme, 'two')
    await expect(page.getByRole('heading', { name: 'Losartan and Metformin' })).toBeVisible() // short name: the bracket is dropped
    await page.getByRole('button', { name: 'Taken' }).click()
    const boxes = page.getByRole('group', { name: 'Which did you take?' }).getByRole('checkbox')
    await expect(boxes).toHaveCount(2)
    await expect(boxes.first()).toBeChecked()
    await expect(boxes.last()).toBeChecked()
    await settle(page)
    await shot(page, 'today-full', scheme)
    await boxes.first().uncheck()
    await page.getByRole('button', { name: 'Mark these taken' }).click()
    await expect(page.getByText('Marked Metformin taken')).toBeVisible()
    expect(await count(page, 'bantay-log', 'meds')).toBe(1) // one row, not two
    const sos = page.getByRole('button', { name: 'Hold to call and text your family' })
    await sos.scrollIntoViewIfNeeded()
    await expect(sos).toBeVisible()
    await settle(page)
    await shot(page, 'today-sos', scheme)
    await noSideways(page)
  })

  test(`family-member ${scheme}`, async ({ page }) => {
    await open(page, scheme, 'none', [], async (p) => {
      await seed(p, 'bantay-log', 'meds', [{ id: 1, personId: 'ma', name: 'Aspirin', takenAt: at(6, 10), slot: '06:00', medicationId: 's3' }])
      await seed(p, 'bantay-log', 'activity', [{ id: 1, personId: 'ma', kind: 'mood-good', minutes: null, steps: null, startedAt: at(7, 30), source: 'manual' }])
      await seed(p, 'bantay-health', 'readings', [{ id: 1, personId: 'ma', takenAt: at(7, 40), test: 'bp_systolic', value: 150, unit: 'mmHg' }, { id: 2, personId: 'ma', takenAt: at(7, 40), test: 'bp_diastolic', value: 95, unit: 'mmHg' }])
    })
    await page.evaluate(() => { location.hash = 'family/people/ma' })
    const card = page.getByTestId('member-today')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Aspirin')
    await expect(card).toContainText('6:00 AM')
    await expect(card).toContainText('Taken')
    await expect(card).toContainText('Amlodipine')
    await expect(card).toContainText('Later')
    await expect(card).toContainText('Good, 7:30 AM')
    await expect(card).toContainText('150/95, High, 7:40 AM')
    await settle(page)
    await shot(page, 'family-member', scheme)
    await noSideways(page)
    await page.getByRole('button', { name: 'Message Ate' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test(`simple-today with a dose and nothing due ${scheme}`, async ({ page }) => {
    const mode = (p: Page) => seed(p, 'bantay', 'kv', [{ key: 'mode.simple', value: true }, { key: 'sos.contacts', value: [{ name: 'Ate Joy', phone: '+63 917 123 4567' }] }])
    await open(page, scheme, 'one', [], mode, true)
    const bp = page.getByRole('button', { name: 'Check my blood pressure' })
    await bp.scrollIntoViewIfNeeded()
    await expect(bp).toBeVisible()
    await expect(page.getByRole('link', { name: 'Medicines' })).toHaveCount(0) // the dose card is the medicine entry
    await settle(page)
    await shot(page, 'simple-today', scheme)
    await bp.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test(`simple-today nothing due keeps Medicines and the BP tile ${scheme}`, async ({ page }) => {
    const mode = (p: Page) => seed(p, 'bantay', 'kv', [{ key: 'mode.simple', value: true }])
    await open(page, scheme, 'none', [], mode, true)
    const link = page.getByRole('link', { name: 'Medicines' })
    await link.scrollIntoViewIfNeeded()
    await expect(link).toHaveAttribute('href', '#health/meds')
    await expect(page.getByRole('button', { name: 'Check my blood pressure' })).toBeVisible()
    await settle(page)
    await shot(page, 'simple-today-calm', scheme)
  })
}
