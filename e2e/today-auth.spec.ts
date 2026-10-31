import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { FIXED_CLOCKS } from './s16'

declare const process: { env: Record<string, string | undefined> }

// Runs in the "auth" project (build WITH test Supabase env). Signed in as a made-up member; PostgREST is mocked; all data is invented.
// Set M3_SHOTS=<dir> to also write 390x844 light/dark screenshots of Today and Simple mode.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Lloyd' }, { id: 'ma', display_name: 'Ma' }, { id: 'pa', display_name: 'Pa' }]

type Row = Record<string, unknown>
async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: u }))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-20T10:00', temperature_2m: 34.2, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE) // maybeSingle() asks for a list and takes the first row
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }])
    return reply([])
  })
}

async function seed(page: Page, dbName: string, store: string, rows: Row[], mode: 'put' | 'add' = 'put') {
  await page.evaluate(async ([name, st, list, m]) => {
    for (let i = 0; i < 100; i++) { // wait until the app's own Dexie has made the store; opening early would create an empty database and hang (ML-25)
      const ok = await new Promise<boolean>((res, rej) => {
        const open = indexedDB.open(name as string)
        open.onupgradeneeded = () => { open.transaction?.abort() }
        open.onerror = () => res(false)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(st as string)) { db.close(); res(false); return }
          const tx = db.transaction(st as string, 'readwrite')
          for (const r of list as Row[]) tx.objectStore(st as string)[m as 'put' | 'add'](r)
          tx.oncomplete = () => { db.close(); res(true) }
          tx.onerror = () => { db.close(); rej(tx.error) }
        }
      })
      if (ok) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`store ${st as string} never appeared in ${name as string}`)
  }, [dbName, store, rows, mode] as const)
}

// ML-38: nothing here reads the runner's clock. The page clock is frozen (beforeEach) and every date is worked out in Manila time from that instant (it was red on a runner clock past the Aspirin review window).
test.use({ timezoneId: 'Asia/Manila' })
let NOW = new Date(FIXED_CLOCKS[0])
const MNL = 8 * 3_600_000
const mnl = (d: Date) => new Date(d.getTime() + MNL) // read its UTC fields = Manila fields
const at = (back: number, h: number, m = 0) => { const t = mnl(NOW); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back, h - 8, m)).toISOString() }
const hhmm = (d: Date) => `${String(mnl(d).getUTCHours()).padStart(2, '0')}:${String(mnl(d).getUTCMinutes()).padStart(2, '0')}`

async function seedWeek(page: Page) {
  const soon = new Date(NOW.getTime() + 30 * 60_000)
  const slot = mnl(soon).getUTCDate() === mnl(NOW).getUTCDate() ? hhmm(soon) : hhmm(new Date(NOW.getTime() - 30 * 60_000)) // across midnight the slot is 30 min ago (still in the missed window)
  const meds: Row[] = [
    { clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', dose: '50 mg', schedule: { v: 1, times: [slot] }, medStatus: 'active' },
    { clientId: 'c2', serverId: 's2', personId: 'ma', name: 'Metformin', dose: '500 mg', schedule: { v: 1, times: [slot] }, medStatus: 'active' },
    { clientId: 'c3', serverId: 's3', personId: 'me', name: 'Aspirin', schedule: { v: 1, times: ['06:00'], review: true, review_since: new Date(mnl(NOW)).toISOString().slice(0, 10) }, medStatus: 'active' }
  ]
  await seed(page, 'bantay-log', 'medications', meds, 'add')
  await seed(page, 'bantay-log', 'meds', [1, 3, 4, 5, 6].map((d) => ({ personId: 'me', name: 'Losartan', takenAt: at(d, 9), medicationId: 's1', slot })), 'add')
  const acts: Row[] = [1, 2, 3, 4, 5].map((d, i) => ({ personId: 'me', kind: 'steps', minutes: null, steps: 4200 + i * 900, startedAt: at(d, 18), source: 'manual' }))
  acts.push({ personId: 'ma', kind: 'check-in', minutes: null, steps: null, startedAt: at(0, 0, 5), source: 'manual' })
  await seed(page, 'bantay-log', 'activity', acts, 'add')
  const rows: Row[] = []
  ;[[1, 128, 82], [2, 134, 86], [4, 141, 90], [5, 126, 80]].forEach(([d, s, di]) => { rows.push({ personId: 'me', test: 'bp_systolic', value: s, unit: 'mmHg', takenAt: at(d!, 7) }, { personId: 'me', test: 'bp_diastolic', value: di, unit: 'mmHg', takenAt: at(d!, 7) }) })
  ;[[1, 96], [3, 104], [5, 99]].forEach(([d, v]) => rows.push({ personId: 'me', test: 'fasting_glucose', value: v, unit: 'mg/dL', takenAt: at(d!, 6) }))
  ;[[5, 64.2], [0, 63.7]].forEach(([d, v]) => rows.push({ personId: 'me', test: 'weight', value: v, unit: 'kg', takenAt: at(d!, 6) }))
  ;[[1, 68], [2, 72], [3, 66]].forEach(([d, v]) => rows.push({ personId: 'me', test: 'heart_rate', value: v, unit: 'bpm', takenAt: at(d!, 6) }))
  await seed(page, 'bantay-health', 'readings', rows, 'add')
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Lloyd' }, { personId: 'ma', displayName: 'Ma' }, { personId: 'pa', displayName: 'Pa' }])))
  await mock(page)
})

