import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S7 TODAY shots (390x844, light and dark): today-full (family alert variant), today-log (How are you? sheet; the More sheet beside it), simple-today, simple-mood, simple-taken, today-storm, today-offline.
// Runs in the "auth" project (build WITH test Supabase env). Signed in as a made-up member; PostgREST is mocked; all data is invented. Shots are written only when S7_SHOTS=<dir> is set.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const SHOTS = process.env.S7_SHOTS
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Mama' }, { id: 'ma', display_name: 'Ate Joy' }]
type Row = Record<string, unknown>

async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-20T10:00', temperature_2m: 31, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
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
    if (t === 'carers') return reply([{ person_id: 'ma' }])
    return reply([])
  })
}

async function seed(page: Page, dbName: string, store: string, rows: Row[], mode: 'put' | 'add' = 'put') {
  await page.evaluate(async ([name, st, list, m]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string)[m as 'put' | 'add'](r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows, mode] as const)
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const shot = (page: Page, name: string, scheme: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) : Promise.resolve(undefined))

/** One medicine for me, due 15 minutes ago (the late-dose card). */
async function open(page: Page, scheme: 'light' | 'dark', extra: (p: Page) => Promise<void> = async () => undefined, simple = false) {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Mama' }, { personId: 'ma', displayName: 'Ate Joy' }])))
  await mock(page)
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible() // the app has created its databases
  const slot = hhmm(new Date(Date.now() - 15 * 60_000))
  await seed(page, 'bantay-log', 'medications', [{ clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', dose: '50 mg', schedule: { v: 1, times: [slot] }, medStatus: 'active' }], 'add')
  await extra(page)
  await page.reload() // raw IndexedDB writes do not notify live queries
  await expect(simple ? page.getByRole('button', { name: 'I took it' }) : page.getByRole('group', { name: 'Quick log' })).toBeVisible()
}

for (const scheme of ['light', 'dark'] as const) {
  test(`today-full with a family alert ${scheme}`, async ({ page }) => {
    await open(page, scheme, (p) => seed(p, 'bantay-alerts', 'alerts', [{ id: 'a1', personId: 'ma', kind: 'dose_missed', template: 'dose_missed', ref: 'a1', createdAt: new Date().toISOString(), pushedAt: null, seenAt: null, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }]))
    await expect(page.getByRole('region', { name: 'Family alert' })).toBeVisible()
    await expect(page.getByRole('button', { name: "I'm OK" })).toHaveCount(0) // folded into How are you?
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
    await shot(page, 'today-full', scheme)
  })

  test(`today-log sheets ${scheme}`, async ({ page }) => {
    await open(page, scheme)
    await page.getByRole('button', { name: 'Log how you feel' }).click()
    const faces = page.getByRole('dialog', { name: 'How are you feeling?' })
    await expect(faces.getByRole('button')).toHaveCount(5) // four faces and Close
    await expect(faces.getByText('Your family will see it in Bantay.')).toBeVisible()
    await shot(page, 'today-log', scheme)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'More things to log' }).click()
    await expect(page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Dose taken' })).toBeVisible()
    await shot(page, 'today-log-more', scheme)
  })

  test(`simple-today, simple-mood, simple-taken ${scheme}`, async ({ page }) => {
    await open(page, scheme, (p) => seed(p, 'bantay', 'kv', [{ key: 'mode.simple', value: true }, { key: 'sos.contacts', value: [{ name: 'Ate Joy', phone: '+63 917 123 4567' }] }]), true)
    await expect(page.getByRole('button', { name: 'I took it' })).toBeVisible()
    for (const n of ['Hold to call and text your family', /^Call 911/, 'How are you?', 'I took it']) {
      const b = (await page.getByRole('button', { name: n }).boundingBox())!
      expect(b.y + b.height).toBeLessThanOrEqual(844)
    }
    await expect(page.getByRole('link', { name: 'Call Ate Joy' })).toBeVisible()
    await page.waitForTimeout(400)
    await shot(page, 'simple-today', scheme)
    await page.getByRole('button', { name: 'How are you?' }).click()
    await expect(page.getByRole('heading', { name: /^How are you/ })).toBeVisible()
    await shot(page, 'simple-mood', scheme)
    await page.getByRole('button', { name: 'Not now' }).click()
    await page.getByRole('button', { name: 'I took it' }).click()
    await expect(page.getByRole('heading', { name: /^Well done/ })).toBeVisible()
    await expect(page.getByText('Your family will see it in Bantay.')).toBeVisible()
    await shot(page, 'simple-taken', scheme)
  })

  test(`today-storm ${scheme}`, async ({ page }) => {
    const storm = { id: 'gdacs-TC-1001', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone PEPITO', what: 'Tropical cyclone', where: 'Philippines', when: 'Now', doNow: 'Prepare', source: 'GDACS', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 9.8, lon: 126.5, bulletin: 'b' }
    await open(page, scheme, (p) => seed(p, 'bantay', 'kv', [{ key: 'safety.alerts', value: [storm] }]))
    await expect(page.getByRole('button', { name: 'Log how you feel' })).toContainText('Is everyone safe?')
    await shot(page, 'today-storm', scheme)
  })

  test(`today-offline ${scheme}`, async ({ page, context }) => {
    await open(page, scheme)
    await context.setOffline(true)
    await page.waitForTimeout(800)
    await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
    await shot(page, 'today-offline', scheme)
    await context.setOffline(false)
  })
}
