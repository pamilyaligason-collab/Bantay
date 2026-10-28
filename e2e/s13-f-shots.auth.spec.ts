import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 13 lane F shots (Family): people (ring mix), I'm OK before/after, Learn together, a sheet mid-drag, plan empty. 390x844, light and dark.
// The clock is frozen (Tue 27 Oct 2026, 10:20 local) and the data is invented, so a rerun writes the same pixels (ML-32).
declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = process.env.S13_SHOTS // shots are written only when S13_SHOTS=docs/session-13/shots/F is set, so a gate rerun leaves the tree clean (ML-32); raster edges differ by a few pixels run to run
const NOW = new Date(2026, 9, 27, 10, 20, 0)
test.use({ viewport: { width: 390, height: 844 } })

const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Mama' }, { id: 'ma', display_name: 'Ate Joy' }, { id: 'pa', display_name: 'Papa Ben' }, { id: 'lo', display_name: 'Lola Remy' }]
type Row = Record<string, unknown>

async function mock(page: Page) {
  const rpc: string[] = []
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
    if (t === 'carers') return reply([{ person_id: 'ma' }, { person_id: 'pa' }, { person_id: 'lo' }])
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
const at = (h: number, m: number) => new Date(2026, 9, 27, h, m, 0).toISOString()
async function shot(page: Page, name: string, scheme: string, anchor?: string) {
  if (!SHOTS) return
  if (anchor) await page.locator(anchor).evaluate((el) => { (el as HTMLElement).style.scrollMarginTop = '84px'; el.scrollIntoView({ block: 'start' }) })
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.waitForTimeout(900) // shortcut: lets the springIn and pill transitions land; a pixel-stable shot needs a still page
  await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, animations: 'disabled' })
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Mama' }, { personId: 'ma', displayName: 'Ate Joy' }, { personId: 'pa', displayName: 'Papa Ben' }, { personId: 'lo', displayName: 'Lola Remy' }])))
      await mock(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' })
      await page.clock.setFixedTime(NOW)
      await page.goto('/#family')
      await expect(page.locator('h1')).toHaveText('Family')
      await seed(page, 'bantay-health', 'readings', [{ id: 1, personId: 'lo', takenAt: at(7, 40), test: 'bp_systolic', value: 150, unit: 'mmHg' }, { id: 2, personId: 'lo', takenAt: at(7, 40), test: 'bp_diastolic', value: 95, unit: 'mmHg' }])
      await seed(page, 'bantay-log', 'activity', [{ personId: 'pa', kind: 'check-in', minutes: null, steps: null, startedAt: at(6, 55), source: 'manual' }, { personId: 'lo', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' }])
      await page.reload()
      await expect(page.getByRole('button', { name: /^Papa Ben, OK / })).toBeVisible()
    })

    test('people: rings, I\'m OK before and after, learn together', async ({ page }) => {
      await expect(page.getByRole('button', { name: /^Lola Remy,.*Needs a look/ })).toBeVisible()
      await shot(page, 'people-before', scheme)
      const ring = await page.locator('.fm-bubble[data-k="ok"] .fm-av').first().evaluate((e) => getComputedStyle(e).boxShadow)
      expect(ring).toContain('0px 0px 0px 5px') // the 5px outer ring
      await page.getByRole('button', { name: "I'm OK", exact: true }).click()
      await expect(page.getByText(/^You're OK · /)).toBeVisible()
      await shot(page, 'im-ok-after', scheme)
      await expect(page.getByText("Today's check-in")).toHaveCount(0) // the card turns into You're OK and stays
      await shot(page, 'people-after', scheme)
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 }) // the note clears itself; a shot must not catch it
      await expect(page.getByTestId('learn-hub')).toBeVisible()
      await shot(page, 'learn-together', scheme, '[data-testid="learn-hub"]')
    })

    test('sheet: mid-drag follows the pointer, a long drag closes it', async ({ page }) => {
      await page.getByRole('button', { name: 'Plan' }).click()
      await expect(page.getByText(/^Add a reminder for /)).toBeVisible()
      await shot(page, 'plan-empty', scheme)
      await page.getByRole('button', { name: 'Add', exact: true }).first().click()
      const dlg = page.getByRole('dialog')
      await expect(dlg).toBeVisible()
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
      const zone = (await page.locator('.fm-grab-zone').boundingBox())!
      const x = zone.x + zone.width / 2, y = zone.y + 16
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y + 40, { steps: 4 })
      await page.mouse.move(x, y + 120, { steps: 6 })
      expect(await dlg.evaluate((e) => (e as HTMLElement).style.transform)).toBe('translateY(120px)') // 1:1, no lag
      await shot(page, 'sheet-drag', scheme)
      await page.waitForTimeout(150) // held still: no momentum left
      await page.mouse.up() // 120 px of ~480, standing still: springs back
      await expect(dlg).toHaveJSProperty('style.transform', '')
      await expect(dlg).toBeVisible()
      await page.waitForTimeout(350) // the spring-back (280 ms) has landed
      await page.mouse.move(x, zone.y + 16)
      await page.mouse.down()
      await page.mouse.move(x, zone.y + 16 + 300, { steps: 12 })
      await page.mouse.up()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  })
}