for (const clock of FIXED_CLOCKS) test(`signed in at ${clock}: Next up for me and Ma, weather action, My week tiles, self-care card, and Taken logs the dose`, async ({ page }) => {
  NOW = new Date(clock)
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Quick log' }).or(page.getByRole('group', { name: 'Quick log' }))).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Next up' })).toHaveCount(0) // nothing next: no empty card
  await seedWeek(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Losartan/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /1 medicine to check/ })).toHaveAttribute('href', '#health/meds')
  await expect(page.getByText(/^Stay indoors 11 AM-3 PM/)).toBeVisible()
  await page.getByRole('button', { name: 'See the week' }).click() // S14: My week sits behind the See the week link
  const week = page.getByRole('region', { name: 'My week' }).or(page.locator('section[aria-labelledby="t-myweek"]'))
  await expect(week.getByRole('link', { name: /Blood pressure/ })).toHaveAttribute('href', '#health/metric/bp_systolic')
  await expect(week.getByRole('link', { name: /Steps a day/ })).toContainText('goal 6,000')
  await expect(week.getByRole('link', { name: /Doses on time/ })).toHaveAttribute('href', '#health')
  await expect(page.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
  await page.getByRole('button', { name: 'Taken' }).click()
  await expect(page.getByRole('status').filter({ hasText: /taken/ })).toBeVisible()
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
})

const SHOTS = process.env.M3_SHOTS
for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots ${scheme}`, async ({ page }) => {
    test.skip(!SHOTS, 'set M3_SHOTS to write screenshots')
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
    await seedWeek(page)
    await page.reload()
    await expect(page.getByText(/^Stay indoors 11 AM-3 PM/)).toBeVisible()
    await page.waitForTimeout(800)
    const scroller = () => page.evaluate(() => { const el = document.querySelector('.td-root')!; let p: Element | null = el; while (p && !(p.scrollHeight > p.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement; return !!p })
    await scroller()
    const scrollTo = (sel: string | null) => page.evaluate((s) => {
      const el = document.querySelector('.td-root')!
      let p: Element | null = el
      while (p && !(p.scrollHeight > p.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement
      const sc = (p ?? document.scrollingElement) as Element
      if (s === null) sc.scrollTop = sc.scrollHeight
      else if (s === '') sc.scrollTop = 0
      else document.querySelector(s)?.scrollIntoView({ block: 'start' })
    }, sel)
    await scrollTo('')
    await page.screenshot({ path: `${SHOTS}/today-${scheme}-1-top.png` })
    await scrollTo('#t-myweek')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/today-${scheme}-2-myweek.png` })
    await scrollTo(null)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/today-${scheme}-3-end.png` })
    await seed(page, 'bantay', 'kv', [{ key: 'mode.simple', value: true }])
    await page.reload()
    await expect(page.getByRole('button', { name: 'I took it' })).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/simple-${scheme}.png`, fullPage: false })
  })
}

// F2: Simple mode keeps Hold for help above the fold with a dose card showing, on a normal and a small phone.
for (const [w, h] of [[390, 844], [360, 640]] as const) {
  test(`simple mode: SOS button inside the viewport before scroll at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Quick log' }).or(page.getByRole('group', { name: 'Quick log' }))).toBeVisible() // the app has created its database
    await seedWeek(page)
    await seed(page, 'bantay', 'kv', [{ key: 'mode.simple', value: true }])
    await page.reload()
    await expect(page.getByRole('button', { name: 'I took it' })).toBeVisible()
    const box = await page.getByRole('button', { name: 'Hold to call and text your family' }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(h)
    await expect(page.locator('.bt[data-simple]')).toBeAttached()
    await expect(page.locator('.bt[data-simple] .tabbar')).toBeAttached()
    await expect(page.locator('.bt[data-simple] .tabbar')).toBeHidden()
    for (const el of [...(h >= 844 ? [page.getByRole('button', { name: /^Call 911/ })] : []), page.getByRole('button', { name: 'I took it' })]) {
      const b = await el.boundingBox()
      expect(b).not.toBeNull()
      expect(b!.y + b!.height).toBeLessThanOrEqual(h)
    }
  })
}
