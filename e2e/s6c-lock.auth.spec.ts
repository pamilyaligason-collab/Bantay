import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S6c shots + checks (390x844, light and dark): start-finger, safety-medid (lock variant), start-me, start-privacy, start-update.
// Runs on the auth build (project "auth"): a stored session, a faked Android Capacitor bridge, every Supabase call mocked. Synthetic people only.
declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = 'docs/session-10/shots/S6c'
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const FAMILY = [{ personId: 'p-mama', displayName: 'Mama', handle: 'mama', provider: 'pin', initials: 'M' }, { personId: 'p-lola', displayName: 'Lola', handle: null, provider: 'pin', initials: 'L' }]
const LATEST = { versionCode: 2001000, versionName: '2.1.0', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.1.0/b.apk', sha256: 'a'.repeat(64), size: 14_680_064, minShell: 2000000, notes: 'Text size now scales every screen. Fixes for medicine alarms on Xiaomi phones.' }

async function setup(page: Page, o: { lock: boolean; admin?: boolean; callPerm?: 'granted' | 'denied' }) {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/user') return reply(200, user)
    if (url.pathname === '/rest/v1/rpc/ensure_self_person') return reply(200, '44444444-4444-4444-8444-444444444444')
    if (url.pathname === '/rest/v1/carers') return reply(200, url.searchParams.get('carer_id') ? [{ person_id: 'p-lola' }] : [{ carer_id: 'u-papa' }, { carer_id: 'u-joy' }]) // Mama looks after Lola; Papa and Ate Joy look after Mama
    if (url.pathname === '/rest/v1/people' && url.searchParams.get('auth_user_id')?.startsWith('in.')) return reply(200, [{ display_name: 'Papa' }, { display_name: 'Ate Joy' }])
    if (url.pathname === '/rest/v1/people') return reply(200, { id: 'p-mama', display_name: 'Mama', consent_at: '2026-10-26T01:00:00Z' })
    if (url.pathname === '/rest/v1/app_roles') return reply(200, { role: o.admin ? 'admin' : 'member', handle: 'mama' })
    if (url.pathname.startsWith('/rest/v1/')) return reply(200, [])
    return reply(404, {})
  })
  await page.route('**/latest.json', (r) => r.fulfill({ json: LATEST }))
  await skipOnboarding(page)
  await page.addInitScript(([session, fam, lock, perm]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify(session))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    localStorage.setItem('bantay.lastPerson', 'p-mama')
    if (lock) localStorage.setItem('bantay.passkey.p-mama', '1')
    // A faked Android bridge: Capacitor sees an android platform and these native plugin headers. The fingerprint prompt never answers, so the lock stays up.
    const never = () => new Promise(() => {})
    const handlers: Record<string, (o?: unknown) => Promise<unknown>> = {
      'Biometric.status': async () => ({ available: true, enrolled: true }),
      'Biometric.prompt': never,
      'AppUpdater.info': async () => ({ versionCode: 2000000, versionName: '2.0.0', canInstall: true }),
      'Call.checkPermission': async () => ({ state: perm ?? 'granted' }),
      'Call.requestPermission': async () => ({ state: 'granted' })
    }
    const names = [...new Set(Object.keys(handlers).map((k) => k.split('.')[0]))]
    ;(window as unknown as { androidBridge: unknown }).androidBridge = { postMessage() {} }
    ;(window as unknown as { Capacitor: unknown }).Capacitor = {
      PluginHeaders: names.map((n) => ({ name: n, methods: Object.keys(handlers).filter((k) => k.startsWith(`${n}.`)).map((k) => ({ name: k.split('.')[1], rtype: 'promise' })) })),
      nativePromise: (p: string, m: string, opts?: unknown) => (handlers[`${p}.${m}`] ?? (async () => ({})))(opts)
    }
  }, [{ access_token: jwt(), refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }, FAMILY, o.lock, o.callPerm ?? null] as const)
}

