import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S12 lane I storm roll call shots (390x844, light and dark): safety-storm, today-storm and family-home (board 7b) with a live PAGASA signal.
// Runs in the "auth" project (build WITH test Supabase env). Signed in as a made-up member; PostgREST is mocked and the clock is frozen, so a rerun writes the same pixels.
// Shots are written only when S12_STORM_SHOTS=<dir> is set.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const SHOTS = process.env.S12_STORM_SHOTS
const NOW = Date.parse('2026-10-26T10:00:00+08:00')
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4_102_444_800 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Mama' }, { id: 'ma', display_name: 'Ate Joy' }, { id: 'pa', display_name: 'Papa Ben' }]
type Row = Record<string, unknown>
const SIGNAL = {
  id: 'pagasa-tcws-rosal-champi-dampas', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)',
  what: 'Winds of 62-88 kph may be expected within 24 hours.', where: 'Bohol (near Dampas, Tagbilaran City)', when: '2026-10-26 10:00 PH time',
  doNow: 'Follow your local DRRMO.', source: 'PAGASA', sourceUrl: 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin', issuedAt: new Date(NOW - 2 * 3_600_000).toISOString(), lat: 9.645705, lon: 123.877951,
  bulletin: 'Source: PAGASA, CC BY 4.0.', checkedAt: new Date(NOW - 360_000).toISOString()
}
// People shows the roll call only while a GDACS cyclone is near (useStorm, lane J), so the shots carry one beside the PAGASA signal
const CYCLONE = { id: 'gdacs-TC-1001', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone ROSAL', what: 'Tropical cyclone', where: 'Philippines', when: 'Now', doNow: 'Prepare', source: 'GDACS', sourceUrl: null, issuedAt: SIGNAL.issuedAt, lat: 10.1, lon: 124.5, bulletin: 'b', checkedAt: SIGNAL.checkedAt }
const ROLLS = [{ person_id: 'me', status: 'ok', at: '2026-10-26T01:40:00Z' }, { person_id: 'pa', status: 'need_help', at: '2026-10-26T01:45:00Z' }]
const TASKS = ['Charge phones and power banks', 'Pack 7 days of medicines in the go-bag', 'Fill water containers', 'Check on a neighbour']

async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, user: u }))
  }, [jwt(), user] as const)
  await page.route(/open-meteo\.com/, (r) => r.abort())
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
    if (t === 'rollcall') return reply(ROLLS)
    if (t === 'safety_alerts') return reply([SIGNAL, CYCLONE].map((a) => ({ id: a.id, kind: a.kind, level: a.level, title: a.title, what: a.what, where_text: a.where, when_text: a.when, do_now: a.doNow, source: a.source, source_url: a.sourceUrl, issued_at: a.issuedAt, lat: a.lat, lon: a.lon, bulletin: a.bulletin, fetched_at: a.checkedAt }))) // the pull keeps the seeded signal
    if (t === 'family_tasks') return reply(TASKS.map((title, i) => ({ id: `t${i}`, client_id: `storm:${SIGNAL.id}:${i + 1}`, title, due: '2026-10-26', assignee_person_id: null, done: i === 0, deleted_at: null, updated_at: '2026-10-26T01:00:00Z' })))
    if (t.startsWith('rpc/')) return reply(null)
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
        for (const r of list as Row[]) tx.objectStore(st as string).put(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}

async function open(page: Page, hash: string, scheme: 'light' | 'dark') {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Mama' }, { personId: 'ma', displayName: 'Ate Joy' }, { personId: 'pa', displayName: 'Papa Ben' }])))
  await mock(page)
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' }) // no pulse or entrance animation in the shot (ML-32)
  await page.clock.setFixedTime(NOW)
  await page.goto('/#today')
  await expect(page.locator('h1').first()).toBeVisible()
  await seed(page, 'bantay', 'kv', [{ key: 'safety.alerts', value: [SIGNAL, CYCLONE] }, { key: 'storm.tasks', value: [SIGNAL.id] }])
  await page.goto('/' + hash)
  await page.reload() // raw IndexedDB writes do not notify live queries
}

/** Put a heading just under the top bar so the shot shows the new card, not the storm banner above it. */
const toTop = (page: Page, h: ReturnType<Page['locator']>) => h.evaluate((e) => { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -130) }).then(() => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
const shot = async (page: Page, name: string, scheme: string) => { await page.addStyleTag({ content: '.sh-hint { display: none !important }' }); return SHOTS ? page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) : undefined } // the Ask me anything hint shows at a random time

for (const scheme of ['light', 'dark'] as const) {
  test(`safety-storm with the roll call ${scheme}`, async ({ page }) => {
    await open(page, '#safety', scheme)
    const card = page.getByRole('region', { name: 'Storm mode' })
    await expect(card.getByRole('heading', { name: 'Is everyone safe?' })).toBeVisible()
    await toTop(page, card.getByRole('heading', { name: 'Is everyone safe?' }))
    await shot(page, 'safety-storm-rollcall', scheme)
    await card.getByRole('button', { name: "I'm safe" }).click()
    await expect(card.getByText('Saved. Your family can see you are safe.')).toBeVisible()
  })

  test(`today-storm ${scheme}`, async ({ page }) => {
    await open(page, '#today', scheme)
    const card = page.getByRole('region', { name: 'Storm mode' })
    await expect(card.getByRole('heading', { name: 'Is everyone safe?' })).toBeVisible()
    await toTop(page, card.getByRole('heading', { name: 'Is everyone safe?' }))
    await shot(page, 'today-storm', scheme)
  })

  test(`family-home storm roll call ${scheme}`, async ({ page }) => {
    await open(page, '#family', scheme)
    const list = page.getByRole('list', { name: 'Storm check-ins' })
    await expect(list.getByText('Needs help')).toBeVisible()
    await expect(page.getByText('1 of 3 safe')).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(4)
    await toTop(page, page.getByRole('region', { name: 'Storm roll call' }))
    await shot(page, 'family-home-storm', scheme)
  })
}
