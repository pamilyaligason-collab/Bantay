import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S4 REVIEW + FAMILY-CARER (runs in the "auth" project: build WITH test Supabase env). Signed in as Lloyd, a writer carer of Papa and Mama.
// PostgREST is mocked; every name and value is invented. Shots (390x844, light and dark): family-home, family-answer, family-phones, health-meds,
// health-med-stop, lock-sos (the red banner on Family; the Today hook is S7's). Written to docs/session-10/shots/s4.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const SHOTS = process.env.S4_SHOTS // shots are written only when S4_SHOTS=docs/session-10/shots/s4 is set, so a gate rerun leaves the tree clean (ML-32)
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Lloyd', auth_user_id: UID }, { id: 'pa', display_name: 'Papa', auth_user_id: 'u-pa' }, { id: 'ma', display_name: 'Mama', auth_user_id: 'u-ma' }]
const FAMILY = [{ personId: 'me', displayName: 'Lloyd' }, { personId: 'pa', displayName: 'Papa' }, { personId: 'ma', displayName: 'Mama' }]

type Row = Record<string, unknown>
type Post = { path: string; body: Row }
const day = (back = 0) => { const d = new Date(); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const later = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const alert = (id: string, person: string, kind: string, template: string, ref: string, min: number): Row => ({ id, person_id: person, kind, template, ref, created_at: ago(min), pushed_at: null, seen_at: null, expires_at: later(7) })

async function mock(page: Page, opts: { sos: boolean }, posts: Post[]) {
  const alerts: Row[] = [
    alert('a-dose', 'ma', 'dose_missed', 'dose_missed', `ma:${day()}:09:00`, 70),
    alert('a-phone', 'pa', 'phone_health', 'phone_health', `u-pa:${day()}`, 120),
    ...(opts.sos ? [alert('a-sos', 'ma', 'sos', 'family_sos', 'e1', 5)] : [])
  ]
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
  }, [jwt(), user, FAMILY] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-20T10:00', temperature_2m: 34.2, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (req.method() === 'POST') { posts.push({ path: t, body: req.postDataJSON() as Row }); return route.fulfill({ status: 201, headers: cors }) }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, headers: cors })
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE) // maybeSingle() asks for a list and takes the first row
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'pa' }, { person_id: 'ma' }])
    if (t === 'carer_alerts') return reply(alerts)
    if (t === 'sos_events') return reply([{ id: 'e1', person_id: 'ma', at: ago(5), lat: 6.1164, lon: 125.1716, gps: true, cancelled_at: null }])
    if (t === 'phone_health') return reply([
      { user_id: 'u-pa', platform: 'android', alarms_ok: false, notif_ok: true, exact_ok: true, battery_ok: false, call_ok: true, last_open_at: ago(60), alarms_checked_at: ago(60) },
      { user_id: 'u-ma', platform: 'android', alarms_ok: true, notif_ok: true, exact_ok: true, battery_ok: true, call_ok: true, last_open_at: ago(30), alarms_checked_at: ago(30) }
    ])
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

const med = (id: string, person: string, name: string, strength: string, times: string[], extra: Row = {}): Row => ({ clientId: `c-${id}`, serverId: `s-${id}`, personId: person, name, strength, dose: '1 tablet', schedule: { v: 1, times }, medStatus: 'active', ...extra })
const MEDS: Row[] = [
  med('met', 'pa', 'Metformin', '500 mg', ['13:00'], { schedule: { v: 1, times: ['13:00'], review: true, review_since: day(2) } }),
  med('los', 'ma', 'Losartan', '50 mg', ['09:00']),
  med('aml', 'me', 'Amlodipine', '5 mg', ['08:00'], { schedule: { v: 1, times: ['08:00'], review: true, review_since: day(1) } })
]

async function open(page: Page, scheme: 'light' | 'dark', sos: boolean, posts: Post[] = []) {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: scheme })
  await mock(page, { sos }, posts)
  await page.goto('/#family')
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible()
  await seed(page, 'bantay-log', 'medications', MEDS)
  await page.reload() // raw IndexedDB writes do not notify live queries
}

