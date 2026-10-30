import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Session 12 lane F1, signed-in half. Runs in the "auth" project (build WITH test Supabase env); PostgREST is mocked and all data is invented.
//  1. The Taken pill and the Jack button never overlap (360 and 390 px).
//  2. Shots (390x844, light and dark) of today-full, learn-home, start-approve-req and simple-today, written only when S12_SHOTS=<dir> is set.
// The clock is frozen (Tue 27 Oct 2026, 08:47 in Manila) and every row is fixed, so a rerun rewrites no committed PNG (ML-32).
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const SHOTS = process.env.S12_SHOTS
const FIXED = new Date('2026-10-27T08:47:00+08:00')
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(FIXED.getTime() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Mama' }, { id: 'ma', display_name: 'Joy' }]
const WEATHER = { current: { time: '2026-10-27T08:00', temperature_2m: 29, relative_humidity_2m: 72, weather_code: 2 }, daily: { precipitation_probability_max: [40] }, hourly: { time: [], precipitation_probability: [] } }
type Row = Record<string, unknown>

async function mock(page: Page) {
  await page.addInitScript(([token, u, exp]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: u }))
  }, [jwt(), user, Math.floor(FIXED.getTime() / 1000) + 3600] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(WEATHER) }))
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

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  // Wait until the app's own Dexie has created this database and store; a bare indexedDB.open would make an empty v1 database.
  await expect.poll(() => page.evaluate(async ([name, st]) => {
    if (!(await indexedDB.databases()).some((d) => d.name === name)) return false
    return new Promise<boolean>((res) => {
      const o = indexedDB.open(name as string)
      o.onerror = () => res(false)
      o.onsuccess = () => { const ok = o.result.objectStoreNames.contains(st as string); o.result.close(); res(ok) }
    })
  }, [dbName, store] as const)).toBe(true)
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

const shot = (page: Page, name: string, scheme: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) : Promise.resolve(undefined))
const MEDS: Row[] = [
  { clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', dose: '50 mg', schedule: { v: 1, times: ['09:00'] }, medStatus: 'active' },
  { clientId: 'c2', serverId: 's2', personId: 'me', name: 'Metformin', dose: '500 mg', schedule: { v: 1, times: ['09:00'] }, medStatus: 'active' }
]

/** Frozen clock and Manila time; one signed-in member with two doses due at 09:00. `extra` seeds more rows before the reload that makes live queries see them. */
async function open(page: Page, scheme: 'light' | 'dark', w: number, hash: string, extra: (p: Page) => Promise<void> = async () => undefined) {
  await page.setViewportSize({ width: w, height: 844 })
  await page.clock.setFixedTime(FIXED)
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Mama' }, { personId: 'ma', displayName: 'Joy', handle: 'joy', provider: 'pin' }])))
  await mock(page)
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('/#today')
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible() // the app has created its databases
  await seed(page, 'bantay-log', 'medications', MEDS)
  await extra(page)
  await page.goto('/#' + hash)
  await page.reload() // raw IndexedDB writes do not notify live queries
}

test.use({ timezoneId: 'Asia/Manila' })

for (const w of [360, 390]) {
  test(`Today at ${w}px: the Taken pill and the Jack button never overlap`, async ({ page }) => {
    await open(page, 'light', w, 'today')
    const taken = page.getByRole('button', { name: 'Taken' }).first()
    await expect(taken).toBeVisible()
    const jack = page.locator('.sh-jackfab')
    await expect(jack).toBeVisible()
    const apart = async () => {
      const a = (await taken.boundingBox())!
      const j = (await jack.boundingBox())!
      return a.x + a.width <= j.x || j.x + j.width <= a.x || a.y + a.height <= j.y || j.y + j.height <= a.y
    }
    await taken.scrollIntoViewIfNeeded()
    expect(await apart(), 'Taken pill after scrollIntoView').toBe(true)
    await page.evaluate(() => { const m = document.querySelector('main.scroll') as HTMLElement; m.scrollTop = 0 })
    expect(await apart(), 'Taken pill at the top').toBe(true)
    await page.evaluate(() => { const m = document.querySelector('main.scroll') as HTMLElement; m.scrollTop = m.scrollHeight })
    await page.waitForTimeout(300)
    const last = await page.evaluate(() => {
      const m = document.querySelector('main.scroll') as HTMLElement
      const j = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
      const bottom = Math.max(...Array.from(m.querySelectorAll<HTMLElement>('*')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).position !== 'fixed' }).map((e) => e.getBoundingClientRect().bottom))
      return { bottom, top: j.top }
    })
    expect(last.bottom, 'last item of Today ends above Jack').toBeLessThanOrEqual(last.top)
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`today-full: five tabs and Jack ${scheme}`, async ({ page }) => {
    await open(page, scheme, 390, 'today')
    await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button')).toHaveCount(5)
    await expect(page.locator('.sh-jackfab')).toBeVisible()
    await page.waitForTimeout(600)
    await shot(page, 'today-full', scheme)
  })

  test(`learn-home: Discover shell ${scheme}`, async ({ page }) => {
    await open(page, scheme, 390, 'discover')
    await expect(page.getByRole('heading', { level: 1, name: 'Discover' })).toBeVisible()
    await expect(page.getByTestId('pick')).toBeVisible() // S16: the Discover root is the pick hero, the season row and five tiles; Learn is its own sub
    await expect(page.getByTestId('discover-tiles').getByRole('link')).toHaveCount(5)
    await page.waitForTimeout(600)
    await shot(page, 'learn-home', scheme)
  })

  test(`start-approve-req: PIN approval sheet over Health ${scheme}`, async ({ page }) => {
    const row = { id: 'a1', personId: 'ma', kind: 'pin_approve', template: 'pin_approve', ref: 'req-1', createdAt: '2026-10-27T08:45:00+08:00', pushedAt: null, seenAt: null, expiresAt: '2026-10-28T08:45:00+08:00' }
    await open(page, scheme, 390, 'health', (p) => seed(p, 'bantay-alerts', 'alerts', [row]))
    await expect(page.getByRole('dialog', { name: /Joy wants a new PIN/ })).toBeVisible()
    await page.waitForTimeout(600)
    await shot(page, 'start-approve-req', scheme)
  })

  test(`simple-today: no Jack, no tab bar ${scheme}`, async ({ page }) => {
    await open(page, scheme, 390, 'today', (p) => seed(p, 'bantay', 'kv', [{ key: 'mode.simple', value: true }, { key: 'sos.contacts', value: [{ name: 'Ate Joy', phone: '+63 917 123 4567' }] }]))
    await expect(page.getByRole('button', { name: 'I took it' })).toBeVisible()
    await expect(page.locator('.sh-jackfab')).toHaveCount(0)
    await expect(page.locator('.bt[data-simple] .tabbar')).toBeHidden()
    await page.waitForTimeout(600)
    await shot(page, 'simple-today', scheme)
  })
}
