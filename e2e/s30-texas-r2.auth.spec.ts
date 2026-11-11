import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S30 L8 round 2 (auth build, PostgREST mocked, invented people): a carer on a Texas phone (America/Chicago) looking at a relative who lives in the Philippines.
// 02:00Z on 11 Nov is 20:00 Tuesday in Texas and 10:00 Wednesday in Manila. Her 09:00 dose is judged and labelled on HER clock: "(their time)".
// Also Settings > Display: the "Weather units" row and its sheet. Shots only when S30_SHOTS=<dir> (390x844 and 360x740, light and dark).
// Carer cards (family/CarerCards.tsx) are not mounted by any screen in this build, so they have no page to shoot; their "(their time)" text is covered by texasDoseDay.test.ts and carer-cards.test.tsx.
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S30_SHOTS
test.use({ serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/Chicago' })

const API = 'https://bantay-test.supabase.test'
const UID = '77777777-7777-4777-8777-777777777777'
const CLOCK = '2026-11-11T02:00:00Z'
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }]
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [
  { id: 'me', display_name: 'Rey', auth_user_id: UID, tz: 'America/Chicago' },
  { id: 'ma', display_name: 'Mama Rosa', auth_user_id: 'u-ma', tz: 'Asia/Manila' }
]
const FAMILY = [{ personId: 'me', displayName: 'Rey' }, { personId: 'ma', displayName: 'Mama Rosa' }]
type Row = Record<string, unknown>

async function mock(page: Page) {
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    localStorage.setItem('bantay.lastPerson', 'me')
  }, [jwt(), user, FAMILY] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-11-10T20:00', temperature_2m: 30, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [10] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET') return route.fulfill({ status: t.startsWith('rpc/') ? 200 : 201, headers: { ...cors, 'content-type': 'application/json' }, body: t.startsWith('rpc/') ? 'null' : '' })
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }])
    return reply([])
  })
}

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await page.evaluate(async ([name, st, list]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string).add(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}

async function open(page: Page, hash: string, size: { width: number; height: number }, scheme: 'light' | 'dark') {
  await skipOnboarding(page)
  await page.setViewportSize(size)
  await page.emulateMedia({ colorScheme: scheme })
  await mock(page)
  await page.goto('/#family')
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible()
  await seed(page, 'bantay-log', 'medications', [{ clientId: 'c-los', serverId: 's-los', personId: 'ma', name: 'Losartan', strength: '50 mg', dose: '1 tablet', schedule: { v: 1, times: ['09:00'] }, medStatus: 'active' }])
  await page.clock.setFixedTime(CLOCK)
  await page.goto(hash)
  await page.reload() // raw IndexedDB writes do not notify live queries
}
const shot = async (page: Page, name: string, size: { width: number; height: number }, scheme: string) => {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.screenshot({ path: `${SHOTS}/${name}-${size.width}x${size.height}-${scheme}.png`, animations: 'disabled' })
}

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${size.width}x${size.height} ${scheme}`, () => {
      test("Member page of a Philippine relative: her 09:00 dose reads '(their time)' and is judged on Manila's 10:00", async ({ page }) => {
        await open(page, '/#family/people/ma', size, scheme)
        const card = page.getByTestId('member-today')
        await expect(card).toBeVisible()
        await expect(card).toContainText('Losartan')
        await expect(card).toContainText('9:00 AM (their time)') // her zone differs from this Chicago phone's
        await expect(card).toContainText('Due now') // 10:00 Manila is 60 min after 09:00; on a Chicago clock (20:00 Tuesday) it would read Later or Missed
        await shot(page, 'member-their-time', size, scheme)
      })

      test('Settings > Display shows the Weather units row, and its sheet offers Celsius and Fahrenheit', async ({ page }) => {
        await open(page, '/#me/display', size, scheme)
        const row = page.getByRole('button', { name: /Weather units/ })
        await expect(row).toBeVisible()
        await expect(row).toContainText('Fahrenheit and mph') // a US phone's default
        await shot(page, 'settings-display', size, scheme)
        await row.click()
        const group = page.getByRole('radiogroup', { name: 'Weather units' })
        await expect(group.getByRole('radio')).toHaveCount(2)
        await expect(group.getByRole('radio', { name: 'Fahrenheit and mph' })).toHaveAttribute('aria-checked', 'true')
        await expect(page.getByRole('dialog', { name: 'Weather units' }).getByRole('button', { name: 'Cancel' })).toBeInViewport()
        await shot(page, 'settings-weather-units-sheet', size, scheme)
      })
    })
  }
}