for (const scheme of ['light', 'dark'] as const) {
  test(`family home, answer for Papa, phones ${scheme}`, async ({ page }) => {
    const posts: Post[] = []
    await open(page, scheme, false, posts)
    await expect(page.getByText('Needs you now')).toBeVisible()
    await expect(page.getByText('Mama missed a medicine')).toBeVisible()
    await expect(page.getByText(/Losartan 50 mg was due 9:00 AM|Losartan was due 9:00 AM/)).toBeVisible()
    await expect(page.getByText('Papa has not answered')).toBeVisible()
    await expect(page.getByText("Papa's phone may miss alarms")).toBeVisible()
    await expect(page.getByRole('alert', { name: /needs help/ })).toHaveCount(0) // no SOS in this scenario
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/family-home-${scheme}.png` })

    await page.getByRole('button', { name: 'Answer for Papa' }).click()
    const sheet = page.getByRole('dialog', { name: 'Answer for Papa' })
    await expect(sheet.getByText('Still taking Metformin 500 mg?')).toBeVisible()
    await page.waitForTimeout(300) // the sheet slide-in
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/family-answer-${scheme}.png` })
    await sheet.getByRole('button', { name: 'Send answer' }).click()
    await expect(page.getByText('Papa has not answered')).toHaveCount(0)
    await expect.poll(() => posts.some((p) => p.path === 'medications' && p.body.name === 'Metformin' && JSON.stringify(p.body.schedule).includes('"answered_by":"Lloyd"'))).toBe(true)

    await page.getByRole('button', { name: "Fix Papa's phone" }).click()
    await expect(page.getByRole('heading', { name: 'Phones' })).toBeVisible()
    await expect(page.getByText('Battery saver is stopping alarms')).toBeVisible()
    await page.getByRole('button', { name: 'Needs fixing' }).click()
    await expect(page.getByLabel("Fix Papa's phone")).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/family-phones-${scheme}.png` })
  })

  test(`SOS banner on Family ${scheme}`, async ({ page }) => {
    const posts: Post[] = []
    await open(page, scheme, true, posts)
    const banner = page.getByRole('alert', { name: 'Mama needs help' })
    await expect(banner).toBeVisible()
    await expect(banner.getByRole('link', { name: 'Open map' })).toHaveAttribute('href', 'https://maps.google.com/?q=6.1164,125.1716')
    await expect(banner.getByRole('button', { name: 'Call 911' })).toBeVisible()
    await expect(banner.getByRole('button', { name: /on my way/i })).toHaveCount(0)
    await expect.poll(() => posts.some((p) => p.path === 'sos_acks' && p.body.event_id === 'e1')).toBe(true) // opening it tells the server this carer saw it
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/lock-sos-${scheme}.png` })
  })

  test(`medicines: still taking it, I stopped it asks first ${scheme}`, async ({ page }) => {
    const posts: Post[] = []
    await open(page, scheme, false, posts)
    await page.goto('/#health/meds')
    await expect(page.getByText('Still taking it?').first()).toBeVisible()
    await expect(page.getByText(/The reminders keep going until someone answers/)).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/health-meds-${scheme}.png` })
    await page.getByRole('button', { name: 'I stopped Amlodipine' }).click()
    const sheet = page.getByRole('dialog', { name: 'Stop reminders for Amlodipine?' })
    await expect(sheet.getByText('Alarms stop on every phone.')).toBeVisible()
    expect(posts.filter((p) => p.path === 'medications' && p.body.med_status === 'stopped')).toHaveLength(0) // nothing is silenced by the first tap
    await page.waitForTimeout(300)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/health-med-stop-${scheme}.png` })
    await sheet.getByRole('button', { name: 'Stop reminders' }).click()
    await expect.poll(() => posts.some((p) => p.path === 'medications' && p.body.name === 'Amlodipine' && p.body.med_status === 'stopped')).toBe(true)
  })
}