const seedKv = (page: Page, rows: { key: string; value: unknown }[]) =>
  page.evaluate(async (list) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('kv', 'readwrite')
        for (const r of list) tx.objectStore('kv').put(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, rows)

const MEDID = { key: 'medid.cache', value: { personId: 'p-mama', at: 1, card: { name: 'Mama', age: 68, bloodType: 'O+', allergies: ['Penicillin'], conditions: ['High blood pressure', 'diabetes'], medicines: ['Losartan 50 mg'], calls: [{ name: 'Papa', phone: '0917 123 4567' }, { name: 'Ate Joy', phone: '0917 765 4321' }], missing: [] } } }
const FORECAST = { key: 'weather.forecast.6.2,125.19', value: { fetchedAt: new Date().toISOString(), tz: 'Asia/Manila', utcOffset: 28800, current: { time: '', temp: 31, humidity: 70, feels: 36, code: 2, wind: 10, gust: 20, uv: 6 }, hourly: Array.from({ length: 24 }, (_, i) => ({ time: `${new Date(Date.now() + 28800_000).toISOString().slice(0, 10)}T${String(i).padStart(2, '0')}:00`, temp: 30, prob: i >= 15 ? 80 : 10, code: 3 })), daily: [] } }

for (const scheme of ['light', 'dark'] as const) {
  test(`fingerprint lock and its Medical ID ${scheme}`, async ({ page }) => {
    await setup(page, { lock: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(page.getByText('Touch the fingerprint sensor')).toBeVisible()
    await seedKv(page, [MEDID, FORECAST])
    await page.reload()
    await expect(page.getByText('Touch the fingerprint sensor')).toBeVisible()
    await expect(page.getByText(/31° partly cloudy/)).toBeVisible()
    await expect(page.getByText('Conel, General Santos City')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Magandang .*, Mama/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Not Mama?' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
    await page.screenshot({ path: `${SHOTS}/start-finger-${scheme}.png` })
    await page.getByRole('button', { name: 'Medical ID' }).click()
    await expect(page.getByText('Penicillin')).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText(/O\+|Losartan/)
    await page.screenshot({ path: `${SHOTS}/safety-medid-lock-${scheme}.png` })
  })

  test(`Me, update sheet ${scheme}`, async ({ page }) => {
    await setup(page, { lock: false, admin: true, callPerm: 'denied' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#me')
    await expect(page.getByRole('heading', { name: 'Me' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Privacy/ })).toHaveAttribute('href', '#privacy')
    await expect(page.getByText(/Hold for help can (call for you|no longer call for you)/)).toHaveCount(1) // one row or the other, never both
    await expect(page.getByText('Family admin tools')).toBeVisible()
    await expect(page.getByRole('link', { name: /Lola/ })).toHaveAttribute('href', '#family/people/p-lola')
    await page.screenshot({ path: `${SHOTS}/start-me-${scheme}.png` })
    await page.getByRole('link', { name: /Privacy/ }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/start-me-rows-${scheme}.png` })
    await page.getByRole('button', { name: 'Check for updates' }).click()
    await expect(page.getByRole('dialog', { name: 'Update Bantay to 2.1.0' })).toBeVisible()
    await expect(page.getByText('You have 2.0.0 · 14 MB · Wi-Fi recommended')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Install update' })).toBeEnabled()
    await page.screenshot({ path: `${SHOTS}/start-update-${scheme}.png` })
  })

  test(`Me as a member ${scheme}`, async ({ page }) => {
    await setup(page, { lock: false })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#me')
    await expect(page.getByRole('heading', { name: 'Me' })).toBeVisible()
    await expect(page.getByText('Family admin tools')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Check for updates' })).toHaveCount(0)
    await page.getByText(/^Bantay 2\.0\.0$/).scrollIntoViewIfNeeded()
    await expect(page.getByText(/^Bantay 2\.0\.0$/)).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/start-me-member-${scheme}.png` })
  })

  // Needs the Privacy route (hook lines in App.tsx and routes.ts, added by the orchestrator): `S6C_ROUTE=1` once they are in.
  test(`privacy ${scheme}`, async ({ page }) => {
    await setup(page, { lock: false })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#privacy')
    await expect(page.getByText('Agreed when you joined, 26 Oct')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Use AI for Jack and photos' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Pick what the family sees in Me. Admins can see everything.')).toBeVisible() // names need a member-readable source (S6c needs)
    await expect(page.getByText('Where your data goes')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/start-privacy-${scheme}.png` })
    await page.getByText('Where your data goes').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/start-privacy-where-${scheme}.png` })
  })
}
